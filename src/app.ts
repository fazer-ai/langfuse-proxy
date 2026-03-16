import Elysia from "elysia";
import api from "@/api";
import { anthropicController } from "@/api/features/anthropic/anthropic.controller";
import { geminiController } from "@/api/features/gemini/gemini.controller";
import { proxyController } from "@/api/features/proxy/proxy.controller";
import logger from "@/api/lib/logger";

const app = new Elysia()
  .onAfterResponse(({ request, set }) => {
    logger.info("%s %s [%s]", request.method, request.url, set.status);
  })
  .onError(({ path, error, code }) => {
    logger.error("%s\n%s", path, error);
    if (code === "NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: {
            message: `${path} not found`,
            type: "invalid_request_error",
            code: "not_found",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (code === "INTERNAL_SERVER_ERROR") {
      return new Response(
        JSON.stringify({
          error: {
            message: "Internal server error",
            type: "server_error",
            code: "internal_error",
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  })
  .group("/api", (app) => app.use(api))
  .use(anthropicController)
  .use(geminiController)
  .use(proxyController);

export type App = typeof app;
export default app;
