import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });
  if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = client;
  return client;
}

/** Lazy singleton — created on first property access, not at import. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = (globalForPrisma.prisma ??= createClient());
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
