import Elysia from "elysia";
import config from "@/config";

export const healthController = new Elysia({ prefix: "/health" }).get(
  "/",
  async () => {
    const base = {
      name: config.packageInfo.name,
      version: config.packageInfo.version,
    };

    let upstream: "ok" | "unreachable" = "ok";
    try {
      const res = await fetch(`${config.upstreamBaseUrl}/v1/models`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
        headers: config.upstreamApiKey
          ? { Authorization: `Bearer ${config.upstreamApiKey}` }
          : {},
      });
      if (!res.ok) upstream = "unreachable";
    } catch {
      upstream = "unreachable";
    }

    return {
      ...base,
      status: upstream === "ok" ? "ok" : "degraded",
      upstream,
    };
  },
);
