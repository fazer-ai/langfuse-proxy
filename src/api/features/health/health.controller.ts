import Elysia from "elysia";
import prisma from "@/api/lib/prisma";
import config from "@/config";

type DbHealth = { ok: true } | { ok: false; error: string };

async function checkDb(): Promise<DbHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export const healthController = new Elysia({ prefix: "/health" }).get(
  "/",
  async () => {
    const base = {
      name: config.packageInfo.name,
      version: config.packageInfo.version,
    };

    const db = await checkDb();
    return {
      ...base,
      status: db.ok ? "ok" : "degraded",
      db,
    };
  },
);
