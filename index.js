const fs = require('fs');
const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');

// Load manifest (already in repo root)
const manifest = JSON.parse(fs.readFileSync('./manifest.json'));

const builder = new addonBuilder(manifest);

// Catalog handler: returns mock metas for testing
builder.defineCatalogHandler((args) => {
  const type = args.type || 'series';
  const metas = [
    {
      id: `wcoforever_sample_${type}_1`,
      type: type,
      name: 'Sample Series (Big Buck Bunny)',
      poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
      genres: ['Animation'],
      releaseInfo: '2008'
    }
  ];
  return Promise.resolve({ metas });
});

// Meta handler: returns metadata for requested ids
builder.defineMetaHandler((args) => {
  const ids = args.ids || (args.id ? [args.id] : []);
  const metas = ids.map(id => ({
    id: id,
    type: 'series',
    name: 'Sample Series (Big Buck Bunny)',
    poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    description: 'A public-domain sample video used for testing the addon scaffolding.',
  }));
  return Promise.resolve({ metas });
});

// Stream handler: returns a playable stream URL (legal sample video)
builder.defineStreamHandler((args) => {
  // NOTE: This uses a public sample video hosted by Google for testing only.
  const streams = [
    {
      title: 'Big Buck Bunny (Sample)',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      quality: '720p',
      isRemote: true
    }
  ];
  return Promise.resolve({ streams });
});

const addonInterface = builder.getInterface();

const app = express();

// Serve manifest from the repo as well
app.get('/manifest.json', (req, res) => res.json(manifest));

// mount the stremio addon interface (handles /catalog, /meta, /stream)
app.use('/', addonInterface);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Wcoforever addon (mock) running on port ${PORT}`));
