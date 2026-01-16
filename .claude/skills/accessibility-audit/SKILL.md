---
name: accessibility-audit
description: Audit code for accessibility best practices for elderly users
---

# Accessibility Audit for Elderly Users

When this skill is invoked, perform a comprehensive accessibility audit of the codebase with focus on elderly users:

## What to Check:

### 1. Font Sizes & Readability
- Minimum font size should be 16px (preferably 18px+)
- Line height should be at least 1.5
- Text should have sufficient contrast (WCAG AAA: 7:1 for normal text)
- No light gray on white or similar low-contrast combinations

### 2. Color & Contrast
- Test all text/background combinations for WCAG AAA compliance
- Don't rely solely on color to convey information
- Consider color blindness (especially red-green)
- Use tools like contrast checkers

### 3. Voice Interface Compatibility
- Check for proper ARIA labels on interactive elements
- Ensure semantic HTML (button vs div with onclick)
- Verify screen reader compatibility
- Test with voice assistants (Alexa, Google Home)

### 4. Navigation & Interaction
- Large touch targets (minimum 44x44px)
- No complex gestures (swipes, multi-finger)
- Clear, simple navigation paths
- Avoid time-sensitive actions
- Confirm dialogs for destructive actions

### 5. Error Handling
- Clear, friendly error messages (no jargon)
- Visual AND auditory feedback
- Easy recovery from errors
- Multiple confirmation for critical actions

### 6. Content Clarity
- Simple, clear language (avoid technical terms)
- Short sentences and paragraphs
- Clear headings and structure
- Consistent terminology

## Report Format:

Provide findings in this format:
- ✅ **Passes**: What's working well
- ⚠️ **Warnings**: Areas that could be improved
- ❌ **Fails**: Critical accessibility issues
- 💡 **Recommendations**: Specific improvements with code examples

## Example Usage:
```
/accessibility-audit
```

This will scan the codebase and provide a detailed report with actionable recommendations.
