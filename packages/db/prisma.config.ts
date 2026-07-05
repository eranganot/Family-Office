// Prisma 7 configuration: connection URL for CLI/Migrate lives here, not in schema.prisma.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "postgresql://wealthos:wealthos@localhost:5432/wealthos",
  },
});
