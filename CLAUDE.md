# CLAUDE.md

This is a Bun + Elysia proxy service that forwards OpenAI-compatible API requests to upstream LLM providers and sends telemetry to Langfuse.

## Common commands

| Command      | Description                                  |
| ------------ | -------------------------------------------- |
| `bun dev`    | Start dev server with hot reload (port 3000) |
| `bun test`   | Run tests with coverage                      |
| `bun lint`   | Lint with Biome                              |
| `bun format` | Format with Biome                            |
| `bun check`  | Lint + type-check + tests (pre-commit hook)  |

## Project layout

- `src/api/features/proxy/` — Core proxy: catch-all `/v1/*` controller, SSE stream parser, Langfuse telemetry
- `src/api/features/anthropic/` — Anthropic `/v1/messages` pass-through with provider-specific stream parsing
- `src/api/features/gemini/` — Gemini `/v1beta/*` pass-through with provider-specific stream parsing
- `src/api/features/health/` — `GET /api/health` with upstream reachability check
- `src/api/lib/langfuse.ts` — Langfuse client singleton, no-ops when credentials not set
- `src/api/lib/logger.ts` — Pino logger (pretty-print in dev, JSON in prod)
- `src/app.ts` — Elysia app setup: logging, JSON error responses, route mounting
- `src/config.ts` — All env vars parsed here, no env access elsewhere
- `src/index.ts` — Server startup with port retry, graceful shutdown (SIGTERM/SIGINT → drain → flush Langfuse)

## Architecture

- Single catch-all `ALL /v1/*` forwards any OpenAI-compatible request to upstream
- `ReadableStream.tee()` splits response: one branch to client immediately, other consumed for background telemetry
- Telemetry stream MUST always be fully drained (even if Langfuse disabled) to avoid backpressure on client stream
- `stream_options.include_usage` injected into streaming request bodies so Langfuse gets token counts
- `usageDetails` sends full OpenAI token breakdown (cached, audio, reasoning tokens) to Langfuse
- `completionStartTime` sent to Langfuse for TTFB tracking separate from total duration
- Optional `PROXY_API_KEY` gate with `crypto.timingSafeEqual` comparison
- `UPSTREAM_API_KEY` overrides consumer's Authorization header if set
- Request ID: preserves consumer's `X-Request-ID` or generates UUID, used as Langfuse trace ID
- Client disconnect aborts upstream fetch via AbortController to prevent orphaned streams
- Non-JSON requests (multipart/binary) forwarded as raw streams, telemetry captures metadata only

## Code style

- Biome for linting and formatting (2-space indent, LF line endings)
- Path alias: `@/` maps to `src/`
- Strict TypeScript with `noUncheckedIndexedAccess`
- Husky pre-commit hook runs `bun check` (lint + type-check + tests)
- No frontend, no database, no auth middleware — pure proxy service
