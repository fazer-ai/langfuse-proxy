import { beforeEach, describe, expect, test } from "bun:test";
import {
  mockCreate,
  mockFindFirst,
  mockUser,
  resetPrismaMocks,
  setupPrismaMock,
} from "@/tests/utils/prisma-mock";

setupPrismaMock();

const { getUserByEmail, createUser, hashPassword, verifyPassword } =
  await import("@/api/features/auth/auth.service");

describe("auth.service", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  describe("getUserByEmail", () => {
    test("returns user when found", async () => {
      mockFindFirst.mockResolvedValueOnce(mockUser);

      const result = await getUserByEmail("test@example.com");

      expect(result).toEqual(mockUser);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    test("returns null when user not found", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await getUserByEmail("nonexistent@example.com");

      expect(result).toBeNull();
    });

    test("trims and searches case-insensitively", async () => {
      mockFindFirst.mockResolvedValueOnce(mockUser);

      await getUserByEmail("  TEST@EXAMPLE.COM  ");

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { email: { equals: "TEST@EXAMPLE.COM", mode: "insensitive" } },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          role: true,
        },
      });
    });
  });

  describe("createUser", () => {
    test("creates user with trimmed lowercase email", async () => {
      const createdUser = { ...mockUser, email: "new@example.com" };
      mockCreate.mockResolvedValueOnce(createdUser);

      const result = await createUser("  NEW@EXAMPLE.COM  ", "hashedPassword");

      expect(result).toEqual(createdUser);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          email: "new@example.com",
          passwordHash: "hashedPassword",
        },
      });
    });

    test("returns created user with all fields", async () => {
      mockCreate.mockResolvedValueOnce(mockUser);

      const result = await createUser("test@example.com", "hashedPassword");

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("email");
      expect(result).toHaveProperty("passwordHash");
      expect(result).toHaveProperty("role");
    });
  });

  describe("hashPassword", () => {
    test("hashes a password using bcrypt", async () => {
      const password = "securePassword123";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]?\$/);
    });

    test("produces different hashes for the same password (salt)", async () => {
      const password = "securePassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    test("returns true for matching password and hash", async () => {
      const password = "securePassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test("returns false for non-matching password", async () => {
      const password = "securePassword123";
      const wrongPassword = "wrongPassword456";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    test("returns false for empty password", async () => {
      const password = "securePassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword("", hash);

      expect(isValid).toBe(false);
    });
  });
});
