import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Type errors are gated by `npm run typecheck` (turbo + CI), not duplicated in the build.
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["@wealthos/domain", "@wealthos/i18n", "@wealthos/api", "@wealthos/db", "@wealthos/ingestion", "@wealthos/engine-verification", "@wealthos/registry", "@wealthos/engine-goals", "@wealthos/engine-strategy", "@wealthos/engine-scenario", "@wealthos/engine-monitoring", "@wealthos/engine-operations"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Next defaults Server Action bodies to 1 MB. Statement upload sends files as
      // base64 inside a Server Action, which inflates them ~34%, so a couple of PDF
      // statements alone exceed the default and the request dies with an opaque
      // "A server error occurred" before any of our code runs. Statements are small
      // (tens to hundreds of KB each); 25 MB comfortably covers a multi-file batch.
      bodySizeLimit: "25mb",
    },
  },
};

export default withNextIntl(nextConfig);
