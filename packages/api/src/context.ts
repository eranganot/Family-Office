import type { PrismaClient } from "@wealthos/db";

export interface Session {
  email: string;
}

export interface Context {
  session: Session | null;
  db: PrismaClient;
}
