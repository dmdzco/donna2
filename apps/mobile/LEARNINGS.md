# Mobile App Learnings

## React Navigation: "Cannot read property 'stale' of undefined"

**Problem:** Every time a user saved changes in a settings sub-screen (e.g., `/settings/caregiver`), the app crashed with `TypeError: Cannot read property 'stale' of undefined` in `TabRouter.js`.

**Root cause:** The root `_layout.tsx` used `<Slot>` instead of `<Stack>`. With `<Slot>`, only one route renders at a time. Navigating from `(tabs)/settings` to `/settings/caregiver` **unmounted** the entire `(tabs)` layout. When `router.back()` fired, `<Tabs>` tried to remount but `TabRouter` received `undefined` navigation state.

**Fix:** Changed root `_layout.tsx` from `<Slot>` to `<Stack screenOptions={{ headerShown: false }} />`. With `<Stack>`, navigating to `/settings/caregiver` pushes it on top — the tabs stay mounted underneath, preserving navigation state.

**Rules to follow:**
1. **Never use `<Slot>` as root layout** when the app has navigators (`<Tabs>`, `<Stack>`, `<Drawer>`) in child routes that need to stay mounted during cross-group navigation.
2. **Never conditionally render a navigator** — no `if (loading) return <View>` before a `<Tabs>` or `<Stack>` return. Navigators must always be mounted. Use an overlay or hide content instead.
3. **Avoid `router.back()` immediately after state mutations** (e.g., Clerk `user.update()`). The state change can trigger AuthGuard re-renders that race with the navigation. Prefer `Alert.alert("Saved", "...", [{ text: "OK", onPress: () => router.back() }])` to defer navigation.

**Affected files:**
- `app/_layout.tsx` — `<Slot>` → `<Stack>` (root fix)
- `app/(tabs)/_layout.tsx` — removed conditional early return before `<Tabs>`
- `app/settings/caregiver.tsx` — deferred `router.back()` to Alert callback
- `app/settings/loved-one.tsx` — same
- `app/settings/notifications.tsx` — same

## Zod `.transform()` Silently Changes Types for DB-Bound Fields

**Problem:** `POST /api/reminders` returned 500 with no useful error in logs. The mobile app showed a static "Something went wrong" message. Backend logs showed nothing because catch blocks didn't `console.error`.

**Root cause:** In `validators/schemas.js`, `isoDateSchema` had `.transform(date => new Date(date))`. Zod validation middleware (`validateBody`) replaces `req.body` with the validated+transformed result. This silently converted `scheduledTime` from an ISO string (`"2026-04-10T14:00:00.000Z"`) to a JavaScript `Date` object. Drizzle ORM's `timestamp('scheduled_time')` column expects ISO strings — receiving a `Date` object caused a downstream type mismatch.

**Why it was hard to find:**
1. Backend catch blocks sent `res.status(500).json({ error: error.message })` without `console.error` — Railway logs showed nothing.
2. Mobile app displayed a static "Something went wrong" string, hiding the actual API error message and status code.
3. The Zod transform was "correct" in isolation — it's just that the downstream consumer (Drizzle) didn't expect the transformed type.

**Fix (three layers):**
1. **Removed `.transform()` from `isoDateSchema`** — Zod now validates format only. PostgreSQL/Drizzle handle ISO strings natively; no need to convert to Date objects in the validation layer.
2. **Added `routeError()` helper** in `routes/helpers.js` — shared function that `console.error`s with route context before sending 500. Applied across all 10 route files (~24 catch blocks).
3. **Added `getErrorMessage()` utility** in `apps/mobile/src/lib/api.ts` — extracts human-readable error message + status code from `ApiError`, replacing static strings in 4 screens.

**Rules to follow:**
1. **Keep Zod schemas pure for DB-bound fields** — validate format, don't transform types. Let the ORM/database handle type coercion.
2. **Always `console.error` in Express catch blocks** — use `routeError(res, error, 'METHOD /path')` for consistent logging with route context.
3. **Never show static error messages in the UI** — use `getErrorMessage(error, "fallback")` to surface the actual API error and status code for debugging.
4. **Test the full request path** — a Zod schema that looks correct in isolation can break downstream when `validateBody` replaces `req.body` with the transformed result.

**Affected files:**
- `validators/schemas.js` — removed `.transform()` from `isoDateSchema`
- `routes/helpers.js` — added `routeError()` export
- `routes/*.js` (10 files) — replaced bare catch blocks with `routeError()`
- `apps/mobile/src/lib/api.ts` — added `ApiError.displayMessage` getter and `getErrorMessage()` utility
- `apps/mobile/app/(tabs)/reminders.tsx`, `schedule.tsx`, `index.tsx` — dynamic error messages

## Missing Imports Crash at Render Time (Not Build Time)

**Problem:** Onboarding step 5 (`app/(onboarding)/step5.tsx`) used `Check` and `ChevronDown` from `lucide-react-native` on lines 241, 273, and 335, but the import statement only included `ArrowLeft, Plus, X, Lightbulb`. This would crash the screen at render time with `ReferenceError: Check is not defined`.

**Why it wasn't caught:** Metro bundler (React Native) doesn't fail at build time for missing named exports from a package that exists — only at runtime when the undefined symbol is referenced. If no test or manual walkthrough exercises that specific screen, the crash goes unnoticed.

**Fix:** Added `Check` and `ChevronDown` to the import statement.

**Rule:** After adding JSX that references new icons or components, always verify the import statement includes them. Search for all symbol references in the file and cross-check against imports.
