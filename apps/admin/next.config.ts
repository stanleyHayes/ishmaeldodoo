import type { NextConfig } from "next";
import { adminSecurityHeaders } from "./security-headers.mjs";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: adminSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
