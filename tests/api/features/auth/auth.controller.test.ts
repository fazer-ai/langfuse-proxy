import { beforeEach, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { Elysia } from "elysia";
import {
  mockCreate,
  mockFindFirst,
  mockUser,
  resetPrismaMocks,
  setupPrismaMock,
} from "@/tests/utils/prisma-mock";

setupPrismaMock();

const { authController } = await import("@/api/features/auth/auth.controller");

const createTestClient = () => {
  const app = new Elysia().use(authController);
  return treaty(app);
};

describe("authController", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  describe("POST /auth/signup", () => {
    test("creates a new user successfully", async () => {
      mockFindFirst.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce(mockUser);

      const api = createTestClient();
      const response = await api.auth.signup.post({
        email: "newuser@example.com",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("user");
      expect(response.data?.user).toMatchObject({
        id: mockUser.id.toString(),
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    test("returns 400 for duplicate email", async () => {
      mockFindFirst.mockResolvedValueOnce(mockUser);

      const api = createTestClient();
      const response = await api.auth.signup.post({
        email: "existing@example.com",
        password: "password123",
      });

      expect(response.status).toBe(400);
      expect(response.error?.value).toHaveProperty(
        "error",
        "Email already in use",
      );
    });

    test("validates email format (returns 422)", async () => {
      const api = createTestClient();
      const response = await api.auth.signup.post({
        email: "invalid-email",
        password: "password123",
      });

      expect(response.status).toBe(422);
    });

    test("validates password minimum length (returns 422)", async () => {
      const api = createTestClient();
      const response = await api.auth.signup.post({
        email: "test@example.com",
        password: "short",
      });

      expect(response.status).toBe(422);
    });
  });

  describe("POST /auth/login", () => {
    test("logs in with valid credentials", async () => {
      const hashedPassword = await Bun.password.hash("password123", {
        algorithm: "bcrypt",
        cost: 4,
      });
      const userWithHash = { ...mockUser, passwordHash: hashedPassword };

      mockFindFirst.mockResolvedValueOnce(userWithHash);

      const api = createTestClient();
      const response = await api.auth.login.post({
        email: "test@example.com",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("user");
      expect(response.data?.user?.email).toBe(mockUser.email);
    });

    test("returns 401 for non-existent user", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const api = createTestClient();
      const response = await api.auth.login.post({
        email: "nonexistent@example.com",
        password: "password123",
      });

      expect(response.status).toBe(401);
      expect(response.error?.value).toHaveProperty(
        "error",
        "Invalid email or password",
      );
    });

    test("returns 401 for wrong password", async () => {
      const hashedPassword = await Bun.password.hash("correctpassword", {
        algorithm: "bcrypt",
        cost: 4,
      });
      const userWithHash = { ...mockUser, passwordHash: hashedPassword };

      mockFindFirst.mockResolvedValueOnce(userWithHash);

      const api = createTestClient();
      const response = await api.auth.login.post({
        email: "test@example.com",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.error?.value).toHaveProperty(
        "error",
        "Invalid email or password",
      );
    });
  });

  describe("GET /auth/me", () => {
    test("returns 401 when not authenticated", async () => {
      const api = createTestClient();
      const response = await api.auth.me.get();

      expect(response.status).toBe(401);
      expect(response.error?.value).toHaveProperty("error", "Unauthorized");
    });
  });

  describe("POST /auth/logout", () => {
    test("logs out successfully", async () => {
      const api = createTestClient();
      const response = await api.auth.logout.post();

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("success", true);
    });
  });
});
