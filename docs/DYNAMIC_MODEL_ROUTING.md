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

## Integration

```javascript
// In v1-advanced.js generateAndSendResponseStreaming()

import { selectModel } from './model-selector.js';

// Quick observer runs synchronously
const quickResult = quickAnalyze(userMessage, this.conversationLog.slice(-6));

// Select model based on all observer signals
const modelConfig = selectModel(
  quickResult,
  this.lastFastObserverResult,  // From previous turn
  this.lastObserverSignal,       // From previous turn
  this.activeProductFeatures     // Storytelling mode, etc.
);

console.log(`[V1] Model: ${modelConfig.model.includes('haiku') ? 'Haiku' : 'Sonnet'}, ` +
            `tokens: ${modelConfig.max_tokens}, reason: ${modelConfig.reason}`);

const stream = anthropic.messages.stream({
  model: modelConfig.model,
  max_tokens: modelConfig.max_tokens,
  system: systemPrompt,
  messages: messages,
});
```

## Why This Approach is Better

| Old Approach (Regex) | New Approach (Observer-Driven) |
|---------------------|-------------------------------|
| Hardcoded patterns | AI decides what's complex |
| Brittle rules | Adaptive to context |
| Can't learn | Observers can be tuned |
| Same rules for everyone | Can personalize per senior |

## Product Features That Can Request Sonnet

| Feature | When Active | Max Tokens |
|---------|-------------|------------|
| **Storytelling Mode** | User asks for a story | 400 |
| **News Discussion** | Discussing current events | 300 |
| **Reminder Delivery** | Natural reminder weaving | 250 |
| **Memory Lane** | Discussing past memories | 300 |
| **Health Check-in** | Scheduled health questions | 200 |
| **Re-engagement** | Low engagement detected | 200 |

## Haiku Prompt for Complexity Detection

Add to fast-observer's Haiku call:

```javascript
const complexityPrompt = `
Analyze if this conversation turn requires a complex response.

Set needs_complex_response: true if ANY of these apply:
- User is emotionally distressed and needs empathy
- User asked a detailed question requiring explanation
- Topic is health/safety related
- User wants a story or detailed memory
- Conversation is going poorly and needs re-engagement
- User is confused and needs careful clarification

Set needs_complex_response: false for:
- Simple greetings and acknowledgments
- Casual back-and-forth
- User gave a short, content response
- Normal friendly conversation

Also suggest max_tokens: 50-400 based on expected response length.
`;
```

## Default Behavior

```
90% of turns: Haiku, 100 tokens, ~80ms
 → "Hi!" "Yes" "That's nice" "Okay" "Thanks"

10% of turns: Sonnet, 200-400 tokens, ~200ms
 → Health concerns, emotional support, stories, complex questions
```

## Observability

Log all routing decisions:

```javascript
this.conversationLog.push({
  role: 'assistant',
  content: fullResponse,
  timestamp: new Date().toISOString(),
  model_routing: {
    model: modelConfig.model,
    max_tokens: modelConfig.max_tokens,
    reason: modelConfig.reason,
    observer_recommendations: {
      quick: quickResult?.modelRecommendation,
      fast: this.lastFastObserverResult?.modelRecommendation,
      deep: this.lastObserverSignal?.model_recommendation,
    }
  }
});
```

## Implementation Steps

1. **Update `quick-observer.js`** - Add `modelRecommendation` to output
2. **Update `fast-observer.js`** - Add Haiku complexity detection
3. **Update `observer-agent.js`** - Add `model_recommendation` to output
4. **Create `model-selector.js`** - Central model selection logic
5. **Update `v1-advanced.js`** - Use `selectModel()` for dynamic routing
6. **Add product feature flags** - Storytelling mode, etc.

## Future: Learning

Track outcomes to improve observer recommendations:

```javascript
// After call ends
{
  model_used: 'haiku',
  observer_recommended: 'haiku',
  outcome: {
    user_engagement: 'high',
    call_duration: 480,
    concerns_raised: 0,
  }
}
// → Haiku was the right choice

{
  model_used: 'haiku',
  observer_recommended: 'haiku',
  outcome: {
    user_engagement: 'low',
    user_repeated_question: true,
  }
}
// → Should have used Sonnet, tune observer
```

---

*Let the AI decide when it needs more AI.*
