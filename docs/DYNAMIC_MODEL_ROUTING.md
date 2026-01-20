# Dynamic Model Routing: Haiku ↔ Sonnet

> **Goal**: Use the right model for each moment - fast for casual, powerful for complex.

## Overview

Instead of always using Sonnet (slow but smart) or always using Haiku (fast but simpler), dynamically route based on conversation context. The layered observers provide the signals needed to make smart routing decisions.

## Architecture

```
User speaks → Quick Observer (0ms) → Model Router → LLM
                    ↓                     ↓
              Signal Detection      Select Model + Tokens
                    ↓                     ↓
              health? emotion?      Haiku 50 tokens (casual)
              question? story?      Sonnet 300 tokens (complex)
```

## Routing Logic

### Upgrade to Sonnet (quality matters)

| Trigger | Reason | Max Tokens |
|---------|--------|------------|
| Health mentioned | Need careful, accurate response | 200 |
| Negative emotion | Need empathy and nuance | 200 |
| Complex question (>6 words + ?) | Need thoughtful answer | 250 |
| Story/explanation request | Need engaging narrative | 300 |
| Low engagement detected | Need to re-engage user | 200 |
| Medical/safety keywords | Can't afford mistakes | 250 |

### Stay with Haiku (speed matters)

| Trigger | Reason | Max Tokens |
|---------|--------|------------|
| Simple greeting | Just say hi back | 50 |
| Acknowledgment (yes/no/okay) | Quick confirmation | 50 |
| Short casual reply | Keep conversation flowing | 100 |
| Default (no special signals) | Normal conversation | 100 |

## Implementation

### File: `pipelines/model-router.js`

```javascript
/**
 * Dynamic Model Router
 * Selects Claude model and max_tokens based on conversation context
 */

const MODELS = {
  FAST: 'claude-3-5-haiku-20241022',
  SMART: 'claude-sonnet-4-20250514',
};

/**
 * Select model configuration based on conversation signals
 * @param {string} userText - Current user message
 * @param {object} quickSignals - From quick-observer (Layer 1)
 * @param {object} fastObserverResult - From fast-observer (Layer 2, previous turn)
 * @param {array} conversationLog - Full conversation history
 * @returns {object} { model, max_tokens, reason }
 */
export function selectModelConfig(userText, quickSignals = {}, fastObserverResult = null, conversationLog = []) {
  const text = userText.trim().toLowerCase();
  const wordCount = userText.split(/\s+/).length;

  // === MINIMAL RESPONSES (Haiku, few tokens) ===

  // Simple greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text)) {
    return { model: MODELS.FAST, max_tokens: 50, reason: 'greeting' };
  }

  // Simple acknowledgments
  if (/^(yes|no|yeah|nope|okay|ok|sure|thanks|thank you|bye|goodbye|alright|right|uh huh|mhm)\b/i.test(text)) {
    return { model: MODELS.FAST, max_tokens: 50, reason: 'acknowledgment' };
  }

  // Very short responses (likely back-channel)
  if (wordCount <= 3 && !quickSignals.askedQuestion) {
    return { model: MODELS.FAST, max_tokens: 75, reason: 'short_response' };
  }

  // === UPGRADE TO SONNET ===

  // Health concerns - need careful, accurate responses
  if (quickSignals.healthMentioned) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'health_concern' };
  }

  // Fall/accident mentioned - safety critical
  if (/\b(fell|fall|tripped|accident|hurt myself|injured)\b/i.test(text)) {
    return { model: MODELS.SMART, max_tokens: 250, reason: 'safety_concern' };
  }

  // Emotional distress - need empathy
  if (quickSignals.negativeEmotion) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'emotional_support' };
  }

  // Sentiment analysis says distressed
  if (fastObserverResult?.sentiment?.sentiment === 'distressed' ||
      fastObserverResult?.sentiment?.sentiment === 'sad') {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'detected_distress' };
  }

  // User asked a substantive question
  if (quickSignals.askedQuestion && wordCount > 6) {
    return { model: MODELS.SMART, max_tokens: 250, reason: 'complex_question' };
  }

  // Story or explanation requested
  if (/\b(tell me about|tell me a story|what happened|explain|how does|why did|remember when|can you describe)\b/i.test(text)) {
    return { model: MODELS.SMART, max_tokens: 300, reason: 'storytelling' };
  }

  // User mentions family - opportunity for meaningful conversation
  if (quickSignals.familyMentioned && wordCount > 5) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'family_discussion' };
  }

  // Low engagement - need to try harder to re-engage
  if (fastObserverResult?.sentiment?.engagement === 'low' && conversationLog.length > 6) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 're_engagement' };
  }

  // Medical/medication discussion
  if (/\b(medicine|medication|prescription|doctor said|appointment|diagnosis|symptoms|treatment)\b/i.test(text)) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'medical_discussion' };
  }

  // Discussing something from the past (memories)
  if (quickSignals.timeReference && wordCount > 8) {
    return { model: MODELS.SMART, max_tokens: 200, reason: 'memory_discussion' };
  }

  // === DEFAULT: Casual conversation (Haiku) ===
  return { model: MODELS.FAST, max_tokens: 100, reason: 'casual' };
}

/**
 * Get human-readable description of routing decision
 */
export function getRoutingDescription(config) {
  const descriptions = {
    greeting: 'Quick greeting response',
    acknowledgment: 'Simple acknowledgment',
    short_response: 'Brief casual reply',
    health_concern: 'Health topic - using careful response',
    safety_concern: 'Safety issue - using thorough response',
    emotional_support: 'Emotional support needed',
    detected_distress: 'Distress detected - empathetic response',
    complex_question: 'Answering detailed question',
    storytelling: 'Telling story or explaining',
    family_discussion: 'Family conversation - engaging deeply',
    re_engagement: 'Re-engaging disengaged user',
    medical_discussion: 'Medical topic - accurate response',
    memory_discussion: 'Discussing memories',
    casual: 'Normal conversation',
  };
  return descriptions[config.reason] || config.reason;
}
```

### Integration in `v1-advanced.js`

```javascript
import { selectModelConfig, getRoutingDescription } from './model-router.js';

// In generateAndSendResponseStreaming():

async generateAndSendResponseStreaming(userMessage) {
  // ... existing code for quick observer ...

  // Layer 1: Quick Observer (0ms)
  const quickResult = quickAnalyze(userMessage, this.conversationLog.slice(-6));

  // Select model dynamically based on context
  const modelConfig = selectModelConfig(
    userMessage,
    quickResult.signals,
    this.lastFastObserverResult,
    this.conversationLog
  );

  console.log(`[V1][${this.streamSid}] Model: ${modelConfig.model.split('-').pop()}, ` +
              `tokens: ${modelConfig.max_tokens}, reason: ${modelConfig.reason}`);

  // ... build system prompt ...

  // Use dynamic model and tokens
  const stream = anthropic.messages.stream({
    model: modelConfig.model,          // Dynamic!
    max_tokens: modelConfig.max_tokens, // Dynamic!
    system: systemPrompt,
    messages: messages,
  });

  // ... rest of streaming code ...
}
```

## Latency Impact

| Scenario | Model | First Token | Total Feel |
|----------|-------|-------------|------------|
| "Hi Donna" | Haiku | ~80ms | Instant |
| "Yes, I'm fine" | Haiku | ~80ms | Instant |
| "I fell yesterday" | Sonnet | ~200ms | Thoughtful pause |
| "Tell me about the weather" | Sonnet | ~200ms | Natural |
| "Okay" | Haiku | ~80ms | Instant |

**Net effect**: Most turns are faster (Haiku), complex turns feel appropriately thoughtful (Sonnet).

## Product Features Enabled

### 1. Smart Escalation
Casual chat stays fast. Important moments get full attention.

### 2. Cost Optimization
Haiku is ~10x cheaper than Sonnet. Most turns use Haiku.

### 3. Natural Pacing
Quick acknowledgments feel instant. Thoughtful responses have a natural "thinking" pause.

### 4. Adaptive Storytelling
When user wants a story or explanation, give them more tokens to work with.

### 5. Safety-First
Health and safety topics always get the smarter model - can't afford mistakes.

## Observability

Log routing decisions for analysis:

```javascript
// In conversation log entry
this.conversationLog.push({
  role: 'assistant',
  content: fullResponse,
  timestamp: new Date().toISOString(),
  routing: {
    model: modelConfig.model,
    max_tokens: modelConfig.max_tokens,
    reason: modelConfig.reason
  }
});
```

Dashboard can show:
- % of turns using Haiku vs Sonnet
- Average latency by routing reason
- Cost breakdown by model

## Testing Scenarios

| User Says | Expected Model | Expected Tokens |
|-----------|----------------|-----------------|
| "Hello" | Haiku | 50 |
| "I'm feeling dizzy" | Sonnet | 200 |
| "Tell me about your day" | Sonnet | 300 |
| "Yes" | Haiku | 50 |
| "I miss my daughter" | Sonnet | 200 |
| "What's the weather like?" | Haiku | 100 |
| "I fell in the bathroom yesterday" | Sonnet | 250 |
| "Okay, thanks" | Haiku | 50 |

## Implementation Steps

1. **Create `pipelines/model-router.js`** with routing logic
2. **Update `pipelines/v1-advanced.js`** to use dynamic routing
3. **Add routing info to conversation logs** for observability
4. **Test with sample conversations** to verify routing
5. **Monitor in production** and tune thresholds

## Future Enhancements

- **Learning from feedback**: Track which routing decisions led to good outcomes
- **Per-user preferences**: Some seniors may prefer longer responses
- **Time-of-day routing**: Morning calls might need more engagement
- **Topic-specific tuning**: Adjust based on senior's interests

---

*This feature reduces average latency while improving response quality for moments that matter.*
