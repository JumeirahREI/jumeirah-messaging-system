"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type JumeirahLogoProps = {
  className?: string
}

export function JumeirahLogo({ className }: JumeirahLogoProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const src =
    mounted && resolvedTheme === "light"
      ? "/jumeirah-logo-wide-ar-light.svg"
      : "/jumeirah-logo-wide-ar.svg"

  return (
    <img
      src={src}
      alt="شعار جُميرا للاستثمار العقاري"
      draggable={false}
      className={cn("h-auto w-auto", className)}
    />
  )
}
