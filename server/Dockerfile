# 建置內容（context）為上一層 blindbox-shop/，以便一併打包前端靜態檔
#   docker build -f server/Dockerfile -t glimmer-shop ..
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/src ./src
COPY server/migrations ./migrations
# 前端靜態檔（SERVE_STATIC=true 時由 Node 提供）
COPY index.html .nojekyll /app/public/
COPY css /app/public/css
COPY js /app/public/js
COPY images /app/public/images

ENV PORT=3000 \
    BASE_PATH=/shop \
    STATIC_DIR=/app/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "src/index.js"]
