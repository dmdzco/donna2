# HIPAA Compliance Overview

> Status: **Pre-Compliance** -- Technical safeguards partially implemented, administrative and organizational safeguards not yet in place.

| Field | Value |
|-------|-------|
| Last Updated | April 4, 2026 |
| Owner | TBD |
| Review Cadence | Quarterly |
| Related Docs | [BAA Tracker](BAA_TRACKER.md), [Breach Notification](BREACH_NOTIFICATION.md), [Data Retention](DATA_RETENTION_POLICY.md), [Vendor Security](VENDOR_SECURITY_EVALUATION.md) |

---

## Table of Contents

1. [Why HIPAA Applies to Donna](#why-hipaa-applies-to-donna)
2. [Covered Entity vs Business Associate Analysis](#covered-entity-vs-business-associate-analysis)
3. [What Constitutes PHI in Donna](#what-constitutes-phi-in-donna)
4. [Current Compliance Status](#current-compliance-status)
5. [Technical Safeguards (HIPAA SS 164.312)](#technical-safeguards-hipaa--164312)
6. [Administrative Safeguards (HIPAA SS 164.308)](#administrative-safeguards-hipaa--164308)
7. [Physical Safeguards (HIPAA SS 164.310)](#physical-safeguards-hipaa--164310)
8. [Organizational Requirements (HIPAA SS 164.314)](#organizational-requirements-hipaa--164314)
9. [Risk Assessment Summary](#risk-assessment-summary)
10. [Remediation Roadmap](#remediation-roadmap)
11. [Next Steps](#next-steps)

---

## Why HIPAA Applies to Donna

The Health Insurance Portability and Accountability Act (HIPAA) establishes national standards for protecting individuals' medical records and personal health information. HIPAA applies when an entity creates, receives, maintains, or transmits **Protected Health Information (PHI)** in the course of providing healthcare-related services.

Donna is an AI companion that makes phone calls to elderly individuals. During these calls, Donna:

- **Delivers medication reminders** -- directly handling prescription and dosage information
- **Conducts daily check-ins** -- conversations where seniors discuss health conditions, symptoms, doctor visits, and medical concerns
- **Stores health-related memories** -- semantic memory system retains facts about a senior's medications, health conditions, medical appointments, and related details
- **Generates call analyses** -- post-call AI analysis evaluates engagement, detects concerns (including health concerns), and generates caregiver notifications
- **Sends caregiver notifications** -- mood summaries and concern alerts that may reference health status

Even though Donna is not a healthcare provider, the nature of the data it processes -- medication information, health discussions, medical concerns linked to identifiable individuals (name + phone number) -- constitutes PHI under HIPAA.

**Key legal question:** Whether Donna is a "covered entity" or a "business associate" depends on the business model (see analysis below). Regardless of classification, handling PHI without proper safeguards creates legal and ethical risk.

---

## Covered Entity vs Business Associate Analysis

### Definitions

- **Covered Entity**: A health plan, healthcare clearinghouse, or healthcare provider that transmits health information electronically in connection with a HIPAA-covered transaction.
- **Business Associate**: A person or organization that performs functions or activities on behalf of, or provides services to, a covered entity that involve access to PHI.

### Donna's Classification

| Scenario | Classification | Implication |
|----------|---------------|-------------|
| Donna operates independently, selling directly to caregivers/seniors | **Likely NOT a covered entity** (not a health plan, clearinghouse, or provider billing electronically) | HIPAA may not technically apply, but FTC Act Section 5 (unfair/deceptive practices), state health privacy laws, and best practice still demand PHI-level protection |
| Donna partners with a healthcare provider, health plan, or senior living facility | **Business Associate** | Must sign BAAs with covered entity partners AND with all Donna's subcontractors (downstream BAAs) |
| Donna bills insurance for its services or is classified as a telehealth provider | **Covered Entity** | Full HIPAA compliance required: Privacy Rule, Security Rule, Breach Notification Rule |

### Recommendation

**Treat Donna as if HIPAA applies regardless of current classification.** Reasons:

1. **Future-proofing**: Any partnership with a healthcare provider or senior living facility will require HIPAA compliance as a condition of the contract.
2. **State laws**: Many states (California CCPA/CMIA, New York SHIELD Act, Texas HB 300) have health data protection laws that apply even to non-covered entities.
3. **FTC enforcement**: The FTC has taken action against companies handling health data without adequate safeguards, regardless of HIPAA status.
4. **Trust**: Caregivers entrusting their loved ones to Donna expect healthcare-grade data protection.
5. **Investor/enterprise readiness**: HIPAA compliance is a prerequisite for B2B healthcare partnerships and fundraising in the health-tech space.

---

## What Constitutes PHI in Donna

PHI is any individually identifiable health information. In Donna's system, the following data elements are PHI when combined with identifying information (name, phone number, senior ID):

| Data Element | Location | PHI? | Sensitivity |
|-------------|----------|------|-------------|
| Senior name + phone number | `seniors` table | Yes (identifiers) | High |
| Medication reminders (drug name, dosage, schedule) | `reminders` table | Yes | High |
| Conversation transcripts mentioning health | `conversations.transcript` JSONB | Yes | High |
| Medical notes | `seniors.medical_notes` | Yes | High |
| Memories about health conditions | `memories` table | Yes | High |
| Call analyses mentioning health concerns | `call_analyses.concerns` | Yes | High |
| Caregiver mood/concern notifications | `notifications.content` | Yes | Medium |
| Daily call context (topics discussed) | `daily_call_context` | Yes (if health topics) | Medium |
| Call summaries | `conversations.summary` | Yes (if health topics) | Medium |
| Sentiment/engagement scores | `call_analyses` | Low risk alone | Low |
| Interests (e.g., "gardening") | `seniors.interests` | No (unless health-related) | Low |
| City/state/zip | `seniors` table | Yes (geographic identifiers) | Medium |

**Key insight**: Nearly all conversation data is potentially PHI because seniors routinely discuss health during calls. The system cannot reliably distinguish health-related conversation content from non-health content, so all conversation data should be treated as PHI.

---

## Current Compliance Status

### What Is Implemented

| Safeguard | Status | Details |
|-----------|--------|---------|
| Access controls (authentication) | Implemented | 3-tier auth: API key, JWT, Clerk session |
| Access controls (authorization) | Partial | Admin vs. caregiver roles exist, but no granular per-senior access control for admin users |
| Encryption in transit | Implemented | TLS everywhere: Railway (HTTPS), Neon (SSL), Twilio (TLS), all API calls over HTTPS |
| Encryption at rest | Partial | Neon PostgreSQL encrypts at rest (AES-256); application-level encryption of PHI fields not implemented |
| Audit logging | Minimal | Sentry captures errors with request IDs; no dedicated HIPAA audit log (who accessed what PHI, when) |
| PII sanitization in logs | Implemented | `sanitize.py` masks phone numbers and names in application logs |
| Input validation | Implemented | Pydantic schemas on all Pipecat API inputs; Zod schemas on Node.js API inputs |
| Rate limiting | Implemented | 5-tier rate limiting on all API endpoints |
| Security headers | Implemented | HSTS, X-Frame-Options, CSP-adjacent headers |
| Twilio webhook validation | Implemented | X-Twilio-Signature verification on all `/voice/*` endpoints |
| Error handling (no data leakage) | Implemented | Global error handler strips internal details from API responses |
| Environment isolation | Implemented | dev/staging/production with separate databases and phone numbers |
| Sentry PII controls | Implemented | `send_default_pii=False` configured |

### What Is NOT Implemented (Gaps)

| Safeguard | Status | Priority | Effort |
|-----------|--------|----------|--------|
| Business Associate Agreements (BAAs) | **Not signed with any vendor** | CRITICAL | Medium (sales outreach) |
| Application-level encryption of PHI | Not implemented | HIGH | Medium (encrypt `medical_notes`, `transcript`, `memories.content`) |
| HIPAA audit trail | Not implemented | HIGH | Medium (dedicated audit log table: who, what, when, from where) |
| Data retention / automated purge | Not implemented | HIGH | Medium (see [Data Retention Policy](DATA_RETENTION_POLICY.md)) |
| Formal risk assessment | Not performed | HIGH | Medium (documented risk analysis per 45 CFR 164.308(a)(1)) |
| Workforce training | Not performed | MEDIUM | Low (document policies, train team) |
| Breach notification procedures | Not documented | HIGH | Low (see [Breach Notification](BREACH_NOTIFICATION.md)) |
| Backup and disaster recovery plan | Partial (Neon has backups) | MEDIUM | Low (document and test) |
| Minimum necessary standard | Not enforced | MEDIUM | Medium (limit PHI in API responses to what's needed) |
| De-identification for analytics | Not implemented | MEDIUM | Medium (strip identifiers for aggregated metrics) |
| Physical safeguard documentation | Not documented | LOW | Low (Railway/Neon/Vercel handle physical security) |
| Contingency plan (emergency mode) | Not documented | MEDIUM | Low |
| Unique user identification | Partial | LOW | Low (admin users exist but no individual audit trail per action) |

---

## Technical Safeguards (HIPAA SS 164.312)

### (a)(1) Access Control -- Required

| Requirement | Status | Implementation |
|------------|--------|----------------|
| Unique user identification | Partial | Admin JWT has `adminId`; Clerk has `userId`. No individual audit per API call. |
| Emergency access procedure | Not implemented | No documented procedure for emergency PHI access. |
| Automatic logoff | Partial | JWT tokens expire (configurable). No forced session termination. |
| Encryption and decryption | Partial | TLS in transit. Neon AES-256 at rest. No app-level field encryption. |

**Gap: Application-level encryption.** The `medical_notes`, `transcript`, `memories.content`, and `summary` fields contain the most sensitive PHI and should be encrypted at the application level (not just at-rest disk encryption) so that database-level access (e.g., a compromised Neon credential) does not expose plaintext PHI.

**Remediation:**
1. Implement AES-256-GCM field-level encryption for `seniors.medical_notes`, `conversations.transcript`, `conversations.summary`, `memories.content`, `call_analyses.summary`, and `call_analyses.concerns`.
2. Store encryption keys in a secrets manager (e.g., AWS KMS, HashiCorp Vault), NOT in environment variables alongside database credentials.
3. Implement key rotation procedures.

### (b) Audit Controls -- Required

| Requirement | Status |
|------------|--------|
| Hardware/software/procedural mechanisms to record and examine access to PHI | Not implemented |

**Gap: No HIPAA audit log.** The system logs errors via Sentry and application logs via Railway, but there is no structured, tamper-evident audit trail recording:
- Who accessed a senior's records
- What data was accessed or modified
- When the access occurred
- From which IP address/system

**Remediation:**
1. Create an `audit_logs` table with fields: `id`, `timestamp`, `actor_id`, `actor_type`, `action`, `resource_type`, `resource_id`, `ip_address`, `details`, `created_at`.
2. Add middleware to log all PHI read/write operations automatically.
3. Retain audit logs for minimum 6 years (HIPAA requirement).
4. Ensure audit logs themselves are append-only (no UPDATE/DELETE).

### (c)(1) Integrity -- Addressable

| Requirement | Status |
|------------|--------|
| Mechanisms to authenticate ePHI | Partial (DB constraints, input validation) |

### (d) Person or Entity Authentication -- Required

| Requirement | Status |
|------------|--------|
| Verify identity of persons seeking access to ePHI | Implemented (3-tier auth) |

### (e)(1) Transmission Security -- Required

| Requirement | Status |
|------------|--------|
| Integrity controls | Partial (HTTPS/TLS) |
| Encryption | Implemented (TLS on all connections) |

---

## Administrative Safeguards (HIPAA SS 164.308)

| Requirement | Status | Action Needed |
|------------|--------|---------------|
| (a)(1) Security management process | Not implemented | Conduct formal risk analysis, implement risk management policies |
| (a)(2) Assigned security responsibility | Not assigned | Designate a HIPAA Security Officer |
| (a)(3) Workforce security | Not implemented | Background checks, access termination procedures |
| (a)(4) Information access management | Partial | Need role-based access policies, access review procedures |
| (a)(5) Security awareness and training | Not implemented | Develop and deliver HIPAA training to all team members |
| (a)(6) Security incident procedures | Not documented | See [Breach Notification Runbook](BREACH_NOTIFICATION.md) |
| (a)(7) Contingency plan | Not documented | Disaster recovery, emergency mode, data backup procedures |
| (a)(8) Evaluation | Not performed | Annual security evaluation |
| (b)(1) Business associate contracts | **Not signed** | See [BAA Tracker](BAA_TRACKER.md) -- 13+ vendors need evaluation |

---

## Physical Safeguards (HIPAA SS 164.310)

Since Donna runs entirely on cloud infrastructure, physical safeguards are largely delegated to infrastructure providers:

| Requirement | Provider | Status |
|------------|----------|--------|
| Facility access controls | Railway, Neon, Vercel | Covered by provider SOC 2 / physical security programs |
| Workstation use | N/A (no on-site PHI processing) | Developer machines access PHI via production database -- policy needed |
| Workstation security | N/A | Need policy: full-disk encryption, screen lock, no PHI on local machines |
| Device and media controls | N/A | Need policy: how to handle data on developer machines, disposal procedures |

**Gap: Developer access to production data.** The development workflow documents that `make deploy-dev` uses Neon branch copies of production data. This means developer machines indirectly access production PHI. Policy needed:
- Developers should not have direct SQL access to production database
- Dev/staging environments should use synthetic data, not production copies
- If production data copies are necessary, they should be de-identified first

---

## Organizational Requirements (HIPAA SS 164.314)

| Requirement | Status | Action Needed |
|------------|--------|---------------|
| (a) Business associate contracts | Not signed | Execute BAAs with all vendors processing PHI (see [BAA Tracker](BAA_TRACKER.md)) |
| (b) Group health plan requirements | N/A | Donna is not a group health plan |

---

## Risk Assessment Summary

A formal risk assessment per 45 CFR 164.308(a)(1)(ii)(A) has not yet been conducted. Below is a preliminary assessment:

| Risk Area | Likelihood | Impact | Risk Level | Mitigation |
|-----------|-----------|--------|------------|------------|
| Third-party vendor breach (no BAAs) | High | High | **CRITICAL** | Sign BAAs with all vendors processing PHI |
| Database credential compromise | Medium | High | **HIGH** | App-level field encryption, key rotation, least-privilege DB users |
| No audit trail for PHI access | High | Medium | **HIGH** | Implement audit logging |
| Conversation data in 13+ vendor systems | High | High | **CRITICAL** | Minimize data sent to vendors, sign BAAs, evaluate vendor alternatives |
| Developer access to production data | Medium | Medium | **MEDIUM** | Synthetic data for dev, restrict production access |
| No data retention policy | High | Medium | **HIGH** | Implement automated purge (see [Data Retention](DATA_RETENTION_POLICY.md)) |
| No breach notification procedures | Medium | High | **HIGH** | Document and drill procedures (see [Breach Notification](BREACH_NOTIFICATION.md)) |
| No workforce training | High | Medium | **MEDIUM** | Develop and deliver HIPAA training |
| Insecure Clerk token verification | Medium | High | **HIGH** | Currently `verify_signature=False` in Python auth middleware; must verify Clerk JWT signatures properly |

---

## Remediation Roadmap

### Phase 1: Foundation (Weeks 1-4) -- CRITICAL

1. **Sign BAAs with tier-1 vendors** (Twilio, Anthropic, Neon, Deepgram, Google, OpenAI, Sentry) -- these all offer BAAs on enterprise/business plans.
2. **Designate a HIPAA Security Officer** (can be a co-founder initially).
3. **Document breach notification procedures** -- see [Breach Notification](BREACH_NOTIFICATION.md).
4. **Implement HIPAA audit logging** -- new `audit_logs` table, middleware integration.
5. **Fix Clerk JWT signature verification** in `pipecat/api/middleware/auth.py` (currently `verify_signature=False`).

### Phase 2: Data Protection (Weeks 5-8) -- HIGH

6. **Implement field-level encryption** for PHI columns (`medical_notes`, `transcript`, `memories.content`, `summary`, `concerns`).
7. **Implement data retention policies** with automated purge jobs -- see [Data Retention](DATA_RETENTION_POLICY.md).
8. **Evaluate and replace non-compliant vendors** (Cerebras, Cartesia, Tavily) -- see [Vendor Security](VENDOR_SECURITY_EVALUATION.md).
9. **Restrict developer access to production data** -- synthetic data for dev/staging environments.

### Phase 3: Organizational (Weeks 9-12) -- MEDIUM

10. **Conduct formal risk assessment** per 45 CFR 164.308(a)(1)(ii)(A).
11. **Develop and deliver workforce HIPAA training**.
12. **Document contingency/disaster recovery plan**.
13. **Implement minimum necessary standard** -- limit PHI in API responses.
14. **Annual evaluation schedule** -- establish quarterly review cadence.

### Phase 4: Ongoing -- CONTINUOUS

15. **Annual risk assessment** and policy review.
16. **Quarterly access reviews** -- who has access to what.
17. **Annual workforce re-training**.
18. **Vendor re-evaluation** -- annually review all vendor BAA and security status.
19. **Penetration testing** -- annual third-party security assessment.

---

## Next Steps

1. **Immediately**: Read the [BAA Tracker](BAA_TRACKER.md) and begin vendor outreach for BAA signing.
2. **This week**: Designate a HIPAA Security Officer and begin Phase 1.
3. **This month**: Complete the [Breach Notification](BREACH_NOTIFICATION.md) runbook and conduct a tabletop exercise.
4. **This quarter**: Complete Phases 1-2 of the remediation roadmap.

---

*This document is a living compliance guide. Update it as safeguards are implemented and gaps are closed. Target: full HIPAA compliance readiness by Q3 2026.*
