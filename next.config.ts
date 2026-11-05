import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

import { resolveAllowedOrigins } from "./src/lib/site-url"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: resolveAllowedOrigins(process.env.NEXT_PUBLIC_SITE_URL),
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
