const fs = require('fs');
const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const NodeCache = require('node-cache');
const scraper = require('./lib/wcoScraper');

const manifest = JSON.parse(fs.readFileSync('./manifest.json'));
const builder = new addonBuilder(manifest);

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// Catalog: best-effort scrape from listing pages
builder.defineCatalogHandler(async (args) => {
  try {
    const search = args.extra && args.extra.search ? args.extra.search.value : '';
    const skip = parseInt(args.extra && args.extra.skip ? args.extra.skip.value : '0');

    // Use a small cache key
    const cacheKey = `catalog:${search}:${skip}:${args.type}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Best-effort: scrape the cartoon-list and anime listing
    const listingUrls = [
      'https://www.wcoforever.net/cartoon-list',
      'https://www.wcoforever.net/anime-list',
    ];

    const items = [];
    for (const url of listingUrls) {
      try {
        const res = await scraper.fetchWithLimiter(url);
        const found = scraper.parseListingForSeries(res.data, url, search);
        for (const f of found) items.push(f);
      } catch (e) {
        console.warn('Listing scrape failed for', url, e.message);
      }
    }

    // dedupe by id
    const dedup = {};
    for (const it of items) dedup[it.id] = it;
    const metas = Object.values(dedup).slice(skip, skip + 50).map(it => ({
      id: it.id,
      name: it.title,
      type: 'series',
      poster: it.poster || manifest.logo,
      genres: it.genres || [],
      releaseInfo: it.year || ''
    }));

    const result = { metas };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Catalog handler error', err);
    return { metas: [] };
  }
});

// Meta: given series id(s), return seasons/episodes
builder.defineMetaHandler(async (args) => {
  try {
    const ids = args.ids || (args.id ? [args.id] : []);
    const metas = [];
    for (const id of ids) {
      const cacheKey = `meta:${id}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        metas.push(cached);
        continue;
      }

      // id is a slug we produced: wcoforever_series_<slug>
      const parts = id.split('_');
      const slug = parts.slice(3).join('_');
      const seriesUrl = `https://www.wcoforever.net/${slug}/?season=all`;

      try {
        const res = await scraper.fetchWithLimiter(seriesUrl);
        const meta = scraper.parseSeriesPageForMeta(res.data, seriesUrl, id);
        cache.set(cacheKey, meta);
        metas.push(meta);
      } catch (e) {
        console.warn('Meta scrape failed for', seriesUrl, e.message);
      }
    }

    return { metas };
  } catch (err) {
    console.error('Meta handler error', err);
    return { metas: [] };
  }
});

// Stream handler: given id (episode id), resolve playable URL and return stream via proxy
builder.defineStreamHandler(async (args) => {
  try {
    const id = args.id || (args.ids && args.ids[0]);
    if (!id) return { streams: [] };

    const cacheKey = `stream:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return { streams: cached };

    // our episode id format: wcoforever_episode_<base64-or-slug>
    const parts = id.split('_');
    const slug = parts.slice(2).join('_'); // e.g., what-s-new-scooby-doo-episode-1-...
    const episodeUrl = `https://www.wcoforever.net/${slug}`;

    let playable = null;
    try {
      const page = await scraper.fetchWithLimiter(episodeUrl);
      playable = await scraper.findPlayableOnPage(page.data, episodeUrl);
      // if playable is an iframe that points to another host, follow it
      if (!playable) {
        // try to inspect iframes
        const iframeSrc = scraper.findFirstIframeSrc(page.data, episodeUrl);
        if (iframeSrc) {
          const iframePage = await scraper.fetchWithLimiter(iframeSrc);
          playable = await scraper.findPlayableOnPage(iframePage.data, iframeSrc);
        }
      }
    } catch (e) {
      console.warn('Stream resolution failed for', episodeUrl, e.message);
    }

    if (!playable) return { streams: [] };

    // Build a proxy URL that the client will call to get the stream
    // Use request host as base
    const proxyBase = (args && args.back && args.back.baseUrl) ? args.back.baseUrl : null;
    // Fallback: we'll set proxy path later when handling /stream via express route
    // Here, return a stream object with a placeholder URL; the express /stream route will be available.

    // We'll return a stream object pointing to /resolve?target=<encoded>
    const serverHost = process.env.ADDON_BASE_URL || null; // prefer env-set deployment base
    let resolvedUrl = playable;
    if (!/^https?:\/\//i.test(resolvedUrl)) {
      // make absolute
      const u = new URL(resolvedUrl, episodeUrl);
      resolvedUrl = u.href;
    }

    // For stremio streaming, we return a stream object pointing to our /proxy endpoint
    const streamUrlPath = `/proxy?url=${encodeURIComponent(resolvedUrl)}`;
    const streamUrl = serverHost ? (serverHost.replace(/\/$/, '') + streamUrlPath) : streamUrlPath;

    const streams = [
      {
        title: 'Wcoforever - proxied stream',
        url: streamUrl,
        quality: 'HD',
        isRemote: true
      }
    ];

    cache.set(cacheKey, streams, 60); // short cache
    return { streams };
  } catch (err) {
    console.error('Stream handler error', err);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();
const app = express();

app.use(express.json());

// Serve manifest
app.get('/manifest.json', (req, res) => res.json(manifest));

// Mount stremio addon endpoints
app.use('/', addonInterface);

// Resolve helper: returns the direct playable URL (for debugging)
app.get('/resolve', async (req, res) => {
  const episodeUrl = req.query.episodeUrl;
  if (!episodeUrl) return res.status(400).send('episodeUrl required');
  try {
    const page = await scraper.fetchWithLimiter(episodeUrl);
    let playable = await scraper.findPlayableOnPage(page.data, episodeUrl);
    if (!playable) {
      const iframeSrc = scraper.findFirstIframeSrc(page.data, episodeUrl);
      if (iframeSrc) {
        const iframePage = await scraper.fetchWithLimiter(iframeSrc);
        playable = await scraper.findPlayableOnPage(iframePage.data, iframeSrc);
      }
    }
    if (!playable) return res.status(404).send('No playable URL found');
    res.json({ playable });
  } catch (e) {
    console.error('Resolve error', e);
    res.status(500).send('error');
  }
});

// Proxy endpoint: streams the target URL through this server
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    // Basic safety: only allow http(s)
    if (!/^https?:\/\//i.test(target)) return res.status(400).send('invalid url');

    const headers = {};
    // Optionally forward cookie from env
    if (process.env.WCOFOREVER_COOKIE) headers['Cookie'] = process.env.WCOFOREVER_COOKIE;
    if (process.env.WCOFOREVER_REFERER) headers['Referer'] = process.env.WCOFOREVER_REFERER;

    const upstream = await axios.get(target, {
      responseType: 'stream',
      headers,
      timeout: 20000,
      maxRedirects: 5
    });

    // Pass content-type and other useful headers
    if (upstream.headers['content-type']) res.setHeader('content-type', upstream.headers['content-type']);
    if (upstream.headers['content-length']) res.setHeader('content-length', upstream.headers['content-length']);

    // Pipe upstream to client
    upstream.data.pipe(res);
    upstream.data.on('error', (err) => {
      console.error('Upstream stream error', err);
      try { res.end(); } catch (e) {}
    });
  } catch (err) {
    console.error('Proxy error for', target, err.message);
    res.status(502).send('Bad gateway');
  }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Wcoforever addon (feature/integrate-wcoforever) running on port ${PORT}`));

module.exports = app;
