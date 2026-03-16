import type { ParsedResponse } from "@/api/features/proxy/proxy.types";
import type { AnthropicMessagesResponse } from "./anthropic.types";

/**
 * Parse Anthropic SSE streaming response for telemetry.
 *
 * Anthropic SSE format uses `event: <type>\ndata: <json>` pairs.
 * - `message_start` → contains `message.model` and `message.usage` (input_tokens)
 * - `content_block_delta` with `delta.type === "text_delta"` → text content
 * - `message_delta` → `usage.output_tokens` (cumulative)
 */
export function parseAnthropicSSEResponse(raw: string): ParsedResponse {
  const lines = raw.split("\n");
  let model: string | null = null;
  let usage: ParsedResponse["usage"] = null;
  const contentParts: string[] = [];
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
      continue;
    }

    if (!line.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(line.slice(6));

      if (currentEvent === "message_start" && data.message) {
        model = data.message.model || null;
        if (data.message.usage) {
          usage = { ...data.message.usage };
        }
      }

      if (
        currentEvent === "content_block_delta" &&
        data.delta?.type === "text_delta" &&
        data.delta.text
      ) {
        contentParts.push(data.delta.text);
      }

      // message_delta usage is cumulative and contains output_tokens
      if (currentEvent === "message_delta" && data.usage) {
        usage = { ...usage, ...data.usage };
      }
    } catch {
      /* skip malformed */
    }
  }

  return {
    model,
    content: contentParts.length > 0 ? contentParts.join("") : null,
    usage,
    raw: null,
  };
}

/**
 * Parse Anthropic non-streaming JSON response for telemetry.
 */
export function parseAnthropicJSONResponse(raw: string): ParsedResponse {
  try {
    const data = JSON.parse(raw) as AnthropicMessagesResponse;
    const content =
      data.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("") || null;

    return {
      model: data.model || null,
      content,
      usage: data.usage ? { ...data.usage } : null,
      raw: data,
    };
  } catch {
    return { model: null, content: null, usage: null, raw: null };
  }
}
