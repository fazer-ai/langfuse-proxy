# langfuse-proxy

A transparent proxy that forwards OpenAI-compatible API requests to upstream LLM providers and sends telemetry to [Langfuse](https://langfuse.com) in the background. Zero latency overhead on the response path.

## Architecture

```
Consumer (OpenAI SDK)  ->  Proxy (/v1/*)  ->  Upstream Provider (OpenAI, etc.)
   base_url=proxy:3000       | (background, non-blocking)
                           Langfuse
```

**How it works:**

1. Consumer sends a standard OpenAI API request to the proxy
2. Proxy forwards it to the upstream provider (OpenAI by default)
3. Upstream response stream is split via `ReadableStream.tee()` — one branch goes to the consumer immediately, the other is consumed in the background for telemetry
4. Langfuse receives a trace with full input/output, model, token usage (including cached/audio/reasoning token breakdowns), TTFB, and total duration

**Key features:**

- **Passthrough auth** — consumers send their own API key, proxy forwards it upstream. No user management.
- **Single catch-all** — `ALL /v1/*` forwards any OpenAI-compatible request. Chat completions, embeddings, audio, images, assistants — all work automatically, including new endpoints added in the future.
- **Streaming support** — SSE streams are split and returned immediately. The proxy injects `stream_options.include_usage` so Langfuse always gets token counts.
- **Full telemetry** — every request is logged to Langfuse with input messages, output content, model, full token usage breakdown (cached, audio, reasoning tokens), TTFB, and total duration.
- **Optional auth gate** — set `PROXY_API_KEY` to require consumers to authenticate with the proxy itself (timing-safe comparison).
- **Upstream key override** — set `UPSTREAM_API_KEY` to use a single key for all upstream requests regardless of what consumers send.
- **Graceful shutdown** — SIGTERM/SIGINT stops accepting connections, waits for in-flight requests, and flushes Langfuse before exiting.

## Getting Started

**Prerequisites:** [Bun](https://bun.sh/) v1.0+

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
```

Edit `.env` with your settings. At minimum, configure Langfuse credentials to enable telemetry:

```env
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

Start the server:

```bash
# Development (hot reload)
bun dev

# Production
bun start
```

## Usage

Point any OpenAI-compatible SDK at the proxy:

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-your-openai-key",  # forwarded to upstream
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### TypeScript / Node.js

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "sk-your-openai-key",
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### curl

```bash
# Non-streaming
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'

# Streaming
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}'

# Health check
curl http://localhost:3000/api/health
```

## Endpoints

| Endpoint | Description |
| --- | --- |
| `ALL /v1/*` | Proxy catch-all — forwards any request to upstream provider |
| `GET /api/health` | Health check — returns app version and upstream reachability |

The health endpoint returns:

```json
{
  "name": "langfuse-proxy",
  "version": "0.0.0",
  "status": "ok",
  "upstream": "ok"
}
```

`status` is `"degraded"` if the upstream provider is unreachable (checked via HEAD to `/v1/models` with 3s timeout).

## Langfuse Telemetry

Every proxied request creates a Langfuse trace with:

- **Trace**: request path, input messages, output content, HTTP metadata
- **Generation**: model name, full input/output, token usage with detailed breakdowns, timing

The `usageDetails` field includes the full OpenAI token breakdown:

| Field | Description |
| --- | --- |
| `input` | Non-cached prompt tokens |
| `input_cached_tokens` | Prompt tokens served from OpenAI's cache |
| `input_audio_tokens` | Audio input tokens |
| `output` | Completion tokens |
| `output_reasoning_tokens` | Reasoning/chain-of-thought tokens (o1, etc.) |
| `output_audio_tokens` | Audio output tokens |

Timing metadata on each generation:

| Field | Description |
| --- | --- |
| `startTime` | When the proxy received the request |
| `completionStartTime` | When the first byte was received from upstream (TTFB) |
| `endTime` | When the full response was consumed |

Set `TELEMETRY_MAX_BODY_BYTES` to limit how much response data is buffered for telemetry (default 1MB). The consumer always gets the full response regardless of this limit.

Leave `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` empty to disable telemetry entirely.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Pino log level (`debug`, `info`, `warn`, `error`, `silent`) | `info` |
| `UPSTREAM_BASE_URL` | Upstream LLM provider base URL | `https://api.openai.com` |
| `UPSTREAM_API_KEY` | Override consumer's key for upstream (optional) | - |
| `PROXY_API_KEY` | Gate consumers with this key (optional) | - |
| `PROXY_TIMEOUT_MS` | Upstream request timeout in ms | `300000` (5 min) |
| `TELEMETRY_MAX_BODY_BYTES` | Max response body to buffer for telemetry | `1048576` (1MB) |
| `LANGFUSE_BASE_URL` | Langfuse instance URL | `https://cloud.langfuse.com` |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key (empty = telemetry disabled) | - |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key (empty = telemetry disabled) | - |

## Deployment

### Docker

```bash
docker build -t langfuse-proxy .
docker run -p 3000:3000 --env-file .env langfuse-proxy ./server
```

The Dockerfile uses a multi-stage build that compiles the app to a standalone binary (~50MB image).

### Coolify

Use `docker-compose.coolify.yml` — configure environment variables in the Coolify dashboard. No database or external services required.

## Development

```bash
bun install       # Install dependencies
bun dev           # Start with hot reload
bun test          # Run tests with coverage
bun lint          # Lint with Biome
bun format        # Auto-fix lint and formatting
bun check         # Lint + type-check + tests (runs in pre-commit hook)
```

### Project Structure

```
src/
  api/
    features/
      health/                  # GET /api/health
        health.controller.ts
      proxy/                   # ALL /v1/*
        proxy.controller.ts    # Catch-all handler, auth gate, header forwarding
        proxy.stream.ts        # Stream consumption, SSE parsing, JSON parsing
        proxy.telemetry.ts     # Background Langfuse reporting
        proxy.types.ts         # TypeScript interfaces
    lib/
      langfuse.ts              # Langfuse client singleton + shutdown
      logger.ts                # Pino logger with pretty-print (dev) and JSON (prod)
  app.ts                       # Elysia app setup (logging, error handling, routes)
  config.ts                    # Environment configuration
  index.ts                     # Entry point, server startup, graceful shutdown
tests/
  api/features/
    health/                    # Health endpoint tests
    proxy/                     # Proxy controller and stream parser tests
```

## License

[MIT](LICENSE)
