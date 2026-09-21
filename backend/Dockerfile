FROM node:18-alpine

WORKDIR /app

# ttf-dejavu: fonte usada pelo drawtext do ffmpeg na marca d'agua.
RUN apk add --no-cache ffmpeg tzdata ttf-dejavu

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV TZ=America/Fortaleza

EXPOSE 4001

CMD ["npx", "tsx", "src/index.ts"]
