import netlify from "@netlify/vite-plugin-tanstack-start"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact(), netlify()],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-router-ssr-query",
      "@tanstack/react-query",
      "lucide-react",
      "next-themes",
      "sonner",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "bcryptjs",
      "jose",
      "drizzle-orm",
      "exceljs",
    ],
  },
  server: {
    watch: { usePolling: true },
  },
})

export default config
