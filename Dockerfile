FROM oven/bun:1-alpine AS build

WORKDIR /app

# Cache packages installation
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# NOTE: Set a dummy DATABASE_URL for Prisma code generation
ENV DATABASE_URL="postgres://postgres:postgres@localhost:5432/dummy"
ENV NODE_ENV=production

ARG BUN_PUBLIC_CDN_URL=""
ENV BUN_PUBLIC_CDN_URL=$BUN_PUBLIC_CDN_URL

# Generate Prisma client
RUN bun prisma generate

# Build frontend assets (Tailwind CSS + React)
RUN bun run build

# Compile backend to binary (target musl for Alpine)
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun-linux-x64-musl \
    --outfile server \
    src/index.ts

# Install production dependencies only
FROM oven/bun:1-alpine AS prod-deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1-alpine AS release

WORKDIR /app

# Copy compiled binary
COPY --from=build /app/server server

# Copy production node_modules for Prisma runtime dependencies
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/generated generated

# Copy Prisma schema and migrations for runtime
COPY --from=build /app/prisma prisma
COPY --from=build /app/prisma.config.ts prisma.config.ts

# Copy built frontend assets
COPY --from=build /app/dist dist

# Copy scripts for database setup
COPY --from=build /app/scripts scripts
COPY --from=build /app/package.json package.json

RUN mkdir -p /app/logs && chown -R bun:bun /app/logs

EXPOSE 3000
