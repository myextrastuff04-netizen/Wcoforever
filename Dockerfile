FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund

# Bundle app source
COPY . .

ENV PORT=7000
EXPOSE 7000

CMD ["npm", "start"]
