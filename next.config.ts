import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: process.env.NEXT_PUBLIC_SITE_URL
        ? [process.env.NEXT_PUBLIC_SITE_URL]
        : ["localhost:3000"],
    },
    turbopackFileSystemCacheForDev: true,
  },
  transpilePackages: ["@base-ui/react"],
  serverExternalPackages: ["@libsql/client"],
}

export default nextConfig
