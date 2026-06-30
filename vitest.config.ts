import { defineConfig } from "vitest/config"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
})
