import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

import { createLoginGuard } from "@/lib/server/login-attempts"

export const CHANGE_PASSWORD_USER_MAX_FAILURES = 5
export const CHANGE_PASSWORD_IP_MAX_FAILURES = 30

function createLimiters() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    return null
  const redis = Redis.fromEnv()
  return {
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        CHANGE_PASSWORD_USER_MAX_FAILURES,
        "15 m"
      ),
      prefix: "ratelimit:changepw:user",
    }),
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CHANGE_PASSWORD_IP_MAX_FAILURES, "15 m"),
      prefix: "ratelimit:changepw:ip",
    }),
  }
}

export const changePasswordGuard = createLoginGuard(createLimiters())
