---
name: senior-ux-review
description: Review user experience specifically for elderly users
---

# Senior-Friendly UX Review

When this skill is invoked, review the user experience with focus on elderly users' needs and preferences:

## Key Principles for Senior UX:

### 1. Simplicity Over Features
- ❌ Avoid: Feature bloat, complex multi-step workflows
- ✅ Prefer: Single-purpose screens, one action at a time
- ✅ Prefer: Clear, obvious next steps

### 2. Forgiving Interaction Design
- Large "undo" or "go back" options
- Confirm before destructive actions
- Auto-save instead of requiring manual saves
- No time limits on actions

### 3. Clear Visual Hierarchy
```
Priority order:
1. Primary action (large, high contrast)
2. Secondary actions (smaller, but still clear)
3. Tertiary/cancel actions (available but not prominent)
```

### 4. Familiar Patterns
- Use standard UI patterns (no novel interactions)
- Consistent placement of common elements
- Traditional language (not tech jargon)
- Phone metaphors for calls, not "sessions" or "streams"

### 5. Reassuring Feedback
- Always confirm actions were successful
- Show progress for long operations
- Gentle, friendly error messages
- Visual AND text/audio feedback

## UX Checklist:

### Voice Interface (Donna calling seniors)
- ✅ Clear greeting that identifies caller
- ✅ Slow, measured speaking pace
- ✅ Pauses to allow responses
- ✅ Repeats important information
- ✅ Graceful handling of "I didn't catch that"
- ✅ Easy way to end the call
- ✅ Confirmation before ending call

### Caregiver Dashboard
- ✅ At-a-glance status (not buried in menus)
- ✅ Large, tappable controls (mobile-first)
- ✅ Clear labels (not icons alone)
- ✅ Breadcrumbs for navigation
- ✅ Search instead of complex filtering

### Forms & Input
- ✅ Large input fields
- ✅ Clear labels above fields (not placeholder text)
- ✅ Inline validation (helpful, not punitive)
- ✅ Show/hide password toggle
- ✅ Autocomplete where appropriate
- ✅ Date pickers instead of manual entry

### Error States
```typescript
// ❌ BAD: Technical, scary
"Error 500: Internal server exception in API gateway"

// ✅ GOOD: Clear, actionable
"We couldn't complete that action. Please try again, or contact support if this continues."
```

### Success States
```typescript
// ❌ BAD: Generic toast
"Success"

// ✅ GOOD: Specific, reassuring
"Your reminder for Mom's medication at 2pm has been saved. She'll receive a call at that time."
```

## Common Senior UX Pitfalls to Avoid:

1. **Assuming Tech Literacy**
   - Don't use terms like "sync", "cache", "endpoint"
   - Explain features in plain language

2. **Hidden Navigation**
   - Avoid hamburger menus if possible
   - Keep main navigation visible

3. **Relying on Color Alone**
   - Use icons + text, not just colors
   - High contrast for all states

4. **Time Pressure**
   - No countdown timers
   - No auto-logout during active use

5. **Small Touch Targets**
   - Minimum 44x44px (Apple HIG)
   - Extra spacing between tappable items

6. **Complex Authentication**
   - Offer "remember me" with biometrics
   - Password recovery should be easy

## Review Output Format:

For each screen/flow reviewed:
1. **Purpose**: What's this for?
2. **Senior-Friendliness Score**: 1-5 stars
3. **Strengths**: What works well
4. **Issues**: Specific UX problems
5. **Recommendations**: How to improve

## Example Usage:
```
/senior-ux-review
```

Focus on putting yourself in the shoes of a 75+ year old using this system, possibly with:
- Reduced vision
- Limited tech experience
- Tremor or reduced dexterity
- Anxiety about "breaking things"
- Need for reassurance and clarity
