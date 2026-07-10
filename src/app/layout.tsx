import { SWRProvider } from "@/components/swr-provider"
import { Toaster } from "@/components/ui/sonner"
import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Cairo, Inter } from "next/font/google"

import "../styles.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
})

export const metadata: Metadata = {
  title: "نظام رسائل جُميرا",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${inter.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SWRProvider>
            {children}
            <Toaster position="top-center" richColors />
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
