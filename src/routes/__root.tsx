import { TanStackDevtools } from "@tanstack/react-devtools"
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

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
        title: "نظام مراسلات جُميرا",
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
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>الصفحة المطلوبة غير موجودة.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors />
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
