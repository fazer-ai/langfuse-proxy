import { mock } from "bun:test";

export const mockUser = {
  id: BigInt(1),
  email: "test@example.com",
  passwordHash: "$2b$10$hashedpassword",
  name: null as string | null,
  role: "USER" as const,
  lastLoginAt: null as Date | null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export type MockUser = typeof mockUser | null;

export const mockFindFirst = mock(() => Promise.resolve(null as MockUser));
export const mockCreate = mock(() => Promise.resolve(mockUser));
export const mockUpdate = mock(() => Promise.resolve(mockUser));
export const mockQueryRaw = mock(() => Promise.resolve([{ 1: 1 }]));

export const prismaMock = {
  user: {
    findFirst: mockFindFirst,
    create: mockCreate,
    update: mockUpdate,
  },
  $queryRaw: mockQueryRaw,
};

export function setupPrismaMock() {
  mock.module("@/api/lib/prisma", () => ({
    default: prismaMock,
  }));
}

export function resetPrismaMocks() {
  mockFindFirst.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockQueryRaw.mockReset();
}
