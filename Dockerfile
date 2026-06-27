# Use an official Node image
FROM node:18-bullseye-slim

# Install system packages required for Chromium and building native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    wget \
    gnupg \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libpangocairo-1.0-0 \
    libnss3 \
    libxss1 \
    libgbm1 \
    build-essential \
    python3 \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Install system Chromium (puppeteer-core can use this executable)
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

# Tell puppeteer-core to use the system Chromium and not try to download its own
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# App directory
WORKDIR /usr/src/app

# Copy package metadata first to take advantage of Docker layer caching
COPY package*.json ./

# Install node dependencies (use npm install to avoid npm ci lockfile problems)
# --unsafe-perm helps installs that require native build steps in Docker
RUN npm config set loglevel warn \
  && npm install --production --no-audit --no-fund --unsafe-perm

# Copy app source
COPY . .

# Expose port and set the default command
ENV PORT=7000
EXPOSE 7000
CMD ["npm", "start"]
