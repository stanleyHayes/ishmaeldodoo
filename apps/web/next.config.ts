import type { NextConfig } from "next";
import { publicSecurityHeaders } from "./security-headers.mjs";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: publicSecurityHeaders() }];
  },
};

export default nextConfig;
