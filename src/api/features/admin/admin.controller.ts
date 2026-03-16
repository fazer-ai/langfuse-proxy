import { Elysia, t } from "elysia";
import { authPlugin } from "@/api/lib/auth";
import { translate } from "@/api/lib/i18n";
import { getAdminStats, getUsers, updateUserRole } from "./admin.service";

export const adminController = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .guard({ requireAdmin: true })
  .get("/stats", async () => {
    const stats = await getAdminStats();
    return { stats };
  })
  .get(
    "/users",
    async ({ query }) => {
      const page = Number(query.page) || 1;
      const search = query.search?.trim() || undefined;
      const result = await getUsers(page, search);

      return {
        users: result.users.map((u) => ({
          ...u,
          id: u.id.toString(),
        })),
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/users/:id/role",
    async ({ params, body, set, getAuthUser }) => {
      const currentUser = await getAuthUser();
      if (currentUser?.id.toString() === params.id && body.role === "USER") {
        set.status = 403;
        return {
          error: translate("errors.cannotDemoteSelf", "Cannot demote yourself"),
        };
      }
      try {
        const user = await updateUserRole(
          BigInt(params.id),
          body.role as "USER" | "ADMIN",
        );
        return { user: { ...user, id: user.id.toString() } };
      } catch {
        set.status = 404;
        return {
          error: translate("errors.userNotFound", "User not found"),
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        role: t.Union([t.Literal("USER"), t.Literal("ADMIN")]),
      }),
    },
  );
