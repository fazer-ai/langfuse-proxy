import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { healthController } from "@/api/features/health/health.controller";

const createApp = () => new Elysia().use(healthController);

describe("healthController", () => {
  describe("GET /health", () => {
    test("returns response with package info", async () => {
      const app = createApp();
      const res = await app.handle(new Request("http://localhost/health"));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("name");
      expect(data).toHaveProperty("version");
      expect(data).toHaveProperty("status");
    });

    test("returns per-provider upstream status", async () => {
      const app = createApp();
      const res = await app.handle(new Request("http://localhost/health"));

      const data = (await res.json()) as {
        upstream: { openai: string; anthropic: string };
      };
      expect(data.upstream).toHaveProperty("openai");
      expect(data.upstream).toHaveProperty("anthropic");
    });
  });
});
