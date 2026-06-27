const fs = require('fs');
const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const NodeCache = require('node-cache');
const scraper = require('./lib/wcoScraper');
const { URL } = require('url');

const manifest = JSON.parse(fs.readFileSync('./manifest.json'));
const builder = new addonBuilder(manifest);
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// Catalog handler: scrape listing pages
builder.defineCatalogHandler(async (args) => {
  try {
    const search = args.extra && args.extra.search ? args.extra.search.value : '';
    const skip = parseInt(args.extra && args.extra.skip ? args.extra.skip.value : '0');
    const cacheKey = `catalog:${search}:${skip}:${args.type}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const listingUrls = [
      'https://www.wcoforever.net/cartoon-list',
      'https://www.wcoforever.net/anime-list',
      'https://www.wcoforever.net/cartoon-list?page=2'
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

// Meta handler: return seasons/episodes for series ids
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

      // id format produced earlier: wcoforever_series_<slug_path>
      const parts = id.split('_');
      const slug = parts.slice(3).join('/'); // restore path parts
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

// Stream handler: resolve playable upstream and return proxied stream URL
builder.defineStreamHandler(async (args) => {
  try {
    const id = args.id || (args.ids && args.ids[0]);
    if (!id) return { streams: [] };

    const cacheKey = `stream:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return { streams: cached };

    // episode id format: wcoforever_episode_<path_parts_joined_by_underscore>
    const parts = id.split('_');
    const slug = parts.slice(2).join('/'); // reconstruct path
    const episodeUrl = `https://www.wcoforever.net/${slug}`;

    let playable = null;
    try {
      const page = await scraper.fetchWithLimiter(episodeUrl);
      playable = await scraper.findPlayableOnPage(page.data, episodeUrl);

      if (!playable) {
        const iframeSrc = scraper.findFirstIframeSrc(page.data, episodeUrl);
        if (iframeSrc) {
          try {
            const iframePage = await scraper.fetchWithLimiter(iframeSrc);
            playable = await scraper.findPlayableOnPage(iframePage.data, iframeSrc);
          } catch (e) {
            // ignore
          }
        }
      }

      // Puppeteer fallback if still not found
      if (!playable) {
        playable = await scraper.findPlayableWithPuppeteer(episodeUrl);
        if (!playable) {
          const iframeSrc = scraper.findFirstIframeSrc(page.data, episodeUrl);
          if (iframeSrc) playable = await scraper.findPlayableWithPuppeteer(iframeSrc);
        }
      }
    } catch (e) {
      console.warn('Stream resolution failed for', episodeUrl, e.message);
    }

    if (!playable) return { streams: [] };

    // Normalize absolute playable URL
    if (!/^https?:\/\//i.test(playable)) {
      playable = new URL(playable, episodeUrl).href;
    }

    const addonBase = (process.env.ADDON_BASE_URL || '').replace(/\/$/, '');
    const streamPath = `/proxy?url=${encodeURIComponent(playable)}`;
    const streamUrl = addonBase ? (addonBase + streamPath) : streamPath;

    const streams = [{
      title: 'Wcoforever - proxied stream',
      url: streamUrl,
      quality: 'HD',
      isRemote: true
    }];

    cache.set(cacheKey, streams, 60); // short cache for stream urls
    return { streams };
  } catch (err) {
    console.error('Stream handler error', err);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();
const app = express();
app.use(express.json());

// Serve manifest from running server
app.get('/manifest.json', (req, res) => res.json(manifest));

// Mount stremio addon endpoints
app.use('/', addonInterface);

// Debug resolve endpoint: returns discovered playable upstream URL
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
    if (!playable) playable = await scraper.findPlayableWithPuppeteer(episodeUrl);
    if (!playable) return res.status(404).json({ error: 'No playable URL found' });
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
    if (!/^https?:\/\//i.test(target)) return res.status(400).send('invalid url');

    const headers = {};
    if (process.env.WCOFOREVER_COOKIE) headers['Cookie'] = process.env.WCOFOREVER_COOKIE;
    if (process.env.WCOFOREVER_REFERER) headers['Referer'] = process.env.WCOFOREVER_REFERER;

    const upstream = await axios.get(target, {
      responseType: 'stream',
      headers,
      timeout: 20000,
      maxRedirects: 5
    });

    if (upstream.headers['content-type']) res.setHeader('content-type', upstream.headers['content-type']);
    if (upstream.headers['content-length']) res.setHeader('content-length', upstream.headers['content-length']);

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
app.listen(PORT, () => console.log(`Wcoforever addon running on port ${PORT}`));

module.exports = app;
