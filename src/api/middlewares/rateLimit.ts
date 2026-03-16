import { rateLimit } from "elysia-rate-limit";
import { translate } from "@/api/lib/i18n";

const STATIC_EXTENSIONS =
  /\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/i;

const isStaticRequest = (request: Request): boolean => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (STATIC_EXTENSIONS.test(path)) return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/css/")) return true;
  if (path.startsWith("/js/")) return true;
  if (path.startsWith("/locales/")) return true;

  return false;
};

export const rateLimitMiddleware = () =>
  rateLimit({
    duration: 60000, // 1 minute
    max: 100, // 100 requests per minute
    errorResponse: translate(
      "errors.rateLimitExceeded",
      "Rate limit exceeded. Please try again later.",
    ),
    skip: (request) => isStaticRequest(request),
    scoping: "scoped",
  });

export const strictRateLimitMiddleware = () =>
  rateLimit({
    duration: 60000, // 1 minute
    max: 10, // 10 requests per minute
    errorResponse: translate(
      "errors.rateLimitExceeded",
      "Rate limit exceeded. Please try again later.",
    ),
    scoping: "scoped",
  });

export const staticRateLimitMiddleware = () =>
  rateLimit({
    duration: 60000, // 1 minute
    max: 1000, // 1000 requests per minute
    errorResponse: translate(
      "errors.rateLimitExceeded",
      "Rate limit exceeded. Please try again later.",
    ),
    skip: (request) => !isStaticRequest(request),
    scoping: "scoped",
  });
