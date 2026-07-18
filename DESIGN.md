# UI/UX & Architecture Guidelines for AI Coding Agents

> **Role & Intent:** You are an elite Product Engineer. Your goal is to produce highly usable, intuitive, and seamlessly navigatable interfaces. You must aggressively avoid "AI visual clutter" (bloated borders, unnecessary double-nesting, and inconsistent spacing). Always prioritize semantic Tailwind tokens, composability, and clean DOM trees.

---

## 1. Core Structural Rules & Component Composition

### A. Card & Form Boundaries (Anti-Collision Protocol)

- **The Problem:** Placing a `<form>` directly inside a `<Card>` wrapper, or wrapping internal Card parts in a form, breaks flex/grid spacing and causes visual layout/margin collisions.
- **The Rule:** The `<form>` tag must **wrap the entire Card component**, OR be nested entirely **inside `<CardContent>`**. It must never sit awkwardly as an intermediate parent of sub-card elements.

```tsx
// ❌ BAD: Visually breaks layout and flex/grid alignment
<Card>
  <form onSubmit={...}>
    <CardHeader><CardTitle>Login</CardTitle></CardHeader>
    <CardContent>...</CardContent>
    <CardFooter><Button>Submit</Button></CardFooter>
  </form>
</Card>

// ✅ GOOD: Form wraps the entire Card
<form onSubmit={...}>
  <Card>
    <CardHeader><CardTitle>Login</CardTitle></CardHeader>
    <CardContent>...</CardContent>
    <CardFooter><Button>Submit</Button></CardFooter>
  </Card>
</form>

// ✅ GOOD: Form lives entirely inside CardContent (for isolated forms)
<Card>
  <CardHeader><CardTitle>Login</CardTitle></CardHeader>
  <CardContent>
    <form onSubmit={...} className="space-y-4">
      ...
    </form>
  </CardContent>
</Card>
```

### B. No "Card-in-Card" Nesting (Avoid Inception Layouts)

- **The Problem:** Agents tend to nesting `<Card>` components inside other `<Card>` components to group sub-items, creating heavy, overlapping borders, shadows, and claustrophobic padding.
- **The Rule:** Never put a `<Card>` inside another `<Card>`. If you need to group content inside a card, use a subtle background, a simple border, or a `Separator` instead.

```tsx
// ❌ BAD: High visual friction (Card-in-Card)
<Card>
  <CardContent>
    <Card className="bg-muted/50">
      <CardContent>Sub-item settings</CardContent>
    </Card>
  </CardContent>
</Card>

// ✅ GOOD: Flat, clean grouping using semantic borders/backgrounds
<Card>
  <CardContent className="space-y-4">
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <p className="text-sm font-medium">Sub-item settings</p>
    </div>
  </CardContent>
</Card>
```

---

## 2. Tailwind CSS & Layout Rules

- **No Space-X or Space-Y Utilities:** Never use `space-x-*` or `space-y-*`. They break conditional rendering when elements are hidden or dynamic. **Always use Flexbox/Grid with gap properties** (`flex flex-col gap-4`).
- **Do Not Hardcode Colors:** Never use raw colors like `text-blue-600` or `bg-slate-900`. Always use semantic theme tokens: `text-primary`, `text-muted-foreground`, `bg-background`, `bg-card`, and `border-border`.
- **Equal Width and Height Shorthand:** Use `size-*` instead of specifying both `w-*` and `h-*` separately (e.g., use `size-4` instead of `w-4 h-4`).
- **Do Not Manually Manage Z-Indices:** Rely on Radix/Shadcn built-in z-index layers for overlays (e.g., `Dialog`, `Sheet`, `Popover`). Do not append random `z-50` classes unless explicitly required by a custom floating component.

---

## 3. UI/UX Consistency Standards

- **Dialog & Sheet Accessibility:** Every interactive modal (`Dialog`, `Sheet`, `Drawer`) **must** include a `Title` component for screen readers. If you want to hide it visually, use Tailwind's screen-reader class (`className="sr-only"`).
- **Empty States:** Do not invent manual empty states. Use a dedicated `Empty` component or follow a consistent pattern: a dimmed icon, a clear descriptive header, and a single, obvious primary call-to-action button.
- **Loading States (Skeletons):** Use shadcn `<Skeleton />` loaders. Match the shape of the content to the final layout to avoid sudden content jumps.
- **Form Field Consistency:** Wrap your form fields inside a unified `<FormField>` or a container matching the design layout. Ensure validation messages (`FormMessage`) do not shift layout spacing when triggered.
- **Responsive Tables (Cards on Mobile):** Any `<Table>` used in the project **must** be replaced with a list of cards on mobile only. On medium and larger screens (`md` and up) the table stays exactly as is. Never let a data table render on small screens — horizontal scroll and cramped cells are unacceptable.
  - **The Rule:** Render both representations and toggle them by breakpoint. Show the card list on mobile and hide it from `md` up (`md:hidden`); hide the table below `md` and show it from `md` up (`hidden md:block`). Use the `md` breakpoint as the single, consistent switch point across the whole project.
  - Each mobile card should surface the same row data in a readable stacked layout (label/title prominent, secondary fields as muted text or inline chips) and preserve every row action (links, dropdowns, checkboxes) available in the table.
- **Action Buttons Live Above Tables:** All action buttons that operate on a table's data (e.g. "resend failed", "send warning", bulk actions, exports) **must** render **above** the table, never below it. Users scan top-down; actions placed under a long table are buried and easy to miss. Place them in a toolbar row between the section header/filters and the table. The only controls permitted below a table are passive metadata (row counts, pagination) — never primary actions.

```tsx
// ✅ GOOD: card list on mobile, table from md up
<div className="flex flex-col gap-3 md:hidden">
  {rows.map((r) => (
    <RowCard key={r.id} row={r} />
  ))}
</div>
<div className="hidden overflow-hidden rounded-lg border md:block">
  <Table>
    <TableHeader>...</TableHeader>
    <TableBody>
      {rows.map((r) => (
        <RowTable key={r.id} row={r} />
      ))}
    </TableBody>
  </Table>
</div>
```

---

## 4. Architectural Rules (Next.js + Bun)

- **Client Boundaries:** Keep `"use client"` restricted strictly to leaf components. Keep wrapper layers and data fetching as React Server Components (RSC) to maximize performance.
- **Package & Component Management:** The project utilizes **Bun** and specialized local agent configurations.
  - Always install third-party dependencies using `bun add <package>`.
  - **Critical:** When adding or managing UI components, **always use the custom `shadcn` skill/script found in the repository workspace**. Do not invoke raw `npx shadcn@latest` or build components manually if the workspace's local `shadcn` skill is available. Run setup operations via this local integration to enforce custom file structures, paths, and registry options automatically.
