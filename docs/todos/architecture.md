# Architecture Cleanup Todos

> Current phase: 3 (Shared Packages) | 1/7 phases complete

---

## Phase Dependencies

```
Phase 1 [DONE] → Phase 2 → Phase 3 [IN PROGRESS] → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

Each phase is independently testable. Don't proceed to next phase until current phase verification passes.

---

## Phase 1: Frontend Separation
- id: arch-phase-1
- status: completed
- effort: 2 weeks
- depends_on: none

**Goal:** Cofounder can work on UI independently

**Completed January 2026:**
- [x] Created `apps/admin/` with Vite + React + TypeScript
- [x] Set up Tailwind CSS for styling
- [x] Created typed API client in `src/lib/api.ts`
- [x] Migrated all pages: Dashboard, Seniors, Calls, Reminders
- [x] Configured Vite proxy for local development
- [x] Updated CORS in `index.js`
- [x] Added Railway deployment config

**Files created:**
```
apps/admin/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── railway.toml
├── index.html
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── lib/api.ts, utils.ts
    └── pages/Dashboard.tsx, Seniors.tsx, Calls.tsx, Reminders.tsx
```

---

## Phase 2: Route Extraction
- id: arch-phase-2
- status: pending
- effort: 1 week
- depends_on: arch-phase-1
- files: `index.js`, `routes/*`, `websocket/*`

**Goal:** Split 972-line index.js into manageable route files

**Target structure:**
```
routes/
├── index.js          # Route aggregator
├── seniors.js        # /api/seniors/*
├── calls.js          # /api/call, /api/calls/*
├── reminders.js      # /api/reminders/*
├── voice.js          # /voice/answer, /voice/status
├── health.js         # /health
├── conversations.js  # /api/conversations/*
├── memories.js       # /api/seniors/:id/memories/*
└── observability.js  # /api/observability/*

websocket/
└── media-stream.js   # WebSocket handler
```

**Tasks:**
- [ ] Create `routes/` directory
- [ ] Extract senior routes to `routes/seniors.js`
- [ ] Extract reminder routes to `routes/reminders.js`
- [ ] Extract call routes to `routes/calls.js`
- [ ] Extract voice webhook routes to `routes/voice.js`
- [ ] Extract conversation routes to `routes/conversations.js`
- [ ] Extract memory routes to `routes/memories.js`
- [ ] Extract observability routes to `routes/observability.js`
- [ ] Extract WebSocket handler to `websocket/media-stream.js`
- [ ] Create route aggregator `routes/index.js`
- [ ] Reduce `index.js` to <150 lines (setup only)

**Verification:**
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/seniors
# Test voice call end-to-end
# Verify WebSocket media streaming works
```

**Success criteria:** index.js under 150 lines, all endpoints functional

---

## Phase 3: Shared Packages Setup
- id: arch-phase-3
- status: in_progress
- effort: 1 week
- depends_on: arch-phase-2
- files: `packages/*`, `turbo.json`

**Goal:** Enable code sharing between apps, prepare for TypeScript

**Completed:**
- [x] Created `packages/logger/` - TypeScript logging package
- [x] Created `packages/event-bus/` - TypeScript event bus package

**Remaining tasks:**
- [ ] Create monorepo workspace config in root `package.json`
- [ ] Move services → `packages/services/`
- [ ] Move adapters → `packages/adapters/`
- [ ] Move pipelines → `packages/pipelines/`
- [ ] Move db → `packages/db/`
- [ ] Add `turbo.json` for build orchestration
- [ ] Update all imports to use `@donna/*` packages

**Verification:**
```bash
npm install          # From root, should resolve workspaces
npm run dev          # Should start all apps
# Verify API can import from @donna/services
# Verify voice calls work end-to-end
```

---

## Phase 4: TypeScript Migration
- id: arch-phase-4
- status: pending
- effort: 6-8 weeks
- depends_on: arch-phase-3
- files: All `.js` files → `.ts`

**Goal:** Type safety across codebase

**Migration order:**
1. [ ] `packages/types/` - Create shared types first
2. [ ] `packages/db/` - Schema types
3. [ ] `packages/services/` - Business logic
4. [ ] `packages/adapters/` - External integrations
5. [ ] `packages/pipelines/` - Voice logic
6. [ ] `apps/api/` - Routes and handlers

**Setup tasks:**
- [ ] Add root `tsconfig.json`
- [ ] Configure path aliases for `@donna/*`
- [ ] Set up incremental migration (allow .js imports)
- [ ] Add `npm run typecheck` script

**Verification:**
```bash
npm run build        # TypeScript compiles without errors
npm run typecheck    # No type errors
# IDE shows type hints for all packages
```

---

## Phase 5: Testing Infrastructure
- id: arch-phase-5
- status: pending
- effort: 4-6 weeks
- depends_on: arch-phase-4
- files: `__tests__/*`, `vitest.config.ts`

**Goal:** Confidence in changes, prevent regressions

**Tasks:**
- [ ] Install Vitest + testing-library
- [ ] Create `vitest.config.ts`
- [ ] Set up test database
- [ ] Add test files in `__tests__/` directories
- [ ] Add coverage reporting
- [ ] Configure CI to run tests on PR

**Target coverage:** >60% for services

**Verification:**
```bash
npm run test         # All tests pass
npm run test:coverage # >60% on services
```

---

## Phase 6: API Improvements
- id: arch-phase-6
- status: pending
- effort: 1 week
- depends_on: arch-phase-5
- files: `middleware/*`, route files

**Goal:** Robust, documented API

**Tasks:**
- [ ] Add Zod schemas for all input validation (already done via security)
- [ ] Standardize error responses across all routes
- [ ] Add API versioning (`/api/v1/*`)
- [ ] Generate OpenAPI spec from Zod schemas
- [ ] Add Swagger UI at `/api/docs`

**Verification:**
```bash
curl -X POST http://localhost:3001/api/v1/seniors -d '{}'
# Should return 400 with validation error details
# Visit /api/docs to see OpenAPI documentation
```

---

## Phase 7: Authentication (Clerk)
- id: arch-phase-7
- status: pending
- effort: 1 week
- depends_on: arch-phase-6
- files: `middleware/auth.ts`, `apps/admin/*`

**Goal:** Secure API endpoints (Note: Backend auth already done, this is frontend)

**Tasks:**
- [ ] Add Clerk React to admin dashboard
- [ ] Create login/logout UI in `apps/admin/`
- [ ] Protect all admin routes with Clerk
- [ ] Add user context to API calls
- [ ] Create invite system for family members

**Verification:**
```bash
# Visit admin dashboard without login - should redirect to Clerk
# Login - should see data filtered by assigned seniors
# Voice webhooks still work without auth
```

---

## Summary

| Phase | Description | Status | Effort |
|-------|-------------|--------|--------|
| 1 | Frontend Separation | DONE | 2 weeks |
| 2 | Route Extraction | Pending | 1 week |
| 3 | Shared Packages | In Progress | 1 week |
| 4 | TypeScript Migration | Pending | 6-8 weeks |
| 5 | Testing Infrastructure | Pending | 4-6 weeks |
| 6 | API Improvements | Pending | 1 week |
| 7 | Authentication (Frontend) | Pending | 1 week |

**Total remaining:** ~15-18 weeks

---

## Quick Reference: Files Changed by Phase

| Phase | Create | Modify | Delete |
|-------|--------|--------|--------|
| 1 | `apps/admin/*` | `index.js` (CORS) | `public/admin.html` |
| 2 | `routes/*`, `websocket/*` | `index.js` (shrink) | - |
| 3 | `packages/*`, `turbo.json` | All imports | - |
| 4 | `*.ts` files, `tsconfig.json` | Rename `.js` → `.ts` | - |
| 5 | `__tests__/*`, `vitest.config.ts` | - | - |
| 6 | `middleware/*` | Route files | - |
| 7 | `middleware/auth.ts` | `apps/admin/*` | - |

---

*Migrated from ARCHITECTURE_CLEANUP_PLAN.md (deleted)*
