import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return Redis.fromEnv()
}

const redis = getRedis()

export const LOGIN_USER_MAX_FAILURES = 5
export const LOGIN_IP_MAX_FAILURES = 30

export const loginLimiters = redis
  ? {
      user: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LOGIN_USER_MAX_FAILURES, "15 m"),
        prefix: "ratelimit:login:user",
      }),
      ip: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LOGIN_IP_MAX_FAILURES, "15 m"),
        prefix: "ratelimit:login:ip",
      }),
    }
  : null

export const mutationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "ratelimit:mutation",
    })
  : null

export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string
): Promise<boolean> {
  if (!limiter) return true
  const { success } = await limiter.limit(key)
  return success
}
