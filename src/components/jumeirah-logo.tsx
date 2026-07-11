"use client"

import { cn } from "@/lib/utils"

type JumeirahLogoProps = {
  className?: string
}

export function JumeirahLogo({ className }: JumeirahLogoProps) {
  return (
    <img
      src="/jumeirah-logo-wide-ar.svg"
      alt="شعار جُميرا للاستثمار العقاري"
      draggable={false}
      className={cn("h-auto w-auto", className)}
    />
  )
}
