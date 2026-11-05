import * as Sentry from "@sentry/nextjs"

import { scrubEvent } from "@/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  includeLocalVariables: false,
  sendDefaultPii: false,
  debug: false,

  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
})
