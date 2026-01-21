# Dynamic Token Routing

> **Status:** Superseded by the [Conversation Director](./CONVERSATION_DIRECTOR_SPEC.md) architecture.

## Current Implementation (v3.1)

The Conversation Director handles all dynamic token routing. Model selection is now based on Director + Quick Observer signals.

### Token Selection

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

### Implementation

Token selection is handled by `selectModelConfig()` in `pipelines/v1-advanced.js`:

```javascript
function selectModelConfig(quickResult, directorResult) {
  let config = {
    model: VOICE_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS, // 100
    reason: 'default'
  };

  // Director's recommendation takes priority
  if (directorResult?.model_recommendation) {
    const rec = directorResult.model_recommendation;
    config.max_tokens = rec.max_tokens || DEFAULT_MAX_TOKENS;
    config.reason = rec.reason || 'director';
  }

  // Quick observer can escalate tokens for urgent signals
  if (quickResult?.modelRecommendation?.max_tokens) {
    config.max_tokens = Math.max(
      config.max_tokens,
      quickResult.modelRecommendation.max_tokens
    );
  }

  return config;
}
```

### Conversation Director Output

The Director provides token recommendations based on comprehensive analysis:

```javascript
{
  model_recommendation: {
    max_tokens: 100-400,
    reason: "why this token count"
  }
}
```

**Director triggers for higher tokens:**
- `emotional_tone: 'sad'` → 200-250 tokens
- `engagement_level: 'low'` → 200 tokens
- `stay_or_shift: 'wrap_up'` → 150 tokens
- `should_deliver: true` (reminder) → 150 tokens

### Quick Observer Triggers

Instant regex-based signals that can escalate tokens:

| Pattern | Tokens | Reason |
|---------|--------|--------|
| Health mention (pain, fell, dizzy) | 150 | Safety needs care |
| Negative emotion (lonely, sad) | 200 | Empathy needs depth |
| Low engagement (short responses) | 150 | Re-engagement |

---

## Historical Context

Previously, the system used Haiku/Sonnet model switching. This was simplified to token-based routing with a single voice model (Claude Sonnet) because:

1. Token adjustment achieves similar effect (brief vs. extended responses)
2. Single model simplifies architecture
3. Gemini handles Director duties more cost-effectively than Haiku
4. Post-call analysis moved to async batch (not real-time)

---

*See [CONVERSATION_DIRECTOR_SPEC.md](./CONVERSATION_DIRECTOR_SPEC.md) for the full Director specification.*
