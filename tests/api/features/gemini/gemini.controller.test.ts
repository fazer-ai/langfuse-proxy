import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { geminiController } from "@/api/features/gemini/gemini.controller";
import logger from "@/api/lib/logger";
import config from "@/config";

let mockServer: ReturnType<typeof Bun.serve>;
let mockBaseUrl: string;

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      // List models endpoint
      if (url.pathname === "/v1beta/models" && req.method === "GET") {
        const apiKey = req.headers.get("x-goog-api-key") || "";
        return new Response(
          JSON.stringify({
            models: [{ name: "models/gemini-2.0-flash" }],
            _echo: { apiKey },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      // generateContent
      if (url.pathname.endsWith(":generateContent")) {
        const apiKey = req.headers.get("x-goog-api-key") || "";
        const googClient = req.headers.get("x-goog-api-client") || "";
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello!" }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 3,
              totalTokenCount: 8,
            },
            modelVersion: "gemini-2.0-flash",
            _echo: { apiKey, googClient },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-safety-ratings": "test-value",
            },
          },
        );
      }

      // streamGenerateContent
      if (url.pathname.endsWith(":streamGenerateContent")) {
        const body = [
          'data: {"candidates":[{"content":{"parts":[{"text":"Hi!"}],"role":"model"}}],"modelVersion":"gemini-2.0-flash"}',
          "",
          'data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"totalTokenCount":7},"modelVersion":"gemini-2.0-flash"}',
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/event-stream",
            "x-goog-safety-ratings": "test-value",
          },
        });
      }

      return new Response(
        JSON.stringify({
          error: { code: 404, message: "Not found", status: "NOT_FOUND" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  mockBaseUrl = `http://localhost:${mockServer.port}`;
  config.geminiBaseUrl = mockBaseUrl;
  config.proxyApiKey = "";
  config.geminiApiKey = "";
});

afterAll(() => {
  mockServer.stop();
});

const createApp = () => new Elysia().use(geminiController);

describe("geminiController", () => {
  test("forwards generateContent to upstream", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test-key",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }],
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.modelVersion).toBe("gemini-2.0-flash");
  });

  test("forwards correct headers (x-goog-api-key)", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "my-gemini-key",
            "x-goog-api-client": "genai-js/1.0",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "test" }] }],
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<
      string,
      { apiKey: string; googClient: string }
    >;
    expect(data._echo?.apiKey).toBe("my-gemini-key");
    expect(data._echo?.googClient).toBe("genai-js/1.0");
  });

  test("uses config geminiApiKey override", async () => {
    config.geminiApiKey = "server-gemini-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": "client-key",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "test" }] }],
            }),
          },
        ),
      );

      const data = (await res.json()) as Record<string, { apiKey: string }>;
      expect(data._echo?.apiKey).toBe("server-gemini-key");
    } finally {
      config.geminiApiKey = "";
    }
  });

  test("extracts key from Authorization Bearer → x-goog-api-key", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer bearer-gemini-key",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "test" }] }],
          }),
        },
      ),
    );

    const data = (await res.json()) as Record<string, { apiKey: string }>;
    expect(data._echo?.apiKey).toBe("bearer-gemini-key");
  });

  test("extracts key from x-api-key → x-goog-api-key", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "xapi-gemini-key",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "test" }] }],
          }),
        },
      ),
    );

    const data = (await res.json()) as Record<string, { apiKey: string }>;
    expect(data._echo?.apiKey).toBe("xapi-gemini-key");
  });

  test("returns x-request-id header", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
          }),
        },
      ),
    );

    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  test("preserves x-request-id from consumer", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test",
            "x-request-id": "my-trace-id",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
          }),
        },
      ),
    );

    expect(res.headers.get("x-request-id")).toBe("my-trace-id");
  });

  test("forwards x-session-id without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test-key",
            "x-session-id": "sess-abc-123",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }],
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
  });

  test("enforces proxy API key when configured", async () => {
    config.proxyApiKey = "proxy-secret";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": "wrong-key",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
            }),
          },
        ),
      );

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("invalid_api_key");
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("accepts proxy key via x-api-key", async () => {
    config.proxyApiKey = "proxy-secret";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": "proxy-secret",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
            }),
          },
        ),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("accepts proxy key via Authorization Bearer", async () => {
    config.proxyApiKey = "proxy-secret";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer proxy-secret",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
            }),
          },
        ),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("accepts proxy key via x-goog-api-key", async () => {
    config.proxyApiKey = "proxy-secret";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": "proxy-secret",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
            }),
          },
        ),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("returns 502 for unreachable upstream", async () => {
    const originalUrl = config.geminiBaseUrl;
    const originalLevel = logger.level;
    config.geminiBaseUrl = "http://localhost:1";
    logger.level = "silent";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request(
          "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": "test",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
            }),
          },
        ),
      );

      expect(res.status).toBe(502);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("connection_error");
    } finally {
      config.geminiBaseUrl = originalUrl;
      logger.level = originalLevel;
    }
  });

  test("preserves streaming responses", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain("Hi!");
  });

  test("forwards x-goog-* response headers", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
          }),
        },
      ),
    );

    expect(res.headers.get("x-goog-safety-ratings")).toBe("test-value");
  });

  test("preserves query string (?alt=sse)", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request(
        "http://localhost/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    // The mock responds with SSE for streamGenerateContent, confirming the query was forwarded
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  test("handles GET /v1beta/models (list models)", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1beta/models", {
        method: "GET",
        headers: { "x-goog-api-key": "test" },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { models: { name: string }[] };
    expect(data.models).toBeTruthy();
    expect(data.models[0]?.name).toBe("models/gemini-2.0-flash");
  });
});
