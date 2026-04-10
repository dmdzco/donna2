---
name: accessibility-audit
description: Audit Donna user interfaces for accessibility issues with emphasis on older adults, caregivers, and low-friction interaction. Use when reviewing changes in `apps/consumer/`, `apps/mobile/`, `apps/admin-v2/`, shared styles, forms, navigation, or any user-visible flow where text size, contrast, semantics, focus handling, touch targets, and error recovery matter.
---

# Accessibility Audit

Inspect the affected app first. Prioritize `apps/consumer/` and `apps/mobile/` for senior/caregiver-facing flows. Review `apps/admin-v2/` when caregiver/admin workflows changed.

## Workflow

1. Read `DIRECTORY.md` and identify the active app and changed pages.
2. Open the changed page/component files plus any shared CSS, theme, or UI primitives they depend on.
3. Check the rendered flow for typography, contrast, semantics, keyboard/focus behavior, touch target size, form labels, and error recovery.
4. Review Playwright coverage when user-visible behavior changed. Expand tests if the regression is easy to automate.
5. Report findings first, ordered by severity, with file references.

## Donna-Specific Checks

- Keep body text at least 16px and prefer 18px+ on senior-facing surfaces.
- Favor clear labels over icon-only affordances.
- Require obvious primary actions and reversible flows.
- Avoid relying on color alone for state, urgency, or success.
- Keep touch targets at least 44x44px with enough spacing to reduce accidental taps.
- Prefer labels above inputs, not placeholder-only forms.
- Ensure validation and error copy is plain-language and recovery-oriented.
- Check contrast on muted text, disabled states, and status badges. Donna should aim above baseline accessibility, not merely scrape by.
- Verify focus order and visible focus indicators for keyboard users on web apps.
- Treat authentication, onboarding, reminder management, and caregiver settings as high-risk flows for usability regressions.

## Donna Surface Priorities

- `apps/consumer/src/`: highest priority for caregiver onboarding and dashboard UX.
- `apps/mobile/`: highest priority for touch targets, form ergonomics, and text legibility.
- `apps/admin-v2/src/`: prioritize readability and low-friction workflows over novelty.
- Ignore legacy or mockup-only surfaces unless the task explicitly targets them.

## Output

- Present findings first, ordered by severity.
- Include file references and the concrete user impact.
- Distinguish hard failures from improvement opportunities.
- Call out residual risk when no automated accessibility validation was run.
