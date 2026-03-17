# langfuse-proxy

A transparent proxy that forwards API requests to upstream LLM providers and sends telemetry to [Langfuse](https://langfuse.com) in the background. Zero latency overhead on the response path.

Supports **OpenAI**, **Anthropic**, and **Google Gemini** APIs natively.

## Architecture

```sh
                              +--> Upstream OpenAI    (/v1/*)
Consumer  -->  Proxy  --------+--> Upstream Anthropic (/v1/messages)
                |             +--> Upstream Gemini    (/v1beta/*)
                |
                v (background, non-blocking)
             Langfuse
```

**How it works:**

1. Consumer sends a standard API request to the proxy
2. Proxy forwards it to the appropriate upstream provider
3. Upstream response stream is split via `ReadableStream.tee()` — one branch goes to the consumer immediately, the other is consumed in the background for telemetry
4. Langfuse receives a trace with full input/output, model, token usage, TTFB, and total duration

**Key features:**

- **Multi-provider** — native support for OpenAI, Anthropic, and Gemini APIs with provider-specific stream parsing and telemetry
- **Passthrough auth** — consumers send their own API key, proxy forwards it upstream. No user management.
- **OpenAI catch-all** — `ALL /v1/*` forwards any OpenAI-compatible request. Chat completions, embeddings, audio, images, assistants — all work automatically.
- **Streaming support** — SSE streams are split and returned immediately. For OpenAI, the proxy injects `stream_options.include_usage` so Langfuse always gets token counts.
- **Full telemetry** — every request is logged to Langfuse with input messages, output content, model, full token usage breakdown, TTFB, and total duration.
- **Optional auth gate** — set `PROXY_API_KEY` to require consumers to authenticate with the proxy itself (timing-safe comparison).
- **Upstream key override** — set `UPSTREAM_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` to use a single key for all upstream requests regardless of what consumers send.
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

### OpenAI

Point any OpenAI-compatible SDK at the proxy:

#### Python

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

#### TypeScript / Node.js

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

### Anthropic

Use the Anthropic SDK pointed at the proxy:

#### Python

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:3000",
    api_key="sk-ant-your-key",  # forwarded to upstream
)

message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)
```

#### TypeScript / Node.js

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "http://localhost:3000",
  apiKey: "sk-ant-your-key",
});

const message = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Gemini

Send requests to the `/v1beta/*` endpoints:

```bash
curl "http://localhost:3000/v1beta/models/gemini-2.0-flash:generateContent" \
  -H "x-goog-api-key: your-gemini-key" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello!"}]}]}'
```

### curl (OpenAI)

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
```

### Health check

```bash
curl http://localhost:3000/api/health
```

## Endpoints

| Endpoint           | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `ALL /v1/messages` | Anthropic pass-through — forwards to Anthropic API               |
| `ALL /v1beta/*`    | Gemini pass-through — forwards to Gemini API                     |
| `ALL /v1/*`        | OpenAI catch-all — forwards any request to upstream provider     |
| `GET /api/health`  | Health check — returns app version and per-provider reachability |

> Routes are matched in order: `/v1/messages` is matched before the `/v1/*` catch-all, so Anthropic requests are routed correctly.

The health endpoint returns per-provider status:

```json
{
  "name": "langfuse-proxy",
  "version": "0.0.0",
  "status": "ok",
  "upstream": {
    "openai": "ok",
    "anthropic": "ok",
    "gemini": "not_configured"
  }
}
```

- `status` is `"degraded"` if OpenAI is unreachable or any configured provider has errors
- Anthropic and Gemini show `"not_configured"` if their API key is not set

## Langfuse Telemetry

Every proxied request creates a Langfuse trace with:

- **Trace**: request path, input messages, output content, HTTP metadata
- **Generation**: model name, full input/output, token usage with detailed breakdowns, timing

The `usageDetails` field includes the full OpenAI token breakdown:

| Field                     | Description                                  |
| ------------------------- | -------------------------------------------- |
| `input`                   | Non-cached prompt tokens                     |
| `input_cached_tokens`     | Prompt tokens served from OpenAI's cache     |
| `input_audio_tokens`      | Audio input tokens                           |
| `output`                  | Completion tokens                            |
| `output_reasoning_tokens` | Reasoning/chain-of-thought tokens (o1, etc.) |
| `output_audio_tokens`     | Audio output tokens                          |

Anthropic and Gemini providers report their native token usage in the same format.

Timing metadata on each generation:

| Field                 | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `startTime`           | When the proxy received the request                   |
| `completionStartTime` | When the first byte was received from upstream (TTFB) |
| `endTime`             | When the full response was consumed                   |

Set `TELEMETRY_MAX_BODY_BYTES` to limit how much response data is buffered for telemetry (default 1MB). The consumer always gets the full response regardless of this limit.

Leave `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` empty to disable telemetry entirely.

## Environment Variables

| Variable                   | Description                                                 | Default                                     |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `NODE_ENV`                 | Environment mode                                            | `development`                               |
| `PORT`                     | Server port                                                 | `3000`                                      |
| `LOG_LEVEL`                | Pino log level (`debug`, `info`, `warn`, `error`, `silent`) | `info`                                      |
| **OpenAI / catch-all**     |                                                             |                                             |
| `UPSTREAM_BASE_URL`        | Upstream LLM provider base URL                              | `https://api.openai.com`                    |
| `UPSTREAM_API_KEY`         | Override consumer's key for upstream (optional)             | -                                           |
| `PROXY_API_KEY`            | Gate consumers with this key (optional)                     | -                                           |
| `PROXY_TIMEOUT_MS`         | Upstream request timeout in ms                              | `300000` (5 min)                            |
| `TELEMETRY_MAX_BODY_BYTES` | Max response body to buffer for telemetry                   | `1048576` (1MB)                             |
| **Anthropic**              |                                                             |                                             |
| `ANTHROPIC_BASE_URL`       | Anthropic API base URL                                      | `https://api.anthropic.com`                 |
| `ANTHROPIC_API_KEY`        | Override consumer's key for Anthropic (optional)            | -                                           |
| `ANTHROPIC_VERSION`        | Default `anthropic-version` header                          | `2023-06-01`                                |
| **Gemini**                 |                                                             |                                             |
| `GEMINI_BASE_URL`          | Gemini API base URL                                         | `https://generativelanguage.googleapis.com` |
| `GEMINI_API_KEY`           | Override consumer's key for Gemini (optional)               | -                                           |
| **Langfuse**               |                                                             |                                             |
| `LANGFUSE_BASE_URL`        | Langfuse instance URL                                       | `https://cloud.langfuse.com`                |
| `LANGFUSE_PUBLIC_KEY`      | Langfuse public key (empty = telemetry disabled)            | -                                           |
| `LANGFUSE_SECRET_KEY`      | Langfuse secret key (empty = telemetry disabled)            | -                                           |

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

```sh
src/
├── api/
│   ├── features/
│   │   ├── anthropic/                 # ALL /v1/messages
│   │   │   ├── anthropic.controller.ts    Anthropic handler, auth, header forwarding
│   │   │   └── anthropic.stream.ts        Anthropic SSE parsing
│   │   ├── gemini/                    # ALL /v1beta/*
│   │   │   ├── gemini.controller.ts       Gemini handler, API key forwarding
│   │   │   └── gemini.stream.ts           Gemini stream parsing
│   │   ├── health/                    # GET /api/health
│   │   │   └── health.controller.ts       Per-provider reachability checks
│   │   └── proxy/                     # ALL /v1/*
│   │       ├── proxy.controller.ts        Catch-all handler, auth gate, header forwarding
│   │       ├── proxy.stream.ts            Stream consumption, SSE parsing, JSON parsing
│   │       ├── proxy.telemetry.ts         Background Langfuse reporting (all providers)
│   │       └── proxy.types.ts             TypeScript interfaces
│   └── lib/
│       ├── langfuse.ts                Langfuse client singleton + shutdown
│       └── logger.ts                  Pino logger with pretty-print (dev) / JSON (prod)
├── app.ts                             Elysia app setup (logging, error handling, routes)
├── config.ts                          Environment configuration
└── index.ts                           Entry point, server startup, graceful shutdown
tests/
└── api/features/
    ├── anthropic/                     Anthropic controller and stream parser tests
    ├── gemini/                        Gemini controller and stream parser tests
    ├── health/                        Health endpoint tests
    └── proxy/                         Proxy controller and stream parser tests
```

## License

[MIT](LICENSE)
