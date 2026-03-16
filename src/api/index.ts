import Elysia from "elysia";
import { adminController } from "@/api/features/admin/admin.controller";
import { authController } from "@/api/features/auth/auth.controller";
import { healthController } from "@/api/features/health/health.controller";
import { i18nController } from "@/api/features/i18n/i18n.controller";

const api = new Elysia()
  .use(authController)
  .use(healthController)
  .use(i18nController)
  .use(adminController);

export default api;
