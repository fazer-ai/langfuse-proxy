import { shutdownLangfuse } from "@/api/lib/langfuse";
import logger, { deepSanitizeObject } from "@/api/lib/logger";
import app from "@/app";
import config from "@/config";

const MAX_PORT_ATTEMPTS = 10;

let port = config.port;

for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
  try {
    app.listen(port);
    break;
  } catch (error) {
    const code =
      error instanceof Error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS - 1) {
      logger.warn("Port %d is in use, trying %d...", port, port + 1);
      port++;
      continue;
    }
    throw error;
  }
}

logger.info(
  "Loaded config %s",
  JSON.stringify(
    deepSanitizeObject(
      { ...config, port },
      {
        omitKeys: [
          "upstreamApiKey",
          "proxyApiKey",
          "langfusePublicKey",
          "langfuseSecretKey",
        ],
      },
    ),
    null,
    2,
  ),
);
logger.info(
  `${config.packageInfo.name}@${config.packageInfo.version} running on http://${app.server?.hostname}:${app.server?.port}`,
);

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("%s received, shutting down gracefully...", signal);
  app.server?.stop();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await shutdownLangfuse();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
