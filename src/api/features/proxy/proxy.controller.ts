import crypto from "node:crypto";
import Elysia from "elysia";
import { jsonError, timingSafeEqual } from "@/api/lib/http";
import logger from "@/api/lib/logger";
import config from "@/config";
import { reportErrorToLangfuse, reportToLangfuse } from "./proxy.telemetry";
import type { ProxyRequestContext } from "./proxy.types";

function injectStreamUsage(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText);
    if (body.stream === true) {
      body.stream_options = {
        ...body.stream_options,
        include_usage: true,
      };
      return JSON.stringify(body);
    }
    return bodyText;
  } catch {
    return bodyText;
  }
}

const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "openai-organization",
  "openai-project",
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

  // Authorization: use upstream key override if set, otherwise forward original
  if (config.upstreamApiKey) {
    headers.authorization = `Bearer ${config.upstreamApiKey}`;
  } else {
    const auth = original.get("authorization");
    if (auth) headers.authorization = auth;
  }

  return headers;
}

const FORWARDED_RESPONSE_HEADERS = ["content-type"];
const RESPONSE_HEADER_PREFIXES = ["x-ratelimit-", "openai-"];

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

export const proxyController = new Elysia({ prefix: "/v1" }).all(
  "/*",
  async ({ request, params }) => {
    const startTime = performance.now();
    const traceId = request.headers.get("x-request-id") || crypto.randomUUID();

    // 1. Auth gate
    if (config.proxyApiKey) {
      const authHeader = request.headers.get("authorization") || "";
      const expected = `Bearer ${config.proxyApiKey}`;
      if (!timingSafeEqual(authHeader, expected)) {
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
        bodyForUpstream = injectStreamUsage(bodyTextForTelemetry);
      } else if (contentType.includes("multipart/form-data")) {
        // Extract text fields for telemetry, forward original stream upstream
        try {
          const cloned = request.clone();
          const formData = await cloned.formData();
          const fields: Record<string, string> = {};
          for (const [key, value] of formData.entries()) {
            if (typeof value === "string") {
              fields[key] = value;
            } else {
              fields[key] = `[file: ${value.name}, ${value.size} bytes]`;
            }
          }
          bodyTextForTelemetry = JSON.stringify(fields);
        } catch {
          /* best-effort */
        }
        bodyForUpstream = request.body;
      } else {
        // Binary: forward stream directly
        bodyForUpstream = request.body;
      }
    }

    // 3. Build upstream URL (preserve query string)
    const upstreamPath = (params as Record<string, string>)["*"];
    const url = new URL(request.url);
    const upstreamUrl = `${config.upstreamBaseUrl}/v1/${upstreamPath}${url.search}`;

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
        path: `/v1/${upstreamPath}`,
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
      path: `/v1/${upstreamPath}`,
      requestBody: bodyTextForTelemetry || "",
      contentType,
      responseContentType:
        upstreamRes.headers.get("content-type") || "application/octet-stream",
      isStreaming,
      statusCode: upstreamRes.status,
      latencyMs,
      provider: "openai",
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
