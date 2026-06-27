Deployment instructions

1) Deploy to Render (recommended for simplicity):
   - Go to https://render.com and create an account.
   - Create a new "Web Service" and connect your GitHub repo `myextrastuff04-netizen/Wcoforever`.
   - Choose the `feature/integrate-wcoforever` branch, or merge to main and deploy from main.
   - Render will auto-detect Node; set the build command to `npm install` and start command to `npm start`.
   - Set the following Environment Variables in Render's dashboard:
     - ADDON_BASE_URL = https://<your-render-service>.onrender.com
     - (optional) WCOFOREVER_COOKIE = <your_session_cookie_if_needed>
     - (optional) WCOFOREVER_REFERER = https://www.wcoforever.net
   - Deploy. The service will be available at https://<your-render-service>.onrender.com and the manifest URL will be:
     - https://<your-render-service>.onrender.com/manifest.json

2) Deploy to Google Cloud Run:
   - Build a Docker image (Dockerfile included) and push to a registry (e.g., Google Container Registry or GitHub Container Registry).
   - Deploy the image to Cloud Run, allowing unauthenticated invocations.
   - Set environment variables in the Cloud Run service (ADDON_BASE_URL, WCOFOREVER_COOKIE if needed).
   - Use the service URL + /manifest.json as the manifest URL to register in Nuvio/Stremio.

3) Local testing (quick):
   - git checkout feature/integrate-wcoforever
   - npm install
   - export ADDON_BASE_URL="https://{your-ngrok-host}"
   - npm start
   - ngrok http 7000
   - Use https://{ngrok-host}/manifest.json as the manifest URL in your client.

I have added a Dockerfile and Render config to the repo so you can deploy the addon and get a public HTTPS manifest URL. If you want, I can open a PR from the feature branch to main or add a GitHub Action that builds and publishes a Docker image to GitHub Container Registry; tell me which and I will add it.
