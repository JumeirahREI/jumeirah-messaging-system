import { withSentryConfig } from "@sentry/nextjs"
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

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  authToken: process.env.SENTRY_AUTH_TOKEN,

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
})
