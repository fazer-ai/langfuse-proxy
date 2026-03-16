import { describe, expect, test } from "bun:test";
import {
  parseGeminiJSONResponse,
  parseGeminiSSEResponse,
} from "@/api/features/gemini/gemini.stream";

describe("parseGeminiSSEResponse", () => {
  test("parses full streaming response", () => {
    const raw = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}],"modelVersion":"gemini-2.0-flash"}',
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":" world!"}],"role":"model"}}],"modelVersion":"gemini-2.0-flash"}',
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15},"modelVersion":"gemini-2.0-flash"}',
    ].join("\n");

    const result = parseGeminiSSEResponse(raw);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.content).toBe("Hello world!");
    expect(result.usage).toEqual({
      promptTokenCount: 5,
      candidatesTokenCount: 10,
      totalTokenCount: 15,
    });
  });

  test("preserves cached and thoughts token counts", () => {
    const raw = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3,"totalTokenCount":18,"cachedContentTokenCount":2,"thoughtsTokenCount":8},"modelVersion":"gemini-2.0-flash-thinking"}',
    ].join("\n");

    const result = parseGeminiSSEResponse(raw);
    expect(result.usage).toEqual({
      promptTokenCount: 5,
      candidatesTokenCount: 3,
      totalTokenCount: 18,
      cachedContentTokenCount: 2,
      thoughtsTokenCount: 8,
    });
  });

  test("handles empty stream", () => {
    const result = parseGeminiSSEResponse("");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
  });

  test("handles malformed JSON lines", () => {
    const raw = [
      "data: not-json",
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}],"role":"model"}}],"modelVersion":"gemini-2.0-flash"}',
    ].join("\n");

    const result = parseGeminiSSEResponse(raw);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.content).toBe("ok");
  });
});

describe("parseGeminiJSONResponse", () => {
  test("parses standard response", () => {
    const raw = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: "Hello there!" }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
      modelVersion: "gemini-2.0-flash",
    });

    const result = parseGeminiJSONResponse(raw);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.content).toBe("Hello there!");
    expect(result.usage).toEqual({
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    });
    expect(result.raw).toBeTruthy();
  });

  test("parses multi-part text content", () => {
    const raw = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: "Part one. " }, { text: "Part two." }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 8,
        totalTokenCount: 18,
      },
      modelVersion: "gemini-2.0-flash",
    });

    const result = parseGeminiJSONResponse(raw);
    expect(result.content).toBe("Part one. Part two.");
  });

  test("handles error response shape", () => {
    const raw = JSON.stringify({
      error: {
        code: 400,
        message: "Invalid request",
        status: "INVALID_ARGUMENT",
      },
    });

    const result = parseGeminiJSONResponse(raw);
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.raw).toBeTruthy();
  });

  test("handles malformed JSON", () => {
    const result = parseGeminiJSONResponse("not json");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
    expect(result.raw).toBeNull();
  });
});
