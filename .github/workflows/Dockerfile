FROM node:18-bullseye-slim

Install dependencies for Puppeteer/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends
ca-certificates
fonts-liberation
wget
gnupg
libx11-xcb1
libxcomposite1
libxdamage1
libxrandr2
libasound2
libatk-bridge2.0-0
libgtk-3-0
libpangocairo-1.0-0
libnss3
libxss1
libgbm1
&& rm -rf /var/lib/apt/lists/*

Install Chromium from Debian repositories
RUN apt-get update && apt-get install -y --no-install-recommends chromium
&& rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

Create app directory
WORKDIR /usr/src/app

Install app dependencies
COPY package.json package-lock.json* ./ RUN npm ci --production --no-audit --no-fund

Bundle app source
COPY . .

ENV PORT=7000 EXPOSE 7000

CMD ["npm", "start"]
