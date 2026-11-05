import * as Sentry from "@sentry/nextjs"

import { parseSampleRate, scrubEvent } from "@/lib/sentry-scrub"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  sendDefaultPii: false,
  debug: false,

  replaysSessionSampleRate: parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_RATE,
    0
  ),
  replaysOnErrorSampleRate: parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_RATE,
    1
  ),

  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],

  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
