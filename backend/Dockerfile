FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

EXPOSE 4001

CMD ["npx", "tsx", "src/index.ts"]
