# Project Todo Dashboard

> Last updated: 2026-02-05

## Progress Overview

| Domain       | Done | In Progress | Pending | Blocked |
|--------------|------|-------------|---------|---------|
| Security     | 4    | 0           | 14      | 0       |
| Architecture | 1    | 1           | 5       | 0       |
| Product      | 40   | 0           | 14      | 0       |

**Production Readiness: 72%**

---

## Priority Queue (What to Work On Next)

Ordered by priority. Pick from the top.

| # | Domain | Item | Link | Effort |
|---|--------|------|------|--------|
| 1 | ARCH | Route Extraction (Phase 2) | [architecture.md#phase-2-route-extraction](./architecture.md#phase-2-route-extraction) | 1 week |
| 2 | ARCH | Finish Shared Packages (Phase 3) | [architecture.md#phase-3-shared-packages-setup](./architecture.md#phase-3-shared-packages-setup) | 1 week |
| 3 | SEC | Testing Infrastructure (60% coverage) | [security.md#testing-infrastructure](./security.md#testing-infrastructure) | 4-6 weeks |
| 4 | SEC | Redis Session Store | [security.md#redis-session-store](./security.md#redis-session-store) | 1 week |
| 5 | SEC | Error Recovery & Circuit Breakers | [security.md#error-recovery--circuit-breakers](./security.md#error-recovery--circuit-breakers) | 2 weeks |
| 6 | PROD | Telnyx Migration (cost: -65%) | [product.md#telnyx-migration](./product.md#telnyx-migration) | 2 weeks |
| 7 | PROD | Greeting Rotation System | [product.md#greeting-rotation-system](./product.md#greeting-rotation-system) | 3 days |
| 8 | PROD | In-Call Reminder Tracking | [product.md#in-call-reminder-tracking](./product.md#in-call-reminder-tracking) | 3 days |
| 9 | PROD | Cross-Call Reminder Tracking | [product.md#cross-call-reminder-tracking](./product.md#cross-call-reminder-tracking) | 1 week |
| 10 | PROD | Caregiver Authentication | [product.md#caregiver-authentication](./product.md#caregiver-authentication) | 1 week |
| 11 | SEC | TypeScript Migration | [security.md#typescript-migration](./security.md#typescript-migration) | 6-8 weeks |
| 12 | SEC | Structured Logging (Pino) | [security.md#structured-logging-pino](./security.md#structured-logging-pino) | 1 week |
| 13 | PROD | Call Analysis Dashboard | [product.md#call-analysis-dashboard](./product.md#call-analysis-dashboard) | 2 weeks |
| 14 | PROD | Caregiver Notifications | [product.md#caregiver-notifications](./product.md#caregiver-notifications) | 1 week |

---

## Domain Quick Links

- **[Security Todos](./security.md)** - Infrastructure hardening by priority tier (CRITICAL/HIGH/MEDIUM/LOW)
- **[Architecture Todos](./architecture.md)** - 7 cleanup phases with dependencies
- **[Product Todos](./product.md)** - Features by category (14 planned + 14 suggested)

---

## Recent Completions

- **[SEC]** Authentication (Clerk) - January 2026
- **[SEC]** Input Validation (Zod) - January 2026
- **[SEC]** Twilio Webhook Verification - January 2026
- **[SEC]** Rate Limiting - January 2026
- **[ARCH]** Phase 1: Frontend Separation - January 2026
- **[PROD]** Conversation Director Architecture - January 2026
- **[PROD]** Post-Call Analysis - January 2026
- **[PROD]** Memory & Context Improvements - January 2026

---

## Scale Gates

| Gate | User Count | Required Items |
|------|------------|----------------|
| **Now** | Real user data | All CRITICAL security items (DONE) |
| **Gate 1** | 100+ users | Testing, Redis, Route Extraction, Error Recovery |
| **Gate 2** | 500+ users | TypeScript, Logging, Observability, Graceful Shutdown |

---

*This dashboard is the single source of truth for task prioritization. Domain files contain full details.*
