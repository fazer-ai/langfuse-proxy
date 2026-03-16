import crypto from "node:crypto";
import Elysia from "elysia";
import {
  reportErrorToLangfuse,
  reportToLangfuse,
} from "@/api/features/proxy/proxy.telemetry";
import type { ProxyRequestContext } from "@/api/features/proxy/proxy.types";
import { jsonError, timingSafeEqual } from "@/api/lib/http";
import logger from "@/api/lib/logger";
import config from "@/config";

const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "anthropic-beta"];

function buildUpstreamHeaders(
  original: Headers,
  traceId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-request-id": traceId,
  };

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = original.get(name);
    if (value) headers[name] = value;
  }

  // anthropic-version: prefer request header, fall back to config
  headers["anthropic-version"] =
    original.get("anthropic-version") || config.anthropicVersion;

  // x-api-key: use config override if set, else forward request's x-api-key,
  // or extract token from Authorization: Bearer ...
  if (config.anthropicApiKey) {
    headers["x-api-key"] = config.anthropicApiKey;
  } else {
    const apiKey = original.get("x-api-key");
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    } else {
      const auth = original.get("authorization");
      if (auth?.startsWith("Bearer ")) {
        headers["x-api-key"] = auth.slice(7);
      }
    }
  }

  return headers;
}

const FORWARDED_RESPONSE_HEADERS = ["content-type", "request-id"];
const RESPONSE_HEADER_PREFIXES = ["anthropic-"];

function buildResponseHeaders(
  upstream: Headers,
  traceId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-request-id": traceId,
  };

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value) headers[name] = value;
  }

  upstream.forEach((value, name) => {
    const lower = name.toLowerCase();
    for (const prefix of RESPONSE_HEADER_PREFIXES) {
      if (lower.startsWith(prefix)) {
        headers[name] = value;
        break;
      }
    }
  });

  return headers;
}

export const anthropicController = new Elysia({ prefix: "/v1" }).all(
  "/messages",
  async ({ request }) => {
    const startTime = performance.now();
    const traceId = request.headers.get("x-request-id") || crypto.randomUUID();

    // 1. Auth gate
    if (config.proxyApiKey) {
      const authHeader = request.headers.get("authorization") || "";
      const apiKeyHeader = request.headers.get("x-api-key") || "";
      const expected = `Bearer ${config.proxyApiKey}`;
      const keyMatch =
        timingSafeEqual(authHeader, expected) ||
        timingSafeEqual(apiKeyHeader, config.proxyApiKey);
      if (!keyMatch) {
        return jsonError(
          "Invalid proxy API key",
          "auth_error",
          "invalid_api_key",
          401,
        );
      }
    }

    // 2. Read request body
    const contentType = request.headers.get("content-type") || "";
    const isJsonRequest = contentType.includes("application/json");
    let bodyForUpstream: string | ReadableStream<Uint8Array> | null = null;
    let bodyTextForTelemetry: string | null = null;

    if (request.method !== "GET" && request.method !== "HEAD") {
      if (isJsonRequest) {
        bodyTextForTelemetry = await request.text();
        bodyForUpstream = bodyTextForTelemetry;
      } else {
        bodyForUpstream = request.body;
      }
    }

    // 3. Build upstream URL
    const url = new URL(request.url);
    const upstreamUrl = `${config.anthropicBaseUrl}/v1/messages${url.search}`;

    // 4. Build upstream headers
    const upstreamHeaders = buildUpstreamHeaders(request.headers, traceId);

    // 5. Fetch upstream with timeout and client disconnect propagation
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(new DOMException("Timeout", "TimeoutError")),
      config.proxyTimeoutMs,
    );
    request.signal.addEventListener("abort", () => abortController.abort());

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: bodyForUpstream,
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout =
        err instanceof DOMException && err.name === "TimeoutError";
      const message = isTimeout
        ? "Upstream request timed out"
        : "Upstream connection failed";
      const code = isTimeout ? "timeout" : "connection_error";
      logger.error({ err, upstreamUrl }, message);
      reportErrorToLangfuse({
        traceId,
        startTime,
        path: "/v1/messages",
        requestBody: bodyTextForTelemetry || "",
        error: message,
      });
      return jsonError(message, "server_error", code, 502);
    }

    // 6. Build response
    const isStreaming =
      upstreamRes.headers.get("content-type")?.includes("text/event-stream") ??
      false;
    const latencyMs = performance.now() - startTime;
    const responseHeaders = buildResponseHeaders(upstreamRes.headers, traceId);

    if (!upstreamRes.body) {
      return new Response(null, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    // 7. Tee stream for telemetry
    const [clientStream, telemetryStream] = upstreamRes.body.tee();

    // 8. Background telemetry (non-blocking)
    const ctx: ProxyRequestContext = {
      traceId,
      startTime,
      method: request.method,
      path: "/v1/messages",
      requestBody: bodyTextForTelemetry || "",
      contentType,
      isStreaming,
      statusCode: upstreamRes.status,
      latencyMs,
      provider: "anthropic",
    };
    reportToLangfuse(telemetryStream, ctx).catch((err) =>
      logger.error({ err }, "Langfuse telemetry failed"),
    );

    // 9. Return response immediately
    return new Response(clientStream, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  },
);
