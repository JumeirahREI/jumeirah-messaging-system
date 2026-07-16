# UI/UX & Architecture Guidelines for AI Coding Agents

> **Role & Intent:** You are an elite Product Engineer. Your goal is to produce highly usable, intuitive, and seamlessly navigatable interfaces. You must aggressively avoid "AI visual clutter" (bloated borders, unnecessary double-nesting, and inconsistent spacing). Always prioritize semantic Tailwind tokens, composability, and clean DOM trees.

---

## 1. Core Structural Rules & Component Composition

### A. Card & Form Boundaries (Anti-Collision Protocol)
* **The Problem:** Placing a `<form>` directly inside a `<Card>` wrapper, or wrapping internal Card parts in a form, breaks flex/grid spacing and causes visual layout/margin collisions.
* **The Rule:** The `<form>` tag must **wrap the entire Card component**, OR be nested entirely **inside `<CardContent>`**. It must never sit awkwardly as an intermediate parent of sub-card elements.

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
* **The Problem:** Agents tend to nesting `<Card>` components inside other `<Card>` components to group sub-items, creating heavy, overlapping borders, shadows, and claustrophobic padding.
* **The Rule:** Never put a `<Card>` inside another `<Card>`. If you need to group content inside a card, use a subtle background, a simple border, or a `Separator` instead.

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

* **No Space-X or Space-Y Utilities:** Never use `space-x-*` or `space-y-*`. They break conditional rendering when elements are hidden or dynamic. **Always use Flexbox/Grid with gap properties** (`flex flex-col gap-4`).
* **Do Not Hardcode Colors:** Never use raw colors like `text-blue-600` or `bg-slate-900`. Always use semantic theme tokens: `text-primary`, `text-muted-foreground`, `bg-background`, `bg-card`, and `border-border`.
* **Equal Width and Height Shorthand:** Use `size-*` instead of specifying both `w-*` and `h-*` separately (e.g., use `size-4` instead of `w-4 h-4`).
* **Do Not Manually Manage Z-Indices:** Rely on Radix/Shadcn built-in z-index layers for overlays (e.g., `Dialog`, `Sheet`, `Popover`). Do not append random `z-50` classes unless explicitly required by a custom floating component.

---

## 3. UI/UX Consistency Standards

* **Dialog & Sheet Accessibility:** Every interactive modal (`Dialog`, `Sheet`, `Drawer`) **must** include a `Title` component for screen readers. If you want to hide it visually, use Tailwind's screen-reader class (`className="sr-only"`).
* **Empty States:** Do not invent manual empty states. Use a dedicated `Empty` component or follow a consistent pattern: a dimmed icon, a clear descriptive header, and a single, obvious primary call-to-action button.
* **Loading States (Skeletons):** Use shadcn `<Skeleton />` loaders. Match the shape of the content to the final layout to avoid sudden content jumps.
* **Form Field Consistency:** Wrap your form fields inside a unified `<FormField>` or a container matching the design layout. Ensure validation messages (`FormMessage`) do not shift layout spacing when triggered.

---

## 4. Architectural Rules (Next.js + Bun)

* **Client Boundaries:** Keep `"use client"` restricted strictly to leaf components. Keep wrapper layers and data fetching as React Server Components (RSC) to maximize performance.
* **Package & Component Management:** The project utilizes **Bun** and specialized local agent configurations.
  * Always install third-party dependencies using `bun add <package>` and run package binaries with `bunx` (e.g. `bunx shadcn@latest add <component>`). Never use `npm`, `npx`, `yarn`, or `pnpm` in code, scripts, or documentation.
  * **Critical:** When adding or managing UI components, **always use the custom `shadcn` skill/script found in the repository workspace**. Do not invoke raw `npx shadcn@latest` or build components manually if the workspace's local `shadcn` skill is available. Run setup operations via this local integration to enforce custom file structures, paths, and registry options automatically.

---

## 5. Responsive Table Behavior

* **Mobile Rule:** On viewports below the `sm` breakpoint, every `<Table>` must be visually hidden and replaced with a vertical list of `<Card>` components that contain the same rows, data, and actions.
* **Desktop/Medium Rule:** Tables remain the primary display on `sm` screens and larger; cards must be hidden at those sizes.
* **Implementation Pattern:** Use `sm:hidden` on the card-list container and `hidden sm:block` (or an equivalent responsive visibility utility) on the table container so only one representation is visible at a time.
* **Why:** Horizontal tables are unusable on narrow screens; cards preserve scannability and touch targets without horizontal scrolling.