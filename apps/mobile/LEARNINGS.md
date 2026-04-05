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
