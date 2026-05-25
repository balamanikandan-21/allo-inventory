// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  // Ensure Prisma works correctly in the edge runtime
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
