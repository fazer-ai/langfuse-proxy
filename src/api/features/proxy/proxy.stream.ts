import type { ParsedResponse } from "./proxy.types";

export async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes <= maxBytes) {
        chunks.push(decoder.decode(value, { stream: true }));
      }
      // Keep reading even if truncated — must drain the tee'd stream
    }
  } finally {
    reader.releaseLock();
  }
  return { text: chunks.join(""), truncated: totalBytes > maxBytes };
}

export function parseSSEResponse(raw: string): ParsedResponse {
  const lines = raw.split("\n");
  let model: string | null = null;
  let usage: ParsedResponse["usage"] = null;
  const contentParts: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const chunk = JSON.parse(line.slice(6));
      if (!model && chunk.model) model = chunk.model;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) contentParts.push(delta.content);
      if (chunk.usage) usage = chunk.usage;
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

export function parseJSONResponse(raw: string): ParsedResponse {
  try {
    const data = JSON.parse(raw);
    return {
      model: data.model || null,
      content: data.choices?.[0]?.message?.content || null,
      usage: data.usage || null,
      raw: data,
    };
  } catch {
    return { model: null, content: null, usage: null, raw: null };
  }
}
