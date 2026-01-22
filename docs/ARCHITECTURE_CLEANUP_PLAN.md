# Donna Architecture Cleanup Plan

**Created:** January 2026
**Status:** Phase 1 Complete
**Goal:** Transform Donna from organic monolith to clean, maintainable architecture

---

## Executive Summary

Donna is a well-conceived AI voice companion system with sophisticated real-time processing capabilities. The **pipeline architecture is impressive** - the 2-layer observer pattern with dynamic token routing demonstrates strong engineering. However, the codebase has grown organically and now exhibits **structural debt that will impede scaling and team collaboration**.

**Critical Finding:** The frontend and backend were insufficiently separated. The cofounder could not effectively modify the admin UI without risk of breaking core functionality.

**Overall Grade:** B- (Strong core, weak boundaries)

---

## Current Architecture Assessment

### Strengths

| Area | Assessment |
|------|------------|
| **Pipeline Design** | Excellent. 2-layer observer + streaming is well-architected |
| **LLM Adapters** | Good. Factory pattern enables provider switching |
| **Service Layer** | Good. Clear separation (memory, scheduler, analysis) |
| **Database Schema** | Good. pgvector for semantic search is the right choice |
| **Documentation** | Excellent. CLAUDE.md and docs/ are comprehensive |

### Weaknesses (Before Cleanup)

| Area | Assessment |
|------|------------|
| **Monolithic Server** | `index.js` is 972 lines - routes, middleware, WebSocket handlers all mixed |
| **Frontend Coupling** | `public/admin.html` was 1 file with embedded JS/CSS |
| **No API Contract** | No OpenAPI spec, frontend guesses at endpoints |
| **No TypeScript Backend** | Only observability app has TypeScript |
| **No Tests** | No test files found |
| **No Auth** | API endpoints are unprotected |

---

## Target Architecture

```
donna/
├── apps/
│   ├── api/                      # Backend API (Express)
│   │   ├── src/
│   │   │   ├── routes/           # HTTP route handlers
│   │   │   ├── websocket/        # WebSocket handlers
│   │   │   ├── middleware/       # Auth, validation, errors
│   │   │   └── index.ts          # Server setup (~100 lines)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── admin/                    # Admin Dashboard (React) ✅ DONE
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── lib/api.ts
│   │   └── package.json
│   │
│   └── observability/            # (Already exists)
│
├── packages/
│   ├── services/                 # Business logic (memory, scheduler, etc.)
│   ├── pipelines/                # Voice pipelines
│   ├── adapters/                 # LLM, TTS, STT adapters
│   ├── db/                       # Database client + schema
│   └── types/                    # Shared TypeScript types
│
├── package.json                  # Workspace root
├── turbo.json                    # Turborepo config
└── docs/
```

---

## Migration Phases

### Phase 1: Frontend Separation ✅ COMPLETE

**Goal:** Cofounder can work on UI independently
**Status:** Complete
**Risk:** Low (additive, doesn't change existing code)

**What was done:**
- Created `apps/admin/` with Vite + React + TypeScript
- Set up Tailwind CSS for styling
- Created typed API client in `src/lib/api.ts`
- Migrated all pages: Dashboard, Seniors, Calls, Reminders
- Configured Vite proxy for local development
- Updated CORS in `index.js`
- Added Railway deployment config

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
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── vite-env.d.ts
    ├── lib/
    │   ├── api.ts
    │   └── utils.ts
    └── pages/
        ├── Dashboard.tsx
        ├── Seniors.tsx
        ├── Calls.tsx
        └── Reminders.tsx
```

**Verification:**
- [x] `npm run build` succeeds
- [ ] `npm run dev` starts on localhost:5173
- [ ] Can view list of seniors
- [ ] Can create/edit/delete seniors
- [ ] Can view calls and transcripts
- [ ] Can create/delete reminders
- [ ] Cofounder can modify UI independently

**After verification:** Delete `public/admin.html`

---

### Phase 2: Route Extraction

**Goal:** Split 972-line index.js into manageable route files
**Status:** Pending
**Risk:** Medium (refactoring existing code)

**Create:**
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

**Target:** Reduce `index.js` to ~100 lines (setup only)

**Verification:**
- [ ] All API endpoints still work
- [ ] Voice calls work end-to-end
- [ ] WebSocket media streaming works
- [ ] index.js is under 150 lines

---

### Phase 3: Shared Packages Setup

**Goal:** Enable code sharing between apps, prepare for TypeScript
**Status:** Pending
**Risk:** Medium (structural change)

**Create monorepo structure:**
```json
// Root package.json
{
  "name": "donna",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "devDependencies": { "turbo": "^2.0.0" }
}
```

**Move to packages:**
- `packages/services/` ← services/*.js
- `packages/adapters/` ← adapters/*.js
- `packages/pipelines/` ← pipelines/*.js
- `packages/db/` ← db/*.js

**Verification:**
- [ ] `npm install` from root works
- [ ] `npm run dev` starts all apps
- [ ] API can import from @donna/services
- [ ] Voice calls work end-to-end

---

### Phase 4: TypeScript Migration

**Goal:** Type safety across codebase
**Status:** Pending
**Risk:** Low (gradual migration)

**Migration order:**
1. `packages/types/` (create types first)
2. `packages/db/` (schema types)
3. `packages/services/` (business logic)
4. `packages/adapters/` (external integrations)
5. `packages/pipelines/` (voice logic)
6. `apps/api/` (routes and handlers)

**Verification:**
- [ ] `npm run build` succeeds
- [ ] No `any` types in critical paths
- [ ] IDE shows type hints

---

### Phase 5: Testing Infrastructure

**Goal:** Confidence in changes, prevent regressions
**Status:** Pending
**Risk:** Low (additive)

**Add:**
- Vitest for unit/integration tests
- Test files in `__tests__/` directories
- Coverage reporting

**Target coverage:** >60% for services

**Verification:**
- [ ] `npm run test` passes
- [ ] CI runs tests on PR

---

### Phase 6: API Improvements

**Goal:** Robust, documented API
**Status:** Pending
**Risk:** Low

**Add:**
- Zod schemas for input validation
- Validation middleware
- Standardized error responses
- API versioning (`/api/v1/*`)

**Verification:**
- [ ] Invalid requests return 400 with details
- [ ] All errors have consistent format
- [ ] Old routes still work (backwards compat)

---

### Phase 7: Authentication (Clerk)

**Goal:** Secure API endpoints
**Status:** Pending
**Risk:** Medium
**Prerequisite:** Before public launch

**Add:**
- Clerk SDK for backend auth
- Clerk React for frontend auth
- Protected routes (except voice webhooks)

**Verification:**
- [ ] Unauthenticated API calls return 401
- [ ] Admin dashboard requires login
- [ ] Voice webhooks still work (no auth)

---

## Phase Dependencies

```
Phase 1: Frontend Separation ✅
    ↓
Phase 2: Route Extraction
    ↓
Phase 3: Shared Packages
    ↓
Phase 4: TypeScript Migration
    ↓
Phase 5: Testing Infrastructure
    ↓
Phase 6: API Improvements
    ↓
Phase 7: Authentication
```

**Each phase is independently testable.** Don't proceed to next phase until current phase verification passes.

---

## Cofounder Workflow (After Phase 1)

```bash
# Clone and setup
git clone git@github.com:dmdzco/donna2.git
cd donna2/apps/admin
npm install

# Start development
npm run dev    # → localhost:5173

# Make UI changes
# - Modify styles in tailwind.config.js
# - Edit components in src/pages/*
# - Add new pages in src/pages/*

# Commit and push
git add . && git commit -m "UI changes" && git push
```

**What cofounder can do:**
- Change colors and styles
- Modify component layouts
- Add new pages and features
- Use any React/Tailwind patterns

**What cofounder won't touch:**
- `index.js` (API server)
- `pipelines/` (voice logic)
- `services/` (business logic)
- `adapters/` (external integrations)

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
| 7 | `middleware/auth.ts` | `index.ts`, `apps/admin/*` | - |

---

## Anti-Patterns to Avoid

1. **Don't add more to `public/admin.html`** - It's technical debt (will be deleted)
2. **Don't add routes directly to index.js** - Use route files (Phase 2)
3. **Don't hardcode URLs** - Use environment variables
4. **Don't skip validation** - Use Zod for all API inputs (Phase 6)
5. **Don't deploy without health checks** - Railway needs `/health`

---

## Verification Commands

```bash
# Phase 1 (current)
cd apps/admin && npm run dev
# Test all CRUD operations in browser

# Phase 2
npm run dev
curl http://localhost:3001/health
curl http://localhost:3001/api/seniors
# Test voice call

# Phase 3
npm install  # From root
npm run dev  # Starts all apps

# Phase 4
npm run build  # TypeScript compiles

# Phase 5
npm run test

# Phase 6
curl -X POST http://localhost:3001/api/v1/seniors -d '{}'
# Should return validation error

# Phase 7
curl http://localhost:3001/api/v1/seniors
# Should return 401
```

---

## Long-term Sustainability Recommendations

### Testing
- Unit tests for services (memory, scheduler)
- Integration tests for API routes
- E2E tests for critical call flows
- Tool: Vitest

### Monitoring
- Structured logging (Pino)
- Error tracking (Sentry)
- Performance monitoring

### Security
- Clerk authentication (Phase 7)
- Rate limiting on API
- Input validation (Zod)

### API Design
- Version all endpoints (`/api/v1/*`)
- Standardized error responses
- OpenAPI documentation

---

*Last updated: January 2026 - Phase 1 Complete*
