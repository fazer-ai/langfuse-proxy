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

const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "x-goog-api-client",
];

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

  // x-goog-api-key: use config override if set, else forward request's
  // x-goog-api-key, x-api-key, or extract from Authorization: Bearer ...
  if (config.geminiApiKey) {
    headers["x-goog-api-key"] = config.geminiApiKey;
  } else {
    const googKey = original.get("x-goog-api-key");
    if (googKey) {
      headers["x-goog-api-key"] = googKey;
    } else {
      const apiKey = original.get("x-api-key");
      if (apiKey) {
        headers["x-goog-api-key"] = apiKey;
      } else {
        const auth = original.get("authorization");
        if (auth?.startsWith("Bearer ")) {
          headers["x-goog-api-key"] = auth.slice(7);
        }
      }
    }
  }

  return headers;
}

const FORWARDED_RESPONSE_HEADERS = ["content-type"];
const RESPONSE_HEADER_PREFIXES = ["x-goog-"];

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

export const geminiController = new Elysia().all(
  "/v1beta/*",
  async ({ request, params }) => {
    const startTime = performance.now();
    const traceId = request.headers.get("x-request-id") || crypto.randomUUID();
    const path = (params as Record<string, string>)["*"] || "";

    // 1. Auth gate
    if (config.proxyApiKey) {
      const authHeader = request.headers.get("authorization") || "";
      const apiKeyHeader = request.headers.get("x-api-key") || "";
      const googKeyHeader = request.headers.get("x-goog-api-key") || "";
      const expected = `Bearer ${config.proxyApiKey}`;
      const keyMatch =
        timingSafeEqual(authHeader, expected) ||
        timingSafeEqual(apiKeyHeader, config.proxyApiKey) ||
        timingSafeEqual(googKeyHeader, config.proxyApiKey);
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
    const upstreamUrl = `${config.geminiBaseUrl}/v1beta/${path}${url.search}`;

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
        path: `/v1beta/${path}`,
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
      path: `/v1beta/${path}`,
      requestBody: bodyTextForTelemetry || "",
      contentType,
      responseContentType:
        upstreamRes.headers.get("content-type") || "application/octet-stream",
      isStreaming,
      statusCode: upstreamRes.status,
      latencyMs,
      provider: "gemini",
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
