import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  deepseekController,
  proxyController,
} from "@/api/features/proxy/proxy.controller";
import logger from "@/api/lib/logger";
import config from "@/config";

// Spin up a minimal upstream mock server
let mockServer: ReturnType<typeof Bun.serve>;
let mockBaseUrl: string;

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/v1/chat/completions") {
        return new Response(
          JSON.stringify({
            model: "gpt-4o-mini",
            choices: [{ message: { role: "assistant", content: "Hi there!" } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 3,
              total_tokens: 13,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.pathname === "/v1/models") {
        return new Response(JSON.stringify({ data: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: { message: "Not found", type: "invalid_request_error" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  mockBaseUrl = `http://localhost:${mockServer.port}`;
  config.upstreamBaseUrl = mockBaseUrl;
  config.proxyApiKey = "";
  config.upstreamApiKey = "";
  config.deepseekBaseUrl = mockBaseUrl;
  config.deepseekApiKey = "";
});

afterAll(() => {
  mockServer.stop();
});

const createApp = () => new Elysia().use(proxyController);

describe("proxyController", () => {
  test("forwards chat completions request", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.model).toBe("gpt-4o-mini");
    expect(
      (data.choices as Array<{ message: { content: string } }>)[0]?.message
        .content,
    ).toBe("Hi there!");
  });

  test("returns x-request-id header", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/models", { method: "GET" }),
    );

    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  test("preserves x-request-id from consumer", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/models", {
        method: "GET",
        headers: { "x-request-id": "my-trace-id" },
      }),
    );

    expect(res.headers.get("x-request-id")).toBe("my-trace-id");
  });

  test("enforces proxy API key when configured", async () => {
    config.proxyApiKey = "test-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/models", {
          method: "GET",
          headers: { Authorization: "Bearer wrong-key" },
        }),
      );

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("invalid_api_key");
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("allows request with correct proxy API key", async () => {
    config.proxyApiKey = "test-key";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/models", {
          method: "GET",
          headers: { Authorization: "Bearer test-key" },
        }),
      );

      expect(res.status).toBe(200);
    } finally {
      config.proxyApiKey = "";
    }
  });

  test("returns 502 for unreachable upstream", async () => {
    const originalUrl = config.upstreamBaseUrl;
    const originalLevel = logger.level;
    config.upstreamBaseUrl = "http://localhost:1";
    logger.level = "silent";
    try {
      const app = createApp();
      const res = await app.handle(
        new Request("http://localhost/v1/models", { method: "GET" }),
      );

      expect(res.status).toBe(502);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe("connection_error");
    } finally {
      config.upstreamBaseUrl = originalUrl;
      logger.level = originalLevel;
    }
  });

  test("forwards x-session-id without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": "sess-abc-123",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test("forwards x-user-id without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "tenant-acme",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test("forwards x-langfuse-tags without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-langfuse-tags": "premium, internal",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test("forwards x-langfuse-metadata without error", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-langfuse-metadata": JSON.stringify({
            orgId: "org_123",
            region: "us-east",
          }),
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test("preserves query string", async () => {
    let capturedUrl = "";
    const captureServer = Bun.serve({
      port: 0,
      fetch(req) {
        capturedUrl = req.url;
        return new Response(JSON.stringify({ data: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const originalUrl = config.upstreamBaseUrl;
    config.upstreamBaseUrl = `http://localhost:${captureServer.port}`;
    try {
      const app = createApp();
      await app.handle(
        new Request("http://localhost/v1/models?foo=bar&baz=1", {
          method: "GET",
        }),
      );

      expect(capturedUrl).toContain("?foo=bar&baz=1");
    } finally {
      config.upstreamBaseUrl = originalUrl;
      captureServer.stop();
    }
  });
});

describe("deepseekController", () => {
  const createDeepseekApp = () => new Elysia().use(deepseekController);

  test("remaps /deepseek/v1/* to upstream /v1/*", async () => {
    let capturedPath = "";
    const captureServer = Bun.serve({
      port: 0,
      fetch(req) {
        capturedPath = new URL(req.url).pathname;
        return new Response(
          JSON.stringify({
            model: "deepseek-chat",
            choices: [{ message: { role: "assistant", content: "Olá!" } }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    });
    const original = config.deepseekBaseUrl;
    config.deepseekBaseUrl = `http://localhost:${captureServer.port}`;
    try {
      const app = createDeepseekApp();
      const res = await app.handle(
        new Request("http://localhost/deepseek/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "oi" }],
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(capturedPath).toBe("/v1/chat/completions");
      const data = (await res.json()) as Record<string, unknown>;
      expect(data.model).toBe("deepseek-chat");
    } finally {
      config.deepseekBaseUrl = original;
      captureServer.stop();
    }
  });

  test("forwards consumer Authorization to deepseek upstream", async () => {
    let capturedAuth = "";
    const captureServer = Bun.serve({
      port: 0,
      fetch(req) {
        capturedAuth = req.headers.get("authorization") || "";
        return new Response(JSON.stringify({ data: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const original = config.deepseekBaseUrl;
    config.deepseekBaseUrl = `http://localhost:${captureServer.port}`;
    try {
      const app = createDeepseekApp();
      await app.handle(
        new Request("http://localhost/deepseek/v1/models", {
          method: "GET",
          headers: { Authorization: "Bearer sk-deepseek-test" },
        }),
      );

      expect(capturedAuth).toBe("Bearer sk-deepseek-test");
    } finally {
      config.deepseekBaseUrl = original;
      captureServer.stop();
    }
  });

  test("coexists with OpenAI catch-all without route collision", async () => {
    let deepseekHit = false;
    const deepseekServer = Bun.serve({
      port: 0,
      fetch() {
        deepseekHit = true;
        return new Response(
          JSON.stringify({ model: "deepseek-chat", choices: [] }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    });
    const original = config.deepseekBaseUrl;
    config.deepseekBaseUrl = `http://localhost:${deepseekServer.port}`;
    try {
      // Same mount order as app.ts: deepseek before the /v1/* catch-all
      const app = new Elysia().use(deepseekController).use(proxyController);

      // OpenAI path must still reach the OpenAI upstream, not deepseek
      const openaiRes = await app.handle(
        new Request("http://localhost/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
        }),
      );
      const openaiData = (await openaiRes.json()) as Record<string, unknown>;
      expect(openaiData.model).toBe("gpt-4o-mini");
      expect(deepseekHit).toBe(false);

      // DeepSeek path must reach the deepseek upstream
      const dsRes = await app.handle(
        new Request("http://localhost/deepseek/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "deepseek-chat", messages: [] }),
        }),
      );
      const dsData = (await dsRes.json()) as Record<string, unknown>;
      expect(dsData.model).toBe("deepseek-chat");
      expect(deepseekHit).toBe(true);
    } finally {
      config.deepseekBaseUrl = original;
      deepseekServer.stop();
    }
  });
});
