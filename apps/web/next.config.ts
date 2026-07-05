import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Type errors are gated by `npm run typecheck` (turbo + CI), not duplicated in the build.
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["@wealthos/domain", "@wealthos/i18n", "@wealthos/api", "@wealthos/db", "@wealthos/ingestion", "@wealthos/engine-verification", "@wealthos/registry", "@wealthos/engine-goals", "@wealthos/engine-strategy"],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
