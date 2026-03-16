import type { LevelWithSilentOrString } from "pino";
import packageInfo from "@/../package.json";

const {
  NODE_ENV,
  PUBLIC_URL,
  PORT,
  LOG_LEVEL,
  JWT_SECRET,
  CORS_ORIGIN,
  DATABASE_URL,
  CDN_URL,
} = process.env;

const config = {
  packageInfo: {
    name: packageInfo.name,
    version: packageInfo.version,
  },
  port: PORT ? Number(PORT) : 3000,
  publicUrl: PUBLIC_URL || "http://localhost:3000",
  env: (NODE_ENV || "development") as "development" | "production",
  logLevel: (LOG_LEVEL || "info") as LevelWithSilentOrString,
  jwtSecret: JWT_SECRET || "change-me-in-production",
  corsOrigin: CORS_ORIGIN || "localhost:3000",
  databaseUrl: DATABASE_URL,
  cdnUrl: CDN_URL || "http://localhost:3000",
};

if (
  config.env === "production" &&
  config.jwtSecret === "change-me-in-production"
) {
  throw new Error(
    "⚠️  JWT_SECRET must be set in production to something other than the default.",
  );
}

export default config;
