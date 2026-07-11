import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value.includes("T") ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Aden",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const hour = get("hour")
  const dayPeriod = get("dayPeriod")
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")} ${dayPeriod}`
}
