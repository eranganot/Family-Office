import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wealthos/domain"],
  poweredByHeader: false,
};

export default nextConfig;
