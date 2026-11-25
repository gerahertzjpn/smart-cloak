# Cloud Run 用のコンテナ。サーバー（backend）と画面（frontend）を1つにまとめる。
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# 依存パッケージ（package.json が変わらなければキャッシュされる）
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend/src backend/src
COPY frontend frontend
COPY db db

USER node
EXPOSE 8080
CMD ["node", "backend/src/server.js"]
