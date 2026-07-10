import { TanStackDevtools } from "@tanstack/react-devtools"
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { HomeIcon } from "lucide-react"
import { ThemeProvider } from "next-themes"

import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import type { SessionUser } from "@/lib/server/auth"
import { getSession } from "@/lib/server/auth"
import appCss from "../styles.css?url"

type RouterContext = {
  session: SessionUser | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await getSession()
    return { session }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "نظام رسائل جُميرا",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="font-heading text-6xl font-bold text-muted-foreground">
        404
      </p>
      <h1 className="text-xl font-medium">الصفحة المطلوبة غير موجودة</h1>
      <Button
        nativeButton={false}
        render={<Link to="/" search={{ error: undefined }} />}
      >
        <HomeIcon data-icon="inline-start" />
        العودة للرئيسية
      </Button>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
