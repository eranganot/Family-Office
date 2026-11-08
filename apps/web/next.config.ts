import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // WO-3 (2026-11-05): no ignoreBuildErrors. Railway builds on every push to
  // main without waiting for CI, so the build itself is the last type gate.
  transpilePackages: ["@wealthos/domain", "@wealthos/i18n", "@wealthos/api", "@wealthos/db", "@wealthos/ingestion", "@wealthos/engine-verification", "@wealthos/registry", "@wealthos/engine-goals", "@wealthos/engine-strategy", "@wealthos/engine-scenario", "@wealthos/engine-monitoring", "@wealthos/engine-operations"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // pdfjs-dist must NOT be bundled. `@wealthos/ingestion` is transpiled (above), so
  // Next follows its dynamic `import("pdfjs-dist/legacy/build/pdf.mjs")` into the
  // server bundle, where pdfjs's worker/optional-canvas resolution breaks at runtime.
  // Marking it external makes it load from node_modules as a plain Node module.
  serverExternalPackages: ["pdfjs-dist"],
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
