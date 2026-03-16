import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { authPlugin } from "@/api/lib/auth";

const mockUser = {
  id: BigInt(1),
  email: "test@example.com",
  name: null as string | null,
  passwordHash: "$2b$10$hashedpassword",
  role: "USER" as const,
};

const mockPrisma = {
  user: {
    findUnique: mock(() => Promise.resolve(null)),
  },
};

mock.module("@/api/lib/prisma", () => ({
  default: mockPrisma,
}));

describe("authPlugin", () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
  });

  describe("setAuthCookie", () => {
    test("returns valid JWT token with correct structure", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-set-cookie", async ({ setAuthCookie }) => {
          const token = await setAuthCookie(mockUser);
          return { token };
        });

      const response = await app.handle(
        new Request("http://localhost/test-set-cookie", { method: "POST" }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe("string");

      const parts = data.token.split(".");
      expect(parts).toHaveLength(3);

      const payload = JSON.parse(atob(parts[1]));
      expect(payload.userId).toBe(mockUser.id.toString());
      expect(payload.email).toBe(mockUser.email);
      expect(payload.role).toBe(mockUser.role);
    });

    test("includes expiration in JWT token", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-set-cookie", async ({ setAuthCookie }) => {
          const token = await setAuthCookie(mockUser);
          return { token };
        });

      const response = await app.handle(
        new Request("http://localhost/test-set-cookie", { method: "POST" }),
      );

      const data = await response.json();
      const parts = data.token.split(".");
      const payload = JSON.parse(atob(parts[1]));

      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });
  });

  describe("clearAuthCookie", () => {
    test("executes without error", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-clear-cookie", ({ clearAuthCookie }) => {
          clearAuthCookie();
          return { success: true };
        });

      const response = await app.handle(
        new Request("http://localhost/test-clear-cookie", {
          method: "POST",
          headers: { Cookie: "auth_token=some_token" },
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("getAuthUser", () => {
    test("returns null when no cookie present", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user"),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });

    test("returns null for invalid token", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user", {
          headers: { Cookie: "auth_token=invalid_token" },
        }),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });

    test("returns null for malformed JWT", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user", {
          headers: { Cookie: "auth_token=not.a.valid.jwt.token" },
        }),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });
  });

  describe("requireAuth macro", () => {
    test("rejects unauthenticated requests with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/protected", () => ({ message: "secret data" }), {
          requireAuth: true,
        });

      const response = await app.handle(
        new Request("http://localhost/protected"),
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    test("rejects requests with invalid token with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/protected", () => ({ message: "secret data" }), {
          requireAuth: true,
        });

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Cookie: "auth_token=invalid" },
        }),
      );

      expect(response.status).toBe(401);
    });
  });

  describe("requireAdmin macro", () => {
    test("rejects unauthenticated users with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/admin", () => ({ message: "admin data" }), {
          requireAdmin: true,
        });

      const response = await app.handle(new Request("http://localhost/admin"));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    test("rejects requests with invalid token with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/admin", () => ({ message: "admin data" }), {
          requireAdmin: true,
        });

      const response = await app.handle(
        new Request("http://localhost/admin", {
          headers: { Cookie: "auth_token=invalid" },
        }),
      );

      expect(response.status).toBe(401);
    });
  });
});
