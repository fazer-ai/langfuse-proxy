import { describe, expect, test } from "bun:test";
import {
  parseAnthropicJSONResponse,
  parseAnthropicSSEResponse,
} from "@/api/features/anthropic/anthropic.stream";

describe("parseAnthropicSSEResponse", () => {
  test("parses full streaming response", () => {
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":25,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      "",
      "event: ping",
      'data: {"type":"ping"}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world!"}}',
      "",
      "event: content_block_stop",
      'data: {"type":"content_block_stop","index":0}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":15}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
    ].join("\n");

    const result = parseAnthropicSSEResponse(raw);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.content).toBe("Hello world!");
    expect(result.usage).toEqual({
      input_tokens: 25,
      output_tokens: 15,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
  });

  test("parses tool use stream (no text content)", () => {
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_456","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":50,"output_tokens":1}}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01","name":"get_weather","input":{}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"location\\": \\"SF\\"}"}}',
      "",
      "event: content_block_stop",
      'data: {"type":"content_block_stop","index":0}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":30}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
    ].join("\n");

    const result = parseAnthropicSSEResponse(raw);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.content).toBeNull();
    expect(result.usage).toEqual({
      input_tokens: 50,
      output_tokens: 30,
    });
  });

  test("handles empty stream", () => {
    const result = parseAnthropicSSEResponse("");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
  });

  test("handles stream with cache token usage", () => {
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_789","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1,"cache_creation_input_tokens":100,"cache_read_input_tokens":50}}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Cached!"}}',
      "",
      "event: content_block_stop",
      'data: {"type":"content_block_stop","index":0}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
    ].join("\n");

    const result = parseAnthropicSSEResponse(raw);
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 50,
    });
  });
});

describe("parseAnthropicJSONResponse", () => {
  test("parses standard response", () => {
    const raw = JSON.stringify({
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello there!" }],
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });

    const result = parseAnthropicJSONResponse(raw);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.content).toBe("Hello there!");
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(result.raw).toBeTruthy();
  });

  test("parses multi-block response", () => {
    const raw = JSON.stringify({
      id: "msg_456",
      type: "message",
      role: "assistant",
      content: [
        { type: "text", text: "Part one. " },
        { type: "text", text: "Part two." },
      ],
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      usage: { input_tokens: 20, output_tokens: 10 },
    });

    const result = parseAnthropicJSONResponse(raw);
    expect(result.content).toBe("Part one. Part two.");
  });

  test("handles error response", () => {
    const raw = JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "max_tokens is required",
      },
    });

    const result = parseAnthropicJSONResponse(raw);
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.raw).toBeTruthy();
  });

  test("handles malformed JSON", () => {
    const result = parseAnthropicJSONResponse("not json");
    expect(result.model).toBeNull();
    expect(result.content).toBeNull();
    expect(result.usage).toBeNull();
    expect(result.raw).toBeNull();
  });
});
