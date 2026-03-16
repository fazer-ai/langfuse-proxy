import Elysia from "elysia";
import { healthController } from "@/api/features/health/health.controller";

const api = new Elysia().use(healthController);

export default api;
