# Donna v5.0 — Execution Plan

> **Created:** February 18, 2026
> **Status:** Ready for execution
> **Agents:** 7 parallel workstreams

---

## Strategic Context

After a deep audit of the full codebase — voice pipeline, prompts, frontends, APIs, and infrastructure — this plan defines 7 agent workstreams for v5.0. The audit covered:

- **Codebase state & gaps** (architecture, tests, infra, technical debt)
- **Conversation quality & prompt engineering** (prompts, tools, memory, Director)
- **Frontend apps & API surface** (admin dashboard, consumer app, endpoints)

### Key Findings

- **Voice pipeline is mature and production-ready** (v4.0 Pipecat migration complete)
- **Safety features are the biggest gap** — Quick Observer detects health/safety but nothing reaches caregivers
- **Caregivers have no push notifications** — must log in to see anything (retention risk)
- **Conversation is warm but formulaic** — prompts score 8/10 clarity, 6.5/10 overall quality
- **Zero frontend tests** — 221 backend tests pass, but admin + consumer have no test coverage
- **No feature flags** — can't safely experiment or roll out incrementally
- **Consumer app is minimal** — no call insights, no family sharing, placeholder Settings tab

---

## Agent 1: Safety & Emergency Alerting System

**Priority: CRITICAL**
**Rationale:** This is what makes Donna a care product, not just a chatbot. The Quick Observer already detects health/safety patterns (falls, chest pain, confusion, suicidal ideation) across 268 regex patterns. But detection goes nowhere — it just injects guidance into the LLM. No caregiver ever finds out in real-time.

### Scope

- [ ] Build `alerts` table (senior_id, alert_type, severity, evidence, status, created_at)
- [ ] Build `notification_preferences` on caregivers (channels, urgency thresholds, quiet hours)
- [ ] Build alert dispatch service — SMS via Twilio, email via Resend
- [ ] Wire Quick Observer high-severity detections to real-time alert dispatch (not just post-call)
- [ ] Add `escalate_concern` LLM tool so Claude can trigger alerts mid-call
- [ ] Wire post-call analysis concerns to alert system
- [ ] Missed call retry: configurable retry policy per senior (max_retries, interval), caregiver notification after N misses
- [ ] Do Not Disturb windows on senior profiles (time ranges + days), scheduler respects them

### Key Files

| File | Purpose |
|------|---------|
| `processors/quick_observer.py` | Wire high-severity detections to dispatch |
| `services/post_call.py` | Wire post-call concerns to alerts |
| `flows/tools.py` | Add `escalate_concern` tool schema + handler |
| `services/scheduler.py` | Missed call retry + DND enforcement |
| **NEW** `services/alerts.py` | Alert dispatch service (SMS + email) |

---

## Agent 2: Caregiver Notifications & Weekly Reports

**Priority: HIGH**
**Rationale:** Caregivers only see value when they log in. Push value to them. This is the #1 retention risk — if caregivers don't feel informed, they churn.

### Scope

- [ ] Build `notifications` table (caregiver_id, event_type, channel, content, read_at, sent_at)
- [ ] Notification triggers: `call_completed`, `concern_detected`, `reminder_missed`, `weekly_summary`
- [ ] Per-caregiver preferences (which events, which channels, quiet hours)
- [ ] SMS dispatch via Twilio + email dispatch via Resend
- [ ] Weekly caregiver email report: calls last week, topics discussed, concerns, positive observations, engagement trend
- [ ] Email templates with React Email
- [ ] Weekly cron job in Node.js scheduler
- [ ] Consumer app: notification preferences settings page (replace placeholder Settings tab)

### Key Files

| File | Purpose |
|------|---------|
| Node.js `routes/` | New notification preference endpoints |
| Node.js `services/` | New notification dispatch service |
| **NEW** `services/notifications.js` | Core notification logic |
| `apps/consumer/src/pages/Dashboard.tsx` | Settings tab → notification preferences |

---

## Agent 3: Conversation Quality & Prompt Engineering

**Priority: HIGH**
**Rationale:** The call experience IS the product. Prompts are solid (8/10 clarity) but the conversation lacks depth, personalization, and emotional sophistication. Engagement recovery is generic. Memory isn't surfaced well. News is fetched but never naturally brought up.

### Scope

- [ ] **Prompt improvements:** Active listening reflection patterns, emotional moment duration guidance ("stay on emotional topic 2-3 turns, then soft transition"), engagement recovery with specific memory references
- [ ] **Wire dynamic token routing:** Quick Observer generates token budget recommendations (100-350 tokens) but pipeline ignores them. Pass through session_state to Claude.
- [ ] **Tool visibility:** Prefix tool results with source indicator (`[MEMORY] John's garden...`, `[NEWS] Local weather...`)
- [ ] **News integration:** Add Director guidance on `should_mention_news` with specific story selection
- [ ] **Greeting personalization:** Factor in previous call sentiment, senior communication style, engagement level
- [ ] **Memory refresh mid-call:** For calls >5 min, reload memory context prioritized by current topics
- [ ] **Add `check_caregiver_notes` tool:** "Your daughter wanted me to ask about..."
- [ ] **Hardcoded value cleanup:** Make call phase times, question threshold, greeting followup chance, memory decay half-life configurable per senior

### Key Files

| File | Purpose |
|------|---------|
| `prompts.py` | System prompt improvements |
| `flows/nodes.py` | Phase configuration + configurable values |
| `flows/tools.py` | New tools + result prefixing |
| `services/director_llm.py` | Director guidance improvements |
| `services/greetings.py` | Greeting personalization |
| `services/memory.py` | Mid-call refresh, configurable decay |
| `processors/quick_observer.py` | Token routing wiring |

---

## Agent 4: Consumer App (Caregiver Experience)

**Priority: HIGH**
**Rationale:** This is the paying customer's interface. It has onboarding and basic CRUD but caregivers can't see call insights, can't share access with family, can't edit interests post-onboarding, and mobile is rough. The Settings tab is a placeholder.

### Scope

- [ ] **Call insights page:** Post-call summaries with engagement scores, topics, concerns highlighted, positive observations. Paginated history (currently shows only 3 calls).
- [ ] **Engagement trend chart:** Line chart of engagement score over time per senior (data exists in call_analyses)
- [ ] **Family sharing:** Invite co-caregivers via email to co-manage a senior (Clerk-based)
- [ ] **Interest editing post-onboarding:** Currently locked after wizard. Add edit capability on Profile tab.
- [ ] **Fix timezone hardcoding:** Onboarding hardcodes `America/New_York` — use senior's actual location
- [ ] **Fix error handling:** Replace all `alert()` with toast notifications. Add network error detection.
- [ ] **Mobile responsiveness:** Hamburger menu for <768px, test form inputs on mobile keyboard
- [ ] **Update topics expansion:** Currently only 4 hardcoded topics. Make dynamic or expand list.
- [ ] **Reminder effectiveness:** Show which reminders got acknowledged vs. missed

### Key Files

| File | Purpose |
|------|---------|
| `apps/consumer/src/pages/Dashboard.tsx` | Call insights, charts, settings |
| `apps/consumer/src/pages/Onboarding.tsx` | Timezone fix, topic expansion |
| `apps/consumer/src/lib/api.ts` | New API calls for insights, sharing |

---

## Agent 5: Admin Dashboard & Analytics

**Priority: MEDIUM**
**Rationale:** Admins need operational tools to manage at scale. The dashboard works for basic CRUD but has zero charts, no search/filter, no pagination, no bulk operations, and no senior detail page.

### Scope

- [ ] **Analytics dashboard:** Engagement trend (line chart), call frequency heatmap, reminder delivery rates, concern frequency by type. Use Recharts or Chart.js.
- [ ] **Senior detail page:** Full profile view with activity timeline (calls, memories, reminders, analyses chronologically)
- [ ] **Search and filter:** On seniors list (by name, location, engagement level), calls list (by date, senior, status), reminders (by senior, type)
- [ ] **Pagination:** All list endpoints (seniors, calls, reminders, analyses)
- [ ] **Memory management UI:** Display memories in filterable list (by type, importance, recency), allow manual importance adjustment
- [ ] **Bulk operations:** Batch create reminders for groups, batch enable/disable seniors
- [ ] **Mobile hamburger menu:** Sidebar collapses on <768px
- [ ] **Schedule conflict detection:** Visual indicator when multiple seniors scheduled at overlapping times
- [ ] **Data export:** CSV download for call history, transcripts, summaries

### Key Files

| File | Purpose |
|------|---------|
| `apps/admin-v2/src/pages/` | All page upgrades |
| `apps/admin-v2/src/lib/api.ts` | New API calls |
| `apps/admin-v2/src/components/` | New chart + filter components |

---

## Agent 6: Infrastructure & Reliability

**Priority: MEDIUM**
**Rationale:** No feature flags, no circuit breakers, known transcript race condition, no graceful shutdown, no synthetic monitoring. The system works but can't safely experiment or recover from provider outages.

### Scope

- [ ] **Feature flag system:** Integrate GrowthBook (self-hosted on Railway) or build simpler DB-backed flag system. Python SDK in bot.py, Node.js SDK in scheduler. Prerequisite for safe rollout of everything else.
- [ ] **Fix transcript race condition:** Ensure transcript captured to DB BEFORE async post-call processing starts. Known issue on fast hangups.
- [ ] **Graceful shutdown:** Signal handlers on Railway pod shutdown — end active calls cleanly, flush logs, commit pending writes.
- [ ] **Circuit breakers for external services:** If Deepgram/ElevenLabs/OpenAI timeout, fall back gracefully instead of hanging the call.
- [ ] **Health metrics:** Expose `/metrics` endpoint with service health (STT, TTS, LLM availability, post-call success rate, queue depth)
- [ ] **Synthetic monitoring:** Periodic test call to verify pipeline health, catch STT/TTS outages before seniors notice.
- [ ] **Database performance:** Add HNSW indexes for pgvector (memory search is O(n) currently), verify indexes on hot queries, add connection pool monitoring.

### Key Files

| File | Purpose |
|------|---------|
| `pipecat/bot.py` | Feature flags, circuit breakers, shutdown |
| `pipecat/main.py` | Health metrics endpoint, signal handlers |
| `pipecat/services/post_call.py` | Transcript race condition fix |
| `pipecat/db/client.py` | HNSW indexes, pool monitoring |
| `pipecat/config.py` | Feature flag config |

---

## Agent 7: Testing & Quality Assurance

**Priority: MEDIUM**
**Rationale:** 221 Pipecat tests pass, 4 LLM simulation tests pass, but frontends have zero tests, there are 2 known failures in test_tools.py, and no integration tests verify the Node.js / Pipecat boundary.

### Scope

- [ ] **Frontend test setup:** Vitest + React Testing Library for both admin-v2 and consumer app. Priority: onboarding flow, reminder CRUD, call initiation, auth flows.
- [ ] **Fix 2 test_tools.py failures:** Graceful fallback returns "success" not "error" — fix handler contract or update test expectations.
- [ ] **E2E test framework:** Playwright tests for critical paths — admin login, create senior, create reminder, view call history; consumer onboarding, dashboard, initiate call.
- [ ] **Integration tests:** Verify both backends handle the same DB schema changes correctly. Test reminder creation in Node.js → delivery in Pipecat pipeline.
- [ ] **API contract tests:** Ensure Node.js and Pipecat API routes return consistent response shapes.
- [ ] **Accessibility audit:** ARIA labels, keyboard navigation, screen reader compatibility (elderly caregiver audience).

### Key Files

| File | Purpose |
|------|---------|
| `apps/admin-v2/` | New test setup + test files |
| `apps/consumer/` | New test setup + test files |
| `pipecat/tests/test_tools.py` | Fix 2 known failures |
| **NEW** `e2e/` | Playwright E2E test directory |

---

## Execution Phases

```
Phase 1 (parallel):  Agent 1 (Safety)  +  Agent 3 (Conversation)  +  Agent 7 (Testing)
Phase 2 (parallel):  Agent 2 (Notifications)  +  Agent 4 (Consumer)  +  Agent 5 (Admin)
Phase 3:             Agent 6 (Infrastructure)
```

**Rationale:**
- Phase 1 addresses the most critical product gap (safety), core experience (conversation), and quality foundation (testing) simultaneously
- Phase 2 builds on Phase 1 — notifications depend on the alert system, consumer/admin UIs benefit from test coverage
- Phase 3 is last because feature flags benefit from having features built first (you flag what exists), but the transcript race condition fix can be pulled forward if blocking

---

## Audit Summary Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Voice Pipeline Architecture | 9/10 | Mature, well-tested, production-ready |
| Prompt Clarity | 8/10 | Excellent output constraints; weak on behavioral nuance |
| Tool Coverage | 6/10 | 4 basic tools; missing escalation, activity, medical |
| Context Management | 7/10 | Good tiering; weak integration across phases |
| Memory Effectiveness | 7/10 | Good decay/dedup; weak real-time refresh |
| Emotional Safety | 5/10 | Patterns detect issues; no escalation pathway |
| Admin Dashboard | 6/10 | Core CRUD works; no analytics, search, or pagination |
| Consumer App | 5/10 | Onboarding works; missing insights, sharing, mobile |
| Testing Coverage | 6/10 | Strong backend; zero frontend tests |
| Infrastructure Resilience | 5/10 | No feature flags, circuit breakers, or graceful shutdown |
| Documentation | 9/10 | Excellent CLAUDE.md, DIRECTORY.md, architecture docs |

---

*This plan was generated from a comprehensive codebase audit on February 18, 2026.*
