import type { ParsedResponse } from "@/api/features/proxy/proxy.types";
import type { GeminiGenerateContentResponse } from "./gemini.types";

/**
 * Parse Gemini SSE streaming response for telemetry.
 *
 * Gemini streaming format uses `data: {json}\n\n` lines (no event: prefix, no [DONE] marker).
 * - `modelVersion` appears in chunks
 * - Text in `candidates[0].content.parts[].text`
 * - `usageMetadata` in last chunk (cumulative)
 */
export function parseGeminiSSEResponse(raw: string): ParsedResponse {
  const lines = raw.split("\n");
  let model: string | null = null;
  let usage: ParsedResponse["usage"] = null;
  const contentParts: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(line.slice(6)) as GeminiGenerateContentResponse;

      if (data.modelVersion && !model) {
        model = data.modelVersion;
      }

      if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.text) contentParts.push(part.text);
        }
      }

      if (data.usageMetadata) {
        usage = { ...data.usageMetadata };
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
 * Parse Gemini non-streaming JSON response for telemetry.
 */
export function parseGeminiJSONResponse(raw: string): ParsedResponse {
  try {
    const data = JSON.parse(raw) as GeminiGenerateContentResponse;

    const parts = data.candidates?.[0]?.content?.parts;
    const content =
      parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join("") || null;

    return {
      model: data.modelVersion || null,
      content,
      usage: data.usageMetadata ? { ...data.usageMetadata } : null,
      raw: data,
    };
  } catch {
    return { model: null, content: null, usage: null, raw: null };
  }
}
