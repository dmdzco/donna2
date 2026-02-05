# Admin Dashboard V2 Migration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the static `public/admin.html` to a React/Vite/Tailwind admin dashboard at `apps/admin-v2/`, matching the consumer app's tech stack but using JWT auth and an admin-themed purple color palette.

**Architecture:** Self-contained React SPA in `apps/admin-v2/`. No backend changes needed — reuses all existing API endpoints with JWT Bearer auth. Tab-based navigation via React Router. Deployed to Vercel.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, React Router DOM, Lucide React, clsx + tailwind-merge

---

## Task 1: Project Scaffolding (agent-scaffold)

Creates the entire project skeleton that all other agents depend on.

**Files to create:**
- `apps/admin-v2/package.json`
- `apps/admin-v2/vite.config.ts`
- `apps/admin-v2/tsconfig.json`
- `apps/admin-v2/tailwind.config.js`
- `apps/admin-v2/postcss.config.js`
- `apps/admin-v2/vercel.json`
- `apps/admin-v2/index.html`
- `apps/admin-v2/src/main.tsx`
- `apps/admin-v2/src/App.tsx`
- `apps/admin-v2/src/index.css`
- `apps/admin-v2/src/vite-env.d.ts`
- `apps/admin-v2/src/lib/api.ts`
- `apps/admin-v2/src/lib/auth.ts`
- `apps/admin-v2/src/lib/utils.ts`

## Task 2: Layout + Shared Components + Login (agent-layout)

**Files to create:**
- `apps/admin-v2/src/components/Layout.tsx`
- `apps/admin-v2/src/components/Toast.tsx`
- `apps/admin-v2/src/components/Modal.tsx`
- `apps/admin-v2/src/pages/Login.tsx`

## Task 3: Dashboard + Seniors + Calls Pages (agent-dashboard)

**Files to create:**
- `apps/admin-v2/src/pages/Dashboard.tsx`
- `apps/admin-v2/src/pages/Seniors.tsx`
- `apps/admin-v2/src/pages/Calls.tsx`

## Task 4: Reminders + Call Analyses Pages (agent-reminders)

**Files to create:**
- `apps/admin-v2/src/pages/Reminders.tsx`
- `apps/admin-v2/src/pages/CallAnalyses.tsx`

## Task 5: Caregivers + Daily Context Pages (agent-readonly)

**Files to create:**
- `apps/admin-v2/src/pages/Caregivers.tsx`
- `apps/admin-v2/src/pages/DailyContext.tsx`
