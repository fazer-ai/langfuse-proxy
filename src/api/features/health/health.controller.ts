import Elysia from "elysia";
import config from "@/config";

export const healthController = new Elysia({ prefix: "/health" }).get(
  "/",
  async () => {
    const base = {
      name: config.packageInfo.name,
      version: config.packageInfo.version,
    };

    let openai: "ok" | "unreachable" = "ok";
    try {
      const res = await fetch(`${config.upstreamBaseUrl}/v1/models`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
        headers: config.upstreamApiKey
          ? { Authorization: `Bearer ${config.upstreamApiKey}` }
          : {},
      });
      if (!res.ok) openai = "unreachable";
    } catch {
      openai = "unreachable";
    }

    let anthropic: "ok" | "unreachable" | "not_configured" = "not_configured";
    if (config.anthropicApiKey) {
      anthropic = "ok";
      try {
        const res = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
          headers: {
            "x-api-key": config.anthropicApiKey,
            "anthropic-version": config.anthropicVersion,
          },
        });
        // Anthropic returns 405 for HEAD on /v1/messages, treat non-network as ok
        if (res.status >= 500) anthropic = "unreachable";
      } catch {
        anthropic = "unreachable";
      }
    }

    const allOk =
      openai === "ok" && (anthropic === "ok" || anthropic === "not_configured");

    return {
      ...base,
      status: allOk ? "ok" : "degraded",
      upstream: {
        openai,
        anthropic,
      },
    };
  },
);
