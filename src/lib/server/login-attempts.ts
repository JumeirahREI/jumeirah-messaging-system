import { loginLimiters } from "@/lib/server/rate-limit"

export interface LoginLimiter {
  getRemaining(id: string): Promise<{ remaining: number }>
  limit(id: string): Promise<unknown>
  resetUsedTokens(id: string): Promise<void>
}

export type LoginLimiters = { user: LoginLimiter; ip: LoginLimiter }
export type LoginCheck = "ok" | "locked" | "unavailable"

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function loginKeys(ip: string, username: string) {
  const normalizedIp = ip.trim().toLowerCase()
  return {
    userKey: `${normalizedIp}|${normalizeUsername(username)}`,
    ipKey: normalizedIp,
  }
}

const isProduction = () => process.env.NODE_ENV === "production"

export function createLoginGuard(
  limiters: LoginLimiters | null,
  production: () => boolean = isProduction
) {
  async function guarded<T>(fallback: T, run: (l: LoginLimiters) => Promise<T>) {
    if (!limiters) return production() ? fallback : undefined
    try {
      return await run(limiters)
    } catch (error) {
      console.error("login rate limiter failure", error)
      return fallback
    }
  }

  return {
    async check(ip: string, username: string): Promise<LoginCheck> {
      const { userKey, ipKey } = loginKeys(ip, username)
      const result = await guarded<LoginCheck>("unavailable", async (l) => {
        const [user, byIp] = await Promise.all([
          l.user.getRemaining(userKey),
          l.ip.getRemaining(ipKey),
        ])
        return user.remaining > 0 && byIp.remaining > 0 ? "ok" : "locked"
      })
      return result ?? "ok"
    },

    async recordFailure(ip: string, username: string): Promise<void> {
      const { userKey, ipKey } = loginKeys(ip, username)
      await guarded<void>(undefined, async (l) => {
        await Promise.all([l.user.limit(userKey), l.ip.limit(ipKey)])
      })
    },

    async recordSuccess(ip: string, username: string): Promise<void> {
      const { userKey } = loginKeys(ip, username)
      await guarded<void>(undefined, (l) => l.user.resetUsedTokens(userKey))
    },
  }
}

export const loginGuard = createLoginGuard(loginLimiters)
