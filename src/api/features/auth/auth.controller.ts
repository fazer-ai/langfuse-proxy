import { Elysia, t } from "elysia";
import {
  createUser,
  getUserByEmail,
  hashPassword,
  updateLastLogin,
  verifyPassword,
} from "@/api/features/auth/auth.service";
import { authPlugin } from "@/api/lib/auth";
import { translate } from "@/api/lib/i18n";

export const authController = new Elysia({ prefix: "/auth" })
  .use(authPlugin)
  .post(
    "/signup",
    async ({ body, set, setAuthCookie }) => {
      const { email, password } = body;

      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        set.status = 400;
        return {
          error: translate("errors.emailInUse", "Email already in use"),
        };
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser(email, passwordHash);

      await setAuthCookie(user);

      return {
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, set, setAuthCookie }) => {
      const { email, password } = body;

      const user = await getUserByEmail(email);
      if (!user) {
        set.status = 401;
        return {
          error: translate(
            "errors.invalidCredentials",
            "Invalid email or password",
          ),
        };
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        set.status = 401;
        return {
          error: translate(
            "errors.invalidCredentials",
            "Invalid email or password",
          ),
        };
      }

      await setAuthCookie(user);
      updateLastLogin(user.id);

      return {
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    },
  )
  .get("/me", async ({ getAuthUser, set }) => {
    const user = await getAuthUser();
    if (!user) {
      set.status = 401;
      return { error: translate("errors.unauthorized", "Unauthorized") };
    }

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  })
  .post("/logout", ({ clearAuthCookie }) => {
    clearAuthCookie();
    return { success: true };
  });
