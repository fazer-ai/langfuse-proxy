import prisma from "@/api/lib/prisma";

export async function getUsers(page = 1, search?: string) {
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const where = search
    ? { email: { contains: search, mode: "insensitive" as const } }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAdminStats() {
  const [totalUsers, adminCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
  ]);

  return { totalUsers, adminCount };
}

export async function updateUserRole(userId: bigint, role: "USER" | "ADMIN") {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
}
