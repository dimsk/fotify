# syntax=docker/dockerfile:1

# Shared base for anything that needs to compile native modules
# (better-sqlite3, sharp) — built once, reused by both branches below.
FROM node:20-bookworm-slim AS base-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  python3 \
  ca-certificates \
  libheif-dev libheif-examples libde265-0 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./

# Production-only dependencies, with native modules compiled — this is the
# slow step, so keeping it in its own stage means it's skipped entirely on
# rebuilds where package*.json hasn't changed, and a BuildKit npm cache mount
# means even a changed lockfile doesn't re-download everything from scratch.
FROM base-builder AS deps
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

# Full install (incl. devDependencies) + TypeScript build. Discarded after
# this stage — none of this (tsc, ts-node, jest, eslint, source .ts files)
# ends up in the final image.
FROM base-builder AS build
RUN --mount=type=cache,target=/root/.npm \
  npm ci
COPY . .
RUN npm run build

# Final image: no build-essential/python3/gcc, no devDependencies — only the
# compiled output and the production node_modules built above.
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
  libheif1 libde265-0 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data

EXPOSE 15765
ENV PORT=15765
ENV FOTIFY_DATA_DIR=/app/data

CMD ["node", "dist/main"]
