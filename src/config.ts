import type { LevelWithSilentOrString } from "pino";
import packageInfo from "@/../package.json";

const {
  NODE_ENV,
  PORT,
  LOG_LEVEL,
  UPSTREAM_BASE_URL,
  UPSTREAM_API_KEY,
  PROXY_API_KEY,
  PROXY_TIMEOUT_MS,
  LANGFUSE_BASE_URL,
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY,
  TELEMETRY_MAX_BODY_BYTES,
} = process.env;

const config = {
  packageInfo: {
    name: packageInfo.name,
    version: packageInfo.version,
  },
  port: PORT ? Number(PORT) : 3000,
  env: (NODE_ENV || "development") as "development" | "production",
  logLevel: (LOG_LEVEL || "info") as LevelWithSilentOrString,
  upstreamBaseUrl: UPSTREAM_BASE_URL || "https://api.openai.com",
  upstreamApiKey: UPSTREAM_API_KEY || "",
  proxyApiKey: PROXY_API_KEY || "",
  proxyTimeoutMs: PROXY_TIMEOUT_MS ? Number(PROXY_TIMEOUT_MS) : 300_000,
  langfuseBaseUrl: LANGFUSE_BASE_URL || "",
  langfusePublicKey: LANGFUSE_PUBLIC_KEY || "",
  langfuseSecretKey: LANGFUSE_SECRET_KEY || "",
  telemetryMaxBodyBytes: TELEMETRY_MAX_BODY_BYTES
    ? Number(TELEMETRY_MAX_BODY_BYTES)
    : 1_048_576,
};

export default config;
