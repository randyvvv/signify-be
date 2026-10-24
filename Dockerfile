# Image untuk Google Cloud Run (juga jalan di Docker biasa).
# Build: docker build -t signify-api .   ·   Run: docker run -p 8080:8080 --env-file .env signify-api

# ---- Build: compile TypeScript ke dist/ ----
FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---- Runtime: hanya dependency produksi + hasil build + file migrasi ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PORT=8080
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 8080
# Sama seperti Railway: migrasi SQL dulu, baru server menyala.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
