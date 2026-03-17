import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { anthropicController } from "@/api/features/anthropic/anthropic.controller";
import logger from "@/api/lib/logger";
import config from "@/config";

let mockServer: ReturnType<typeof Bun.serve>;
let mockBaseUrl: string;

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/v1/messages") {
        const isStreaming = req.headers
          .get("accept")
          ?.includes("text/event-stream");

        // Echo back headers for verification
        const apiKey = req.headers.get("x-api-key") || "";
        const version = req.headers.get("anthropic-version") || "";
        const beta = req.headers.get("anthropic-beta") || "";

        if (isStreaming) {
          const body = [
            "event: message_start",
            `data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}`,
            "",
            "event: content_block_start",
            'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
            "",
            "event: content_block_delta",
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi!"}}',
            "",
            "event: content_block_stop",
            'data: {"type":"content_block_stop","index":0}',
            "",
            "event: message_delta",
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}',
            "",
            "event: message_stop",
            'data: {"type":"message_stop"}',
          ].join("\n");

          return new Response(body, {
            headers: {
              "Content-Type": "text/event-stream",
              "anthropic-version": version,
              "request-id": "req_test",
            },
          });
        }

        return new Response(
          JSON.stringify({
            id: "msg_test",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Hello!" }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 3 },
            _echo: { apiKey, version, beta },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "request-id": "req_test",
              "anthropic-ratelimit-remaining": "99",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          type: "error",
          error: { type: "not_found_error", message: "Not found" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  mockBaseUrl = `http://localhost:${mockServer.port}`;
  config.anthropicBaseUrl = mockBaseUrl;
  config.proxyApiKey = "";
  config.anthropicApiKey = "";
});

afterAll(() => {
  mockServer.stop();
});

const createApp = () => new Elysia().use(anthropicController);

describe("anthropicController", () => {
  test("forwards messages request to Anthropic upstream", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.model).toBe("claude-sonnet-4-20250514");
    expect((data.content as Array<{ text: string }>)[0]?.text).toBe("Hello!");
  });

  test("forwards correct Anthropic headers", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "test" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<
      string,
      { apiKey: string; version: string; beta: string }
    >;
    expect(data._echo?.apiKey).toBe("sk-ant-test");
    expect(data._echo?.version).toBe("2023-06-01");
    expect(data._echo?.beta).toBe("max-tokens-3-5-sonnet-2024-07-15");
  });

  test("uses config anthropicApiKey when set", async () => {
    config.anthropicApiKey = "sk-ant-server-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "sk-ant-client-key",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "test" }],
          }),
        }),
      );

      const data = (await res.json()) as Record<string, { apiKey: string }>;
      expect(data._echo?.apiKey).toBe("sk-ant-server-key");
    } finally {
      config.anthropicApiKey = "";
    }
  });

  test("extracts API key from Authorization Bearer header", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-ant-from-bearer",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "test" }],
        }),
      }),
    );

    const data = (await res.json()) as Record<string, { apiKey: string }>;
    expect(data._echo?.apiKey).toBe("sk-ant-from-bearer");
  });

  test("returns x-request-id header", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  test("preserves x-request-id from consumer", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
          "x-request-id": "my-trace-id",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.headers.get("x-request-id")).toBe("my-trace-id");
  });

  test("forwards x-session-id without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
          "x-session-id": "sess-abc-123",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test("enforces proxy API key when configured", async () => {
    config.proxyApiKey = "test-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "wrong-key",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "hi" }],
          }),
        }),
      );

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("invalid_api_key");
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("allows request with correct proxy API key via x-api-key", async () => {
    config.proxyApiKey = "test-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "test-key",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "hi" }],
          }),
        }),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("allows request with correct proxy API key via Authorization Bearer", async () => {
    config.proxyApiKey = "test-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-key",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "hi" }],
          }),
        }),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("returns 502 for unreachable upstream", async () => {
    const originalUrl = config.anthropicBaseUrl;
    const originalLevel = logger.level;
    config.anthropicBaseUrl = "http://localhost:1";
    logger.level = "silent";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "test",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "hi" }],
          }),
        }),
      );

      expect(res.status).toBe(502);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("connection_error");
    } finally {
      config.anthropicBaseUrl = originalUrl;
      logger.level = originalLevel;
    }
  });

  test("preserves streaming responses", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: message_start");
    expect(body).toContain("text_delta");
    expect(body).toContain("Hi!");
  });

  test("forwards anthropic- prefixed response headers", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.headers.get("anthropic-ratelimit-remaining")).toBe("99");
  });

  test("falls back to config anthropicVersion when not in request", async () => {
    config.anthropicVersion = "2024-01-01";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "test",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{ role: "user", content: "test" }],
          }),
        }),
      );

      const data = (await res.json()) as Record<string, { version: string }>;
      expect(data._echo?.version).toBe("2024-01-01");
    } finally {
      config.anthropicVersion = "2023-06-01";
    }
  });
});
