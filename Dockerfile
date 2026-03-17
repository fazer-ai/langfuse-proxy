FROM oven/bun:1-alpine AS build

WORKDIR /app

# Cache packages installation
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

ENV NODE_ENV=production

# Compile backend to binary (target musl for Alpine)
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun-linux-x64-musl \
    --outfile server \
    src/index.ts

FROM oven/bun:1-alpine AS release

WORKDIR /app

# Copy compiled binary
COPY --from=build /app/server server
COPY --from=build /app/package.json package.json

RUN mkdir -p /app/logs && chown -R bun:bun /app/logs

EXPOSE 3000

CMD ["./server"]
