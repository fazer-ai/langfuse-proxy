import { describe, expect, test } from "bun:test";
import {
  consumeStream,
  parseJSONResponse,
  parseSSEResponse,
} from "@/api/features/proxy/proxy.stream";

describe("consumeStream", () => {
  test("reads full stream content", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello "));
        controller.enqueue(new TextEncoder().encode("world"));
        controller.close();
      },
    });

    const result = await consumeStream(stream, 1024);
    expect(result.text).toBe("hello world");
    expect(result.truncated).toBe(false);
  });

  test("truncates when exceeding maxBytes", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello "));
        controller.enqueue(new TextEncoder().encode("world"));
        controller.close();
      },
    });

    const result = await consumeStream(stream, 6);
    expect(result.text).toBe("hello ");
    expect(result.truncated).toBe(true);
  });

  test("drains stream with maxBytes=0", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data"));
        controller.close();
      },
    });

    const result = await consumeStream(stream, 0);
    expect(result.text).toBe("");
    expect(result.truncated).toBe(true);
  });
});

describe("parseSSEResponse", () => {
  test("parses streaming chat completion", () => {
    const raw = [
      'data: {"id":"1","model":"gpt-4o","choices":[{"delta":{"role":"assistant","content":""}}]}',
      'data: {"id":"1","model":"gpt-4o","choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"id":"1","model":"gpt-4o","choices":[{"delta":{"content":" world"}}]}',
      'data: {"id":"1","model":"gpt-4o","choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
      "data: [DONE]",
    ].join("\n");

    const result = parseSSEResponse(raw);
    expect(result.model).toBe("gpt-4o");
    expect(result.content).toBe("Hello world");
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
    });
  });

  test("handles empty stream", () => {
    const result = parseSSEResponse("");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
  });
});

describe("parseJSONResponse", () => {
  test("parses non-streaming chat completion", () => {
    const raw = JSON.stringify({
      model: "gpt-4o",
      choices: [{ message: { role: "assistant", content: "Hello!" } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    });

    const result = parseJSONResponse(raw);
    expect(result.model).toBe("gpt-4o");
    expect(result.content).toBe("Hello!");
    expect(result.usage).toEqual({
      prompt_tokens: 5,
      completion_tokens: 1,
      total_tokens: 6,
    });
  });

  test("handles malformed JSON", () => {
    const result = parseJSONResponse("not json");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
  });
});
