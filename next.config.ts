import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    turbopackFileSystemCacheForDev: true,
  },
  transpilePackages: ["@base-ui/react"],
  serverExternalPackages: ["@libsql/client"],
}

export default nextConfig
