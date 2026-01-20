# Dynamic Model Routing: Observer-Driven

> **Principle**: Default to Haiku (fast). Observers explicitly request Sonnet when needed.

## Philosophy

Instead of hardcoding regex patterns to decide which model to use, let the **observers decide**. They're already analyzing the conversation - they should signal when more intelligence is required.

```
Default: Haiku (fast, cheap, good enough for 80% of turns)
Upgrade: Only when an observer explicitly requests it
```

## Architecture

```
User speaks → Observers analyze → Model recommendation → LLM
                   ↓                      ↓
            "use_sonnet: true"      Sonnet + more tokens
            "use_sonnet: false"     Haiku (default)
```

## Observer Output Schema

Each observer can include model recommendations in their output:

### Quick Observer (Layer 1)

```javascript
// pipelines/quick-observer.js

export function quickAnalyze(userText, conversationLog) {
  // ... existing signal detection ...

  // MODEL RECOMMENDATION
  const modelRecommendation = {
    use_sonnet: false,  // Default
    max_tokens: 100,    // Default
    reason: null,
  };

  // Safety-critical: Always use Sonnet
  if (signals.healthMentioned && signals.concernLevel === 'high') {
    modelRecommendation.use_sonnet = true;
    modelRecommendation.max_tokens = 200;
    modelRecommendation.reason = 'health_safety';
  }

  // Emotional distress: Use Sonnet for empathy
  if (signals.negativeEmotion && signals.emotionIntensity === 'strong') {
    modelRecommendation.use_sonnet = true;
    modelRecommendation.max_tokens = 200;
    modelRecommendation.reason = 'emotional_support';
  }

  return {
    signals,
    guidance,
    modelRecommendation,  // NEW
  };
}
```

### Fast Observer (Layer 2)

```javascript
// pipelines/fast-observer.js

export async function fastAnalyzeWithTools(userText, conversationLog, seniorId) {
  // ... existing Haiku analysis ...

  // Haiku can recommend upgrading to Sonnet for complex responses
  const haikuAnalysis = await analyzeWithHaiku(userText, conversationLog);

  return {
    sentiment: haikuAnalysis.sentiment,
    memories: memories,
    modelRecommendation: {
      use_sonnet: haikuAnalysis.needs_complex_response,
      max_tokens: haikuAnalysis.suggested_tokens || 100,
      reason: haikuAnalysis.complexity_reason,
    },
  };
}

// Haiku prompt includes:
// "If this requires a nuanced, empathetic, or detailed response, set needs_complex_response: true"
```

### Deep Observer (Layer 3)

```javascript
// pipelines/observer-agent.js

// Existing observer can also recommend model upgrades
{
  engagement_level: 'low',
  emotional_state: 'lonely',
  should_deliver_reminder: false,
  concerns: ['mentioned feeling isolated'],

  // NEW: Model recommendation
  model_recommendation: {
    use_sonnet: true,
    max_tokens: 200,
    reason: 're_engagement_needed'
  }
}
```

## Model Selection Logic

```javascript
// pipelines/model-selector.js

const MODELS = {
  FAST: 'claude-3-5-haiku-20241022',
  SMART: 'claude-sonnet-4-20250514',
};

/**
 * Select model based on observer recommendations
 * Default: Haiku. Upgrade only if an observer explicitly requests it.
 */
export function selectModel(quickResult, fastResult, deepResult, productFeatures = {}) {

  // Default configuration
  let config = {
    model: MODELS.FAST,
    max_tokens: 100,
    reason: 'default',
  };

  // Check observer recommendations (in priority order)

  // 1. Quick Observer (Layer 1) - immediate signals
  if (quickResult?.modelRecommendation?.use_sonnet) {
    config = {
      model: MODELS.SMART,
      max_tokens: quickResult.modelRecommendation.max_tokens || 200,
      reason: quickResult.modelRecommendation.reason || 'quick_observer',
    };
  }

  // 2. Fast Observer (Layer 2) - Haiku's recommendation from previous turn
  if (fastResult?.modelRecommendation?.use_sonnet) {
    config = {
      model: MODELS.SMART,
      max_tokens: Math.max(config.max_tokens, fastResult.modelRecommendation.max_tokens || 200),
      reason: fastResult.modelRecommendation.reason || 'fast_observer',
    };
  }

  // 3. Deep Observer (Layer 3) - full analysis from previous turn
  if (deepResult?.model_recommendation?.use_sonnet) {
    config = {
      model: MODELS.SMART,
      max_tokens: Math.max(config.max_tokens, deepResult.model_recommendation.max_tokens || 200),
      reason: deepResult.model_recommendation.reason || 'deep_observer',
    };
  }

  // 4. Product Features can override
  if (productFeatures.storytelling_mode) {
    config = { model: MODELS.SMART, max_tokens: 400, reason: 'storytelling_mode' };
  }

  if (productFeatures.reminder_delivery) {
    config = { model: MODELS.SMART, max_tokens: 250, reason: 'reminder_delivery' };
  }

  if (productFeatures.news_discussion) {
    config = { model: MODELS.SMART, max_tokens: 300, reason: 'news_discussion' };
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
