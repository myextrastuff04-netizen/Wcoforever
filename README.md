# Wcoforever - Stremio addon integration (best-effort)

This branch implements a best-effort integration with wcoforever.net to provide catalog, meta, and proxied stream endpoints for in-app playback.

Important legal note
- You confirmed you own redistribution rights. This code expects you to operate within those rights. Do not use this code to infringe copyright.

Environment variables
- WCOFOREVER_COOKIE (optional): if wcoforever requires a session cookie to access streams, set it here.
- WCOFOREVER_REFERER (optional): Referer header to include for upstream requests.
- ADDON_BASE_URL (optional): If set to the public HTTPS base URL of this addon (e.g., https://my-addon.example.com), the addon will return absolute proxied stream URLs. Otherwise it returns relative proxy paths.
- PORT: server port (default 7000)

How it works (high level)
- Catalog: scrapes listing pages and returns series as catalog items.
- Meta: scrapes a series page and extracts episode links into seasons/episodes.
- Stream: when a client requests streams for an episode id, the addon will attempt to discover an HLS (.m3u8) or MP4 URL on the episode page or within iframes. If found, the addon returns a proxied URL (/proxy?url=...) that streams the content through this server so the client plays in-app.

Run locally
1. git checkout feature/integrate-wcoforever
2. npm install
3. (optional) export WCOFOREVER_COOKIE="your_cookie_here"
4. export ADDON_BASE_URL="https://your-public-host"   # optional, useful when deployed
5. npm start

Expose to the internet (for testing in Stremio/Nuvio)
- Use ngrok: `ngrok http 7000` and use the returned https URL as ADDON_BASE_URL when running the server, then register https://{ngrok-host}/manifest.json in your client.

Notes and caveats
- This is a best-effort scraper. Some pages may use JS-obfuscated players or third-party hosts that require additional handling (headless browser). If streams are not found, I can add puppeteer-based extraction.
- Proxying streams will use bandwidth on the host that runs this addon. Ensure adequate bandwidth for playback.

Permission statement (recorded):
"I confirm I have the rights to access and redistribute content from wcoforever.net via this addon."
