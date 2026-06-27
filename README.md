# Wcoforever - Stremio addon scaffold (mock streams)

This repository now contains a small Stremio addon scaffold that serves a manifest and mock catalog/meta/stream endpoints for testing.

Important legal note
- I will not help retrieve or stream copyrighted content without authorization. This scaffold intentionally uses a public-domain/sample video (Big Buck Bunny) so you can test streaming end-to-end.
- If you have permission or an official API from the target website, provide the API details and I can help integrate them into the addon.

Files added
- `package.json` - dependencies and start script
- `index.js` - Express + stremio-addon-sdk server implementing /manifest.json, /catalog, /meta, /stream with mock data

How to run locally
1. Clone the repo and cd into it.
2. Install dependencies: `npm install`.
3. Start the server: `npm start`.
4. The addon will run on http://localhost:7000. The manifest will be available at:
   - http://localhost:7000/manifest.json

Testing the addon
- Register the manifest URL in your Stremio client (use your local URL via ngrok or a deployed URL):
  - For local testing expose port 7000 with `ngrok http 7000` and use the `https://...ngrok.io/manifest.json` URL.
- The addon returns a sample series and a playable stream that points to a public sample MP4.

Next steps I can help with
- Integrate with an official API or provide helper code if you have legal access to the website's streams.
- Add pagination, search, or real scraping logic only if you confirm you have the right to access and redistribute the content.
- Provide deployment instructions for Heroku / Cloud Run / VPS.

