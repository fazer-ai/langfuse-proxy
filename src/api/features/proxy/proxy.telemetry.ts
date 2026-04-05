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

/** Derive modality tags from the request path and body. */
function detectTags(path: string, input: unknown): string[] {
  const tags: string[] = [];

  // Path-based detection
  if (path.includes("/audio/")) tags.push("audio");
  if (path.includes("/images/")) tags.push("vision");
  if (path.includes("/embeddings")) tags.push("embedding");

  // Content-based detection from messages array (OpenAI / Anthropic)
  if (input && typeof input === "object" && "messages" in input) {
    const messages = (input as { messages: unknown[] }).messages;
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        const content = (msg as { content: unknown }).content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
          const type = (part as { type: string }).type;
          // OpenAI: image_url | Anthropic: image
          if (type === "image_url" || type === "image") {
            if (!tags.includes("vision")) tags.push("vision");
          }
          // OpenAI: input_audio
          if (type === "input_audio") {
            if (!tags.includes("audio")) tags.push("audio");
          }
          // Anthropic: document (PDF, etc.)
          if (type === "document") {
            if (!tags.includes("document")) tags.push("document");
          }
        }
      }
    }
  }

  // Gemini: contents[].parts[] with inline_data or file_data
  if (input && typeof input === "object" && "contents" in input) {
    const contents = (input as { contents: unknown[] }).contents;
    if (Array.isArray(contents)) {
      for (const entry of contents) {
        const parts = (entry as { parts: unknown[] }).parts;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
          const p = part as {
            inline_data?: { mime_type: string };
            file_data?: { mime_type: string };
          };
          const mime = p.inline_data?.mime_type || p.file_data?.mime_type || "";
          if (mime.startsWith("image/")) {
            if (!tags.includes("vision")) tags.push("vision");
          }
          if (mime.startsWith("audio/")) {
            if (!tags.includes("audio")) tags.push("audio");
          }
          if (mime === "application/pdf") {
            if (!tags.includes("document")) tags.push("document");
          }
        }
      }
    }
  }

  return tags;
}

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
    ctx.responseContentType.includes("application/json") || ctx.isStreaming;

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

  const tags = [...detectTags(ctx.path, input), ...(ctx.langfuseTags ?? [])];

  const trace = langfuse.trace({
    id: ctx.traceId,
    sessionId: ctx.sessionId || undefined,
    userId: ctx.userId || undefined,
    name: ctx.path,
    input,
    output: isError ? parsed.raw : (parsed.content ?? parsed.raw),
    ...(tags.length > 0 ? { tags } : {}),
    metadata: {
      ...ctx.langfuseMetadata,
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
