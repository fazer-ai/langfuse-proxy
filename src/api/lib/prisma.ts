import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import config from "@/config";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.databaseUrl,
  }),
});

export default prisma;
