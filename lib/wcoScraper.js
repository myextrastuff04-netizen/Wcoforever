const axios = require('axios');
const cheerio = require('cheerio');
const Bottleneck = require('bottleneck');
const { URL } = require('url');

// puppeteer is optional but used as a fallback for JS-generated players
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // Puppeteer not installed; fallbacks will still run
}

// rate limiter per host
const limiter = new Bottleneck({ maxConcurrent: 4, minTime: 250 });

async function fetchWithLimiter(url, opts = {}) {
  return limiter.schedule(() => fetchRaw(url, opts));
}

async function fetchRaw(url, opts = {}) {
  const headers = opts.headers || {};
  // optionally add cookie from env
  if (process.env.WCOFOREVER_COOKIE) headers['Cookie'] = process.env.WCOFOREVER_COOKIE;
  if (process.env.WCOFOREVER_REFERER) headers['Referer'] = process.env.WCOFOREVER_REFERER;
  return axios.get(url, { headers, timeout: 15000, maxRedirects: 5 });
}

function parseListingForSeries(html, baseUrl, searchText = '') {
  const $ = cheerio.load(html);
  const anchors = $('a');
  const results = [];
  const seen = new Set();

  anchors.each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text) return;

    // Heuristic: link contains 'episode' or '/anime/' or looks like a slug
    if (/episode|\/watch\/|anime|\-episode\-/i.test(href) || /-episode-/i.test(href)) {
      try {
        const url = new URL(href, baseUrl).pathname.replace(/^\//, '');
        const id = `wcoforever_series_${url.replace(/\//g, '_')}`;
        if (seen.has(id)) return;
        if (searchText && !text.toLowerCase().includes(searchText.toLowerCase())) return;
        seen.add(id);
        results.push({ id, title: text, url: new URL(href, baseUrl).href });
      } catch (e) {
        // ignore
      }
    }
  });

  return results;
}

function parseSeriesPageForMeta(html, pageUrl, id) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim() || id;
  const episodes = [];

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const txt = $(el).text().trim();
    if (!href) return;
    if (/episode|watch|-episode-/i.test(href)) {
      try {
        const epUrl = new URL(href, pageUrl).pathname.replace(/^\//, '');
        const epId = `wcoforever_episode_${epUrl.replace(/\//g, '_')}`;
        episodes.push({ id: epId, title: txt || epId, url: new URL(href, pageUrl).href });
      } catch (e) {}
    }
  });

  // sort and dedupe by id
  const dedup = {};
  for (const e of episodes) dedup[e.id] = e;
  const eps = Object.values(dedup);

  // Build stremio meta with seasons/episodes
  const meta = {
    id,
    type: 'series',
    name: title,
    posters: [],
    videos: [],
    streams: [],
  };

  const seasons = {};
  seasons['1'] = eps.map((ep, idx) => ({
    id: ep.id,
    name: ep.title || `Episode ${idx+1}`,
    season: 1,
    episode: idx + 1
  }));

  meta.seasons = seasons;
  meta.poster = $('img').first().attr('src') || null;
  meta.summary = $('meta[name="description"]').attr('content') || $('p').first().text().trim();

  return meta;
}

function findFirstIframeSrc(html, baseUrl) {
  const $ = cheerio.load(html);
  const iframe = $('iframe').first();
  if (!iframe) return null;
  const src = iframe.attr('src');
  if (!src) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch (e) {
    return null;
  }
}

async function findPlayableOnPage(html, baseUrl) {
  // Look for direct .m3u8 or .mp4 links inside the HTML
  const m = html.match(/https?:\\/\\/[^'"\s]+\.(m3u8|mp4)(\?[^'"\s]*)?/gi);
  if (m && m.length) return m[0];

  // Try to find <video> tags
  const $ = cheerio.load(html);
  const videoSrc = $('video source').attr('src') || $('video').attr('src');
  if (videoSrc) return new URL(videoSrc, baseUrl).href;

  // Look for JS objects that contain urls
  const jsMatch = html.match(/file\s*[:=]\s*['\"](https?:\\/\\/[^'\"]+\.(m3u8|mp4)[^'\"]*)['\"]/i);
  if (jsMatch && jsMatch[1]) return jsMatch[1];

  // No direct URL found
  return null;
}

async function findPlayableWithPuppeteer(pageUrl) {
  if (!puppeteer) return null;
  let browser = null;
  let found = null;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Set headers if cookies or referer provided
    if (process.env.WCOFOREVER_COOKIE) await page.setExtraHTTPHeaders({ Cookie: process.env.WCOFOREVER_COOKIE });
    if (process.env.WCOFOREVER_REFERER) await page.setExtraHTTPHeaders({ Referer: process.env.WCOFOREVER_REFERER });

    // Listen for network responses that look like media
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
          found = url;
        }
      } catch (e) {}
    });

    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Give a short additional wait for dynamic loads
    await page.waitForTimeout(2000);

    if (found) return found;

    // As fallback, try to read innerHTML and search
    const html = await page.content();
    const direct = await findPlayableOnPage(html, pageUrl);
    if (direct) return direct;

    return null;
  } catch (e) {
    console.warn('Puppeteer extraction failed', e.message);
    return null;
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
}

module.exports = {
  fetchWithLimiter,
  parseListingForSeries,
  parseSeriesPageForMeta,
  findPlayableOnPage,
  findFirstIframeSrc,
  findPlayableWithPuppeteer
};
