import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import type { UserRole } from "@/../generated/prisma/client";
import { translate } from "@/api/lib/i18n";
import logger from "@/api/lib/logger";
import prisma from "@/api/lib/prisma";
import config from "@/config";

const COOKIE_NAME = "auth_token";
const TOKEN_EXPIRY = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: bigint;
  email: string;
  name: string | null;
  role: UserRole;
}

export const authPlugin = new Elysia({ name: "auth" })
  .use(
    jwt({
      name: "jwt",
      secret: config.jwtSecret,
      exp: TOKEN_EXPIRY,
    }),
  )
  .derive({ as: "global" }, ({ jwt, cookie }) => ({
    async setAuthCookie(user: AuthUser) {
      const token = await jwt.sign({
        userId: user.id.toString(),
        email: user.email,
        role: user.role,
      });

      cookie[COOKIE_NAME]?.set({
        value: token,
        httpOnly: true,
        secure: config.env === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });

      return token;
    },
    clearAuthCookie() {
      cookie[COOKIE_NAME]?.remove();
    },
    async getAuthUser(): Promise<AuthUser | null> {
      const token = cookie[COOKIE_NAME]?.value;
      if (!token || typeof token !== "string") return null;

      try {
        const payload = (await jwt.verify(token)) as JWTPayload | false;
        if (!payload) return null;

        const user = await prisma.user.findUnique({
          where: { id: BigInt(payload.userId) },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });

        return user;
      } catch (error) {
        logger.debug({ error }, "Failed to get auth user from token");
        return null;
      }
    },
  }))
  .macro({
    requireAuth(enabled: boolean) {
      if (!enabled) return;

      return {
        async beforeHandle({ getAuthUser, set }) {
          const user = await getAuthUser();
          if (!user) {
            set.status = 401;
            return { error: translate("errors.unauthorized", "Unauthorized") };
          }
        },
      };
    },
    requireAdmin(enabled: boolean) {
      if (!enabled) return;

      return {
        async beforeHandle({ getAuthUser, set }) {
          const user = await getAuthUser();
          if (!user) {
            set.status = 401;
            return { error: translate("errors.unauthorized", "Unauthorized") };
          }
          if (user.role !== "ADMIN") {
            set.status = 403;
            return { error: translate("errors.forbidden", "Forbidden") };
          }
        },
      };
    },
  });
