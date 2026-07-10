import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatArabicDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value.includes("T") ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aden",
  })
}
