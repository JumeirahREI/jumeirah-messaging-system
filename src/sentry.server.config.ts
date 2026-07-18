import * as Sentry from "@sentry/nextjs"

console.log(
  "[sentry.server.config] loading, DSN=",
  process.env.SENTRY_DSN ? "set" : "unset"
)

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  includeLocalVariables: true,

  debug: true,
})
