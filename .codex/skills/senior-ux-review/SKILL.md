---
name: senior-ux-review
description: Review Donna experiences for older-adult usability, caregiver clarity, and reassuring low-friction interaction. Use when evaluating onboarding, dashboards, reminders, authentication, settings, copy, navigation, or any user-visible flow in `apps/consumer/`, `apps/mobile/`, `apps/admin-v2/`, or voice prompts intended for seniors and caregivers.
---

# Senior Ux Review

Optimize for legibility, reassurance, and obvious next steps. Do not optimize for novelty.

## Workflow

1. Read `DIRECTORY.md` and identify the active user surface.
2. Determine whether the flow is for seniors, caregivers, admins, or voice-call participants.
3. Inspect changed pages, components, copy, and navigation structure.
4. Evaluate whether the interaction is understandable for a user with reduced vision, low technical confidence, or lower dexterity.
5. Report findings first, ordered by severity, with file references and plain-language user impact.

## Donna-Specific Review Lens

- Prefer one obvious next step over feature density.
- Keep terminology concrete and familiar. Avoid internal terms such as "session", "stream", "cache", or "endpoint" in user-facing copy.
- Make success and failure states specific and reassuring.
- Avoid hiding key navigation or actions behind ambiguous icons.
- Reduce authentication friction where possible and verify recovery paths are understandable.
- Use confirmation for destructive actions and gentle recovery for errors.
- Ensure reminder, caregiver, and onboarding flows explain what happens next.
- For voice experiences, check greeting clarity, pacing, interruption tolerance, reminder delivery tone, and easy goodbye handling.

## Surface Priorities

- `apps/mobile/`: highest priority for touch ergonomics and on-the-go caregiver usage.
- `apps/consumer/src/`: highest priority for onboarding, dashboard comprehension, and reassurance.
- `apps/admin-v2/src/`: prioritize operational clarity and low-error workflows.
- `pipecat/prompts.py` and `pipecat/flows/nodes.py`: inspect when the UX issue is in spoken behavior rather than screen UI.

## Output

- Present findings first, ordered by severity.
- Include the user type affected: senior, caregiver, admin, or mixed.
- Explain the likely confusion/anxiety/error mode, not just the visual issue.
- If helpful, add a short follow-up section with strengths and targeted improvements after the findings.
