import { existsSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname, extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

for (const line of readFileSync(join(__dirname, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const eq = trimmed.indexOf("=")
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim()
  if (!process.env[key]) process.env[key] = val
}
const CLIENT_DIR = join(__dirname, "dist", "client")
const PORT = 3000

const serverEntrypoint = await import("./dist/server/server.js")
const ssrFetch = serverEntrypoint.default?.fetch ?? serverEntrypoint.fetch

if (typeof ssrFetch !== "function") {
  console.error("No fetch handler on dist/server/server.js default export")
  process.exit(1)
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".map": "application/json",
}

async function serveStatic(req, res) {
  let urlPath = req.url?.split("?")[0] ?? "/"
  let filePath = normalize(join(CLIENT_DIR, urlPath))
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403)
    res.end("forbidden")
    return true
  }
  if (urlPath === "/" || urlPath === "") {
    filePath = join(CLIENT_DIR, "index.html")
  } else if (!existsSync(filePath)) {
    const withHtml = filePath + ".html"
    if (existsSync(withHtml)) {
      filePath = withHtml
    } else if (existsSync(join(filePath, "index.html"))) {
      filePath = join(filePath, "index.html")
    } else {
      return false
    }
  }
  try {
    const body = await readFile(filePath)
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    })
    res.end(body)
    return true
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  const urlPath = req.url?.split("?")[0] ?? "/"
  const isAsset =
    urlPath.startsWith("/assets/") ||
    urlPath.startsWith("/fonts/") ||
    extname(urlPath) !== ""

  if (isAsset && (await serveStatic(req, res))) return

  const buffers = []
  for await (const chunk of req) buffers.push(chunk)
  const body = Buffer.concat(buffers)

  const host = req.headers.host ?? `localhost:${PORT}`
  const proto = req.headers["x-forwarded-proto"] ?? "http"
  const init = {
    method: req.method,
    headers: req.headers,
    body: body.length ? body : undefined,
  }

  try {
    const response = await ssrFetch(
      new Request(`${proto}://${host}${req.url}`, init)
    )
    const resHeaders = {}
    response.headers.forEach((v, k) => {
      resHeaders[k] = v
    })
    const buf = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, resHeaders)
    res.end(buf)
  } catch (err) {
    console.error("SSR error:", err)
    res.writeHead(500, { "Content-Type": "text/plain" })
    res.end(String(err?.stack ?? err))
  }
})

server.listen(PORT, () => {
  console.log(`e2e server on http://localhost:${PORT}`)
})
