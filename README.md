# Jumeirah Messaging System

A Next.js 16 messaging platform for processing Excel-based utility invoices and dispatching SMS notifications to apartment contacts.

## Tech stack

- Next.js 16 (App Router, React 19, TypeScript)
- Bun
- Tailwind CSS v4
- Drizzle ORM + Turso (libSQL)
- NextAuth.js v5
- Netlify Functions

## Adding components

To add shadcn/ui components, run:

```bash
bunx shadcn@latest add button
```

This will place the UI components in the `src/components/ui` directory.

## Using components

Import components as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Development

Install dependencies with Bun:

```bash
bun install
```

Run the dev server:

```bash
bun run dev
```

Build for production:

```bash
bun run build
```
