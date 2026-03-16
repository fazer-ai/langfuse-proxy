import {
  parseAnthropicJSONResponse,
  parseAnthropicSSEResponse,
} from "@/api/features/anthropic/anthropic.stream";
import {
  parseGeminiJSONResponse,
  parseGeminiSSEResponse,
} from "@/api/features/gemini/gemini.stream";
import { getLangfuseClient } from "@/api/lib/langfuse";
import config from "@/config";
import {
  consumeStream,
  parseJSONResponse,
  parseSSEResponse,
} from "./proxy.stream";
import type { ParsedResponse, ProxyRequestContext } from "./proxy.types";

function selectParser(
  provider: string | undefined,
  isStreaming: boolean,
): (raw: string) => ParsedResponse {
  switch (provider) {
    case "anthropic":
      return isStreaming
        ? parseAnthropicSSEResponse
        : parseAnthropicJSONResponse;
    case "gemini":
      return isStreaming ? parseGeminiSSEResponse : parseGeminiJSONResponse;
    default:
      return isStreaming ? parseSSEResponse : parseJSONResponse;
  }
}

export async function reportToLangfuse(
  telemetryStream: ReadableStream<Uint8Array>,
  ctx: ProxyRequestContext,
): Promise<void> {
  const langfuse = getLangfuseClient();
  if (!langfuse) {
    // Must still drain the stream to avoid backpressure on the client
    await consumeStream(telemetryStream, 0);
    return;
  }

  const { text, truncated } = await consumeStream(
    telemetryStream,
    config.telemetryMaxBodyBytes,
  );
  const totalDurationMs = performance.now() - ctx.startTime;

  const isJsonResponse =
    ctx.contentType.includes("application/json") || ctx.isStreaming;

  const isError = ctx.statusCode >= 400;
  const parsed = isJsonResponse
    ? selectParser(ctx.provider, ctx.isStreaming)(text)
    : { model: null, content: null, usage: null, raw: null };

  let input: unknown;
  try {
    input = ctx.requestBody ? JSON.parse(ctx.requestBody) : undefined;
  } catch {
    /* non-JSON request body */
  }

  const errorMessage =
    isError && parsed.raw
      ? (parsed.raw as Record<string, Record<string, string>>)?.error?.message
      : undefined;

  const trace = langfuse.trace({
    id: ctx.traceId,
    name: ctx.path,
    input,
    output: isError ? parsed.raw : (parsed.content ?? parsed.raw),
    metadata: {
      method: ctx.method,
      statusCode: ctx.statusCode,
      isStreaming: ctx.isStreaming,
      ttfbMs: ctx.latencyMs,
      totalDurationMs,
      truncated,
    },
  });

  trace.generation({
    name: parsed.model || ctx.path,
    model: parsed.model || undefined,
    input,
    output: isError ? parsed.raw : (parsed.content ?? parsed.raw),
    ...(isError
      ? { level: "ERROR" as const, statusMessage: errorMessage }
      : {}),
    usageDetails: (parsed.usage as Record<string, number>) ?? undefined,
    startTime: new Date(Date.now() - totalDurationMs),
    endTime: new Date(),
    completionStartTime: new Date(Date.now() - totalDurationMs + ctx.latencyMs),
    metadata: {
      statusCode: ctx.statusCode,
      isStreaming: ctx.isStreaming,
      ttfbMs: ctx.latencyMs,
    },
  });
}

export function reportErrorToLangfuse(ctx: {
  traceId: string;
  startTime: number;
  path: string;
  requestBody: string;
  error: string;
}): void {
  const langfuse = getLangfuseClient();
  if (!langfuse) return;
  const trace = langfuse.trace({ id: ctx.traceId, name: ctx.path });
  let input: unknown;
  try {
    input = JSON.parse(ctx.requestBody);
  } catch {
    /* non-JSON */
  }
  trace.generation({
    name: ctx.path,
    input,
    statusMessage: ctx.error,
    level: "ERROR",
    startTime: new Date(Date.now() - (performance.now() - ctx.startTime)),
    endTime: new Date(),
  });
}
