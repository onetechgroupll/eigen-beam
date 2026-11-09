# eigen.beam — single-process SvelteKit (adapter-node) image.
#
#   docker build -t eigen-beam .
#   docker run -p 3000:3000 -v eigenbeam-data:/data -e ORIGIN=http://localhost:3000 eigen-beam
#
# Without NODE_ENV=production the app runs in "minimal mode": decks and assets
# live on the /data volume, mail goes to a local outbox. For a public instance
# set NODE_ENV=production plus Postgres, S3 and mail; see docs/deployment.md.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g bun@1.3.14
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build \
 && rm -rf node_modules \
 && bun install --frozen-lockfile --production

FROM node:22-bookworm-slim
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=3000 \
    EB_DATA_DIR=/data \
    EB_ASSET_DIR=/data/assets \
    EB_FOLLOWS_FILE=/data/follows.json
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
