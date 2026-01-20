# Dynamic Model Routing (Observer-Driven)

## Current State

**As of January 2026**: The V1 pipeline already uses **Haiku** as the default conversation model (`claude-3-haiku-20240307`) with `max_tokens: 150`.

This document outlines the plan to add **dynamic upgrades** to Sonnet when observers detect situations that warrant more sophisticated responses.

---

## Philosophy

> "Let the AI decide when it needs more AI."

The 3-layer observer architecture already analyzes every conversation turn:
- **Layer 1 (Quick Observer)**: Instant regex - health mentions, emotions, engagement
- **Layer 2 (Fast Observer)**: Haiku analysis - sentiment, context, memories
- **Layer 3 (Deep Observer)**: Sonnet analysis - complex patterns (async)

Currently, observers only provide **guidance** to the conversation model. The enhancement is to also have observers recommend **which model** to use and **how much** it should say.

---

## Implementation Plan

### Phase 1: Add Model Recommendations to Observers

Each observer will output an optional `modelRecommendation`:

```javascript
modelRecommendation: {
  use_sonnet: true,        // Default: false (stick with Haiku)
  max_tokens: 300,         // Default: 150
  reason: 'health_safety'  // For logging/debugging
}
```

#### Quick Observer Triggers (Layer 1)

| Pattern | Upgrade to Sonnet? | max_tokens | Reason |
|---------|-------------------|------------|--------|
| Health mention (pain, fell, dizzy) | Yes | 200 | Safety requires thoughtful response |
| Negative emotion (lonely, sad) | Yes | 250 | Emotional support needs nuance |
| Low engagement (3+ short responses) | Yes | 200 | Re-engagement needs creativity |
| Family mention | No | 150 | Haiku handles warmth fine |
| Simple question | No | 100 | Quick answers are better |

#### Fast Observer Triggers (Layer 2)

| Sentiment Analysis | Upgrade to Sonnet? | max_tokens | Reason |
|-------------------|-------------------|------------|--------|
| `needs_empathy: true` | Yes | 250 | Empathy requires sophistication |
| `engagement: low` + `topic_shift` suggested | Yes | 200 | Creative re-engagement |
| Memory match (high importance) | Yes | 300 | Personalized story worth telling |
| `sentiment: concerned` | Yes | 250 | Careful, nuanced response |

#### Deep Observer Triggers (Layer 3)

The Deep Observer runs async and affects the **next** turn:

| Analysis | Upgrade to Sonnet? | max_tokens | Reason |
|----------|-------------------|------------|--------|
| `should_deliver_reminder: true` | Optional | 200 | Natural reminder delivery |
| Complex emotional pattern | Yes | 300 | Multi-turn emotional support |
| `should_end_call: true` | Yes | 250 | Graceful call wrap-up |

---

### Phase 2: Model Selection Logic

Add to `pipelines/v1-advanced.js`:

```javascript
const MODELS = {
  FAST: 'claude-3-haiku-20240307',   // Default - quick, cheap
  SMART: 'claude-3-5-sonnet-20241022' // Upgraded - nuanced, deeper
};

/**
 * Select model based on observer recommendations
 * Priority: Quick (immediate) > Fast (this turn) > Deep (from last turn)
 */
function selectModelConfig(quickResult, fastResult, deepResult, productFeatures = {}) {
  let config = {
    model: MODELS.FAST,
    max_tokens: 150,
    reason: 'default'
  };

  // Check observers in priority order (most urgent first)
  const recommendations = [
    quickResult?.modelRecommendation,
    fastResult?.modelRecommendation,
    deepResult?.modelRecommendation,
    productFeatures?.modelOverride
  ].filter(Boolean);

  for (const rec of recommendations) {
    if (rec.use_sonnet) {
      config = {
        model: MODELS.SMART,
        max_tokens: Math.max(config.max_tokens, rec.max_tokens || 200),
        reason: rec.reason || 'observer_upgrade'
      };
      break; // First upgrade wins
    } else if (rec.max_tokens) {
      // Allow token adjustment without model change
      config.max_tokens = Math.max(config.max_tokens, rec.max_tokens);
    }
  }

  return config;
}
```

### Phase 3: Integration Points

Modify the streaming call in `v1-advanced.js`:

```javascript
// Before Claude call
const modelConfig = selectModelConfig(
  quickResult,
  this.lastFastObserverResult,
  observerSignal,
  {} // product features
);

console.log(`[V1] Using ${modelConfig.model} (${modelConfig.reason}), max_tokens: ${modelConfig.max_tokens}`);

// In streaming call
const stream = await anthropic.messages.stream({
  model: modelConfig.model,
  max_tokens: modelConfig.max_tokens,
  system: systemPrompt,
  messages: claudeMessages,
});
```

---

## Product Features (Future)

Product-level features can also request model upgrades:

| Feature | Model | max_tokens | Trigger |
|---------|-------|------------|---------|
| Storytelling Mode | Sonnet | 400 | User asks for a story |
| News Discussion | Sonnet | 300 | Complex current events |
| Life Review | Sonnet | 500 | Deep personal memories |
| Quick Check-in | Haiku | 100 | Simple daily hello |
| Medication Reminder | Haiku | 150 | Straightforward reminder |

---

## Files to Modify

| File | Changes |
|------|---------|
| `pipelines/quick-observer.js` | Add `modelRecommendation` to output |
| `pipelines/fast-observer.js` | Add `modelRecommendation` to output |
| `pipelines/observer-agent.js` | Add `modelRecommendation` to output |
| `pipelines/v1-advanced.js` | Add `selectModelConfig()`, use in streaming call |

---

## Implementation Checklist

- [ ] Add `modelRecommendation` output to `quick-observer.js`
- [ ] Add `modelRecommendation` output to `fast-observer.js`
- [ ] Add `modelRecommendation` output to `observer-agent.js`
- [ ] Create `selectModelConfig()` function in `v1-advanced.js`
- [ ] Integrate model selection into streaming path
- [ ] Add logging for model selection decisions
- [ ] Test health mention → Sonnet upgrade
- [ ] Test emotional support → Sonnet upgrade
- [ ] Test normal conversation stays on Haiku

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Default model | Haiku | Haiku (unchanged) |
| Health/safety responses | Haiku (fast but brief) | Sonnet (thoughtful) |
| Emotional support | Haiku | Sonnet (nuanced) |
| Cost per call | ~$0.002 | ~$0.003 (10-20% increase) |
| Response quality (sensitive) | Good | Excellent |

---

*Last updated: January 2026*
