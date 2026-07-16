"use client"

import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"

type JumeirahLogoProps = {
  className?: string
}

function subscribe() {
  return () => {}
}

function getClientSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

export function JumeirahLogo({ className }: JumeirahLogoProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  )

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
