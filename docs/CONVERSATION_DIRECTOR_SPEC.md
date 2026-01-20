# Conversation Director Specification

## Overview

This document specifies Donna's V1 pipeline architecture with the **Conversation Director** - a proactive AI layer that guides each call in real-time.

---

## Architecture Summary

### Real-Time (During Call)

| Layer | Name | Model | Speed | Role |
|-------|------|-------|-------|------|
| L1 | Quick Observer | Regex (no AI) | 0ms | Instant pattern detection |
| L2 | **Conversation Director** | Gemini 3 Flash | ~100-150ms | Proactive flow guidance |
| Voice | Main Conversation | Claude Haiku/Sonnet | ~250-400ms | Talks to senior |

### Post-Call (Async Batch)

| Process | Model | Trigger | Output |
|---------|-------|---------|--------|
| Call Analysis | Gemini Flash | Call ends | Summary, alerts, analytics |

### Why This Architecture?

- **No real-time L3** - Deep analysis doesn't help the live conversation (too slow)
- **Post-call is cheaper** - Run full transcript through Gemini Flash once, not per-turn
- **Same quality** - Caregiver alerts generated from complete context, not partial
- **4x cost savings** - ~$0.0005 post-call vs ~$0.002 real-time per call

---

## Layer 1: Quick Observer (Unchanged)

**File:** `pipelines/quick-observer.js`

Instant regex-based pattern detection that affects the CURRENT response:
- Health mentions (pain, fell, dizzy, medication)
- Family mentions (daughter, grandkids)
- Emotional signals (lonely, sad, worried)
- Engagement detection (short responses)
- Question detection

**No changes needed** - L1 works well as-is.

---

## Layer 2: Conversation Director

### Purpose

Transform the Fast Observer from reactive sentiment analysis into a **proactive Conversation Director** that guides the flow of each call.

The Conversation Director:
1. **Tracks state** - Topics covered, goals pending, call phase
2. **Steers flow** - When to transition topics, what to discuss next
3. **Manages reminders** - Finding natural moments to deliver reminders
4. **Monitors pacing** - Detecting if conversation is dragging or rushed
5. **Recommends model** - When to upgrade from Haiku to Sonnet
6. **Provides guidance** - Specific instructions for Claude's next response

### Input

```javascript
{
  // Senior context
  senior: {
    name: "Margaret",
    interests: ["gardening", "grandchildren", "cooking"],
    family: ["daughter Sarah", "grandson Tommy"],
  },

  // Call state (tracked by v1-advanced.js)
  callState: {
    minutesElapsed: 4.5,
    maxDuration: 10,
    callType: "check-in",  // or "reminder", "scheduled"
    pendingReminders: [
      { id: "rem1", title: "Afternoon medication", description: "Take blood pressure pill" }
    ],
    remindersDelivered: []
  },

  // Conversation history
  conversationHistory: [
    { role: "assistant", content: "Hello Margaret! How are you feeling today?" },
    { role: "user", content: "Oh, I'm doing alright. A bit tired." },
    // ...
  ],

  // Pre-fetched memories (from memory service)
  memories: [
    { content: "Margaret's daughter Sarah visits every Sunday", importance: 0.9 },
    { content: "She loves her rose garden", importance: 0.8 }
  ]
}
```

### Output Schema

```javascript
{
  // Conversation State Analysis
  "analysis": {
    "call_phase": "opening|rapport|main|closing",
    "engagement_level": "high|medium|low",
    "current_topic": "what they're discussing now",
    "topics_covered": ["greeting", "health", "family"],
    "topics_pending": ["reminder", "interests"],
    "emotional_tone": "positive|neutral|concerned|sad",
    "turns_on_current_topic": 3
  },

  // Proactive Direction
  "direction": {
    "stay_or_shift": "stay|transition|wrap_up",
    "next_topic": "suggested next topic or null",
    "transition_phrase": "natural phrase to shift topics",
    "follow_up_opportunity": "something they said worth exploring",
    "pacing_note": "good|too_fast|dragging|time_to_close"
  },

  // Reminder Management
  "reminder": {
    "should_deliver": true|false,
    "which_reminder": "reminder title or null",
    "delivery_approach": "how to weave it in naturally",
    "wait_reason": "why we're waiting, if not delivering"
  },

  // Specific Guidance for Claude
  "guidance": {
    "tone": "warm|empathetic|cheerful|gentle|serious",
    "response_length": "brief|moderate|extended",
    "priority_action": "main thing Donna should do",
    "specific_instruction": "concrete guidance for this response",
    "things_to_avoid": "what NOT to do right now"
  },

  // Model Selection
  "model_recommendation": {
    "use_sonnet": true|false,
    "max_tokens": 100-400,
    "reason": "why this model/length"
  }
}
```

### System Prompt for Gemini 3 Flash

```
You are a Conversation Director for Donna, an AI companion that calls elderly individuals.

Your job is to GUIDE the conversation proactively - not just react to what was said, but steer where it should go next. You are like a director behind the scenes, giving the actor (Donna) stage directions.

## CALL CONTEXT

Senior: {{SENIOR_NAME}}
Call duration: {{MINUTES_ELAPSED}} minutes (max {{MAX_DURATION}} minutes)
Call type: {{CALL_TYPE}}
Pending reminders: {{PENDING_REMINDERS}}
Senior's interests: {{INTERESTS}}
Senior's family: {{FAMILY_MEMBERS}}
Important memories: {{MEMORIES}}

## CONVERSATION SO FAR

{{CONVERSATION_HISTORY}}

## DIRECTION PRINCIPLES

### Call Phases

1. **Opening (0-2 min)**:
   - Warm greeting, ask how they're feeling
   - Don't rush - let them settle into the conversation
   - Listen for emotional cues in their initial response

2. **Rapport (2-4 min)**:
   - Explore what they shared in opening
   - Connect to their interests or family
   - Build warmth before any "business"

3. **Main (4-8 min)**:
   - Cover important topics (health check, reminders)
   - Follow their lead while guiding toward goals
   - Natural conversation flow with purpose

4. **Closing (8-10 min)**:
   - Wrap up warmly, don't abruptly end
   - Confirm any action items (medication, appointments)
   - Express looking forward to next call

### Topic Transitions

Never be abrupt. Use natural transition phrases:
- "Speaking of..."
- "That reminds me..."
- "You know what I was thinking about?"
- "By the way..."
- "Oh, that's lovely! And how about..."

### Reminder Delivery

**DO:**
- Connect to what they care about ("stay healthy for the grandkids")
- Find natural pauses in positive conversation
- Make it feel like caring, not nagging
- Weave into context ("Speaking of your garden, don't forget your medication so you have energy for it!")

**DON'T:**
- Deliver during emotional moments (grief, sadness, worry)
- Interrupt engaging conversation
- Deliver when engagement is low (re-engage first)
- Sound clinical or robotic

### Re-engagement Strategies

If they're giving short answers (low engagement):
- Ask about something personal to them by name
- Reference a specific memory ("Last time you mentioned...")
- Ask open-ended questions, not yes/no
- Share something interesting, then ask their opinion
- Don't keep pushing the same topic

### Emotional Moments

When they share something emotional (grief, loneliness, worry):
- **STAY on the topic** - don't rush past
- Validate feelings before offering solutions
- Ask them to share more if they want
- Match your tone to theirs
- **NEVER deliver reminders during grief/sadness**
- Recommend Sonnet for these moments

### Model Recommendations

**Use Sonnet (use_sonnet: true) when:**
- Emotional support needed (loneliness, sadness, grief)
- Health concerns mentioned (pain, falls, symptoms)
- Re-engagement needed (multiple short responses)
- Complex family discussions
- Delivering sensitive reminders
- Storytelling or extended content

**Use Haiku (use_sonnet: false) when:**
- Normal chitchat flowing well
- Simple questions and answers
- Positive, light conversation
- Routine check-ins going smoothly

**Token recommendations:**
- brief (100): Simple acknowledgments, quick answers
- moderate (150): Normal conversation, standard responses
- extended (200-250): Emotional support, re-engagement, stories
- long (300-400): Deep emotional moments, detailed stories

## OUTPUT FORMAT

Respond with ONLY valid JSON matching this exact schema:

{
  "analysis": {
    "call_phase": "opening|rapport|main|closing",
    "engagement_level": "high|medium|low",
    "current_topic": "string",
    "topics_covered": ["string"],
    "topics_pending": ["string"],
    "emotional_tone": "positive|neutral|concerned|sad",
    "turns_on_current_topic": number
  },
  "direction": {
    "stay_or_shift": "stay|transition|wrap_up",
    "next_topic": "string or null",
    "transition_phrase": "string or null",
    "follow_up_opportunity": "string or null",
    "pacing_note": "good|too_fast|dragging|time_to_close"
  },
  "reminder": {
    "should_deliver": boolean,
    "which_reminder": "string or null",
    "delivery_approach": "string or null",
    "wait_reason": "string or null"
  },
  "guidance": {
    "tone": "warm|empathetic|cheerful|gentle|serious",
    "response_length": "brief|moderate|extended",
    "priority_action": "string",
    "specific_instruction": "string",
    "things_to_avoid": "string or null"
  },
  "model_recommendation": {
    "use_sonnet": boolean,
    "max_tokens": number,
    "reason": "string"
  }
}

## EXAMPLES

### Example 1: Opening - "I suppose" Response

**Context:** Greeting just happened, senior said "I'm doing alright I suppose"

```json
{
  "analysis": {
    "call_phase": "opening",
    "engagement_level": "medium",
    "current_topic": "greeting",
    "topics_covered": ["greeting"],
    "topics_pending": ["health_check", "family", "reminder"],
    "emotional_tone": "neutral",
    "turns_on_current_topic": 1
  },
  "direction": {
    "stay_or_shift": "stay",
    "next_topic": null,
    "transition_phrase": null,
    "follow_up_opportunity": "'I suppose' suggests something's weighing on them",
    "pacing_note": "good"
  },
  "reminder": {
    "should_deliver": false,
    "which_reminder": null,
    "delivery_approach": null,
    "wait_reason": "Too early - need to build rapport first"
  },
  "guidance": {
    "tone": "warm",
    "response_length": "moderate",
    "priority_action": "Gently explore their mood",
    "specific_instruction": "Pick up on 'I suppose' - ask 'Just alright? What's been on your mind?' in a caring way",
    "things_to_avoid": "Don't ignore the 'I suppose' and change subject"
  },
  "model_recommendation": {
    "use_sonnet": false,
    "max_tokens": 150,
    "reason": "opening_exploration"
  }
}
```

### Example 2: Good Flow - Time for Reminder

**Context:** 5 minutes in, discussing grandchildren happily, medication reminder pending

```json
{
  "analysis": {
    "call_phase": "main",
    "engagement_level": "high",
    "current_topic": "grandchildren",
    "topics_covered": ["greeting", "health", "grandchildren"],
    "topics_pending": ["medication_reminder"],
    "emotional_tone": "positive",
    "turns_on_current_topic": 4
  },
  "direction": {
    "stay_or_shift": "transition",
    "next_topic": "medication reminder",
    "transition_phrase": "Speaking of keeping up with those energetic grandkids...",
    "follow_up_opportunity": null,
    "pacing_note": "good"
  },
  "reminder": {
    "should_deliver": true,
    "which_reminder": "Afternoon medication",
    "delivery_approach": "Connect to grandchildren - staying healthy to watch them grow up and play with them",
    "wait_reason": null
  },
  "guidance": {
    "tone": "cheerful",
    "response_length": "moderate",
    "priority_action": "Deliver medication reminder naturally",
    "specific_instruction": "Transition from grandkids to health smoothly. Frame the medication as helping her stay energetic for Tommy's visits.",
    "things_to_avoid": "Don't be clinical or nagging about the medication"
  },
  "model_recommendation": {
    "use_sonnet": false,
    "max_tokens": 150,
    "reason": "positive_flow_reminder"
  }
}
```

### Example 3: Low Engagement - Need Re-engagement

**Context:** Senior giving short answers for 3 turns, talking about weather

```json
{
  "analysis": {
    "call_phase": "main",
    "engagement_level": "low",
    "current_topic": "weather",
    "topics_covered": ["greeting", "weather"],
    "topics_pending": ["reminder", "family", "interests"],
    "emotional_tone": "neutral",
    "turns_on_current_topic": 3
  },
  "direction": {
    "stay_or_shift": "transition",
    "next_topic": "her garden or grandchildren",
    "transition_phrase": "You know what this weather made me think of? Your beautiful rose garden...",
    "follow_up_opportunity": null,
    "pacing_note": "dragging"
  },
  "reminder": {
    "should_deliver": false,
    "which_reminder": null,
    "delivery_approach": null,
    "wait_reason": "Engagement too low - need to reconnect first"
  },
  "guidance": {
    "tone": "warm",
    "response_length": "moderate",
    "priority_action": "Re-engage with something personal",
    "specific_instruction": "Pivot to her garden or grandchildren using her name. Ask an open-ended question that invites storytelling.",
    "things_to_avoid": "Don't keep asking about weather. Don't ask yes/no questions."
  },
  "model_recommendation": {
    "use_sonnet": true,
    "max_tokens": 200,
    "reason": "re_engagement_creativity"
  }
}
```

### Example 4: Emotional Moment - Grief

**Context:** Senior just mentioned missing their late spouse

```json
{
  "analysis": {
    "call_phase": "main",
    "engagement_level": "high",
    "current_topic": "late spouse",
    "topics_covered": ["greeting", "family"],
    "topics_pending": ["reminder"],
    "emotional_tone": "sad",
    "turns_on_current_topic": 1
  },
  "direction": {
    "stay_or_shift": "stay",
    "next_topic": null,
    "transition_phrase": null,
    "follow_up_opportunity": "They opened up about loss - honor this moment",
    "pacing_note": "good"
  },
  "reminder": {
    "should_deliver": false,
    "which_reminder": null,
    "delivery_approach": null,
    "wait_reason": "NEVER deliver reminders during grief - completely wrong moment"
  },
  "guidance": {
    "tone": "empathetic",
    "response_length": "extended",
    "priority_action": "Honor their grief with presence and warmth",
    "specific_instruction": "Acknowledge their loss with genuine warmth. Say something like 'I can hear how much you miss him. Would you like to tell me about him?' Let them lead.",
    "things_to_avoid": "Do NOT change subject. Do NOT try to 'fix' their sadness. Do NOT minimize. Do NOT rush."
  },
  "model_recommendation": {
    "use_sonnet": true,
    "max_tokens": 250,
    "reason": "emotional_support_grief"
  }
}
```

### Example 5: Time to Wrap Up

**Context:** 9 minutes in, goals achieved, natural pause

```json
{
  "analysis": {
    "call_phase": "closing",
    "engagement_level": "medium",
    "current_topic": "casual chat",
    "topics_covered": ["greeting", "health", "family", "reminder_delivered"],
    "topics_pending": [],
    "emotional_tone": "positive",
    "turns_on_current_topic": 2
  },
  "direction": {
    "stay_or_shift": "wrap_up",
    "next_topic": "closing",
    "transition_phrase": "Well Margaret, it's been so lovely talking with you today...",
    "follow_up_opportunity": null,
    "pacing_note": "time_to_close"
  },
  "reminder": {
    "should_deliver": false,
    "which_reminder": null,
    "delivery_approach": null,
    "wait_reason": "Already delivered"
  },
  "guidance": {
    "tone": "warm",
    "response_length": "moderate",
    "priority_action": "Begin natural wrap-up",
    "specific_instruction": "Express how much you enjoyed talking. Mention looking forward to the next call. End on a warm, caring note.",
    "things_to_avoid": "Don't abruptly hang up. Don't introduce new topics."
  },
  "model_recommendation": {
    "use_sonnet": false,
    "max_tokens": 150,
    "reason": "natural_closing"
  }
}
```

Now analyze the current conversation and provide direction:
```

---

## Post-Call Analysis (Async)

### Purpose

After each call ends, run a single analysis on the complete transcript to generate:
- Call summary for records
- Caregiver alerts (health, cognitive, safety concerns)
- Engagement metrics
- Follow-up suggestions for next call

### Why Post-Call Instead of Real-Time?

| Real-Time L3 | Post-Call Batch |
|--------------|-----------------|
| Runs every turn (~10x per call) | Runs once per call |
| ~$0.002 per call | ~$0.0005 per call |
| Partial context each time | Full conversation context |
| Complex orchestration | Simple batch job |
| Adds latency risk | Zero latency impact |

### Implementation

**File:** `services/call-analysis.js` (new file)

```javascript
/**
 * Post-Call Analysis
 *
 * Runs after call ends to generate summary, alerts, and analytics.
 * Uses Gemini Flash for cost efficiency.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const ANALYSIS_PROMPT = `You are analyzing a completed phone call between Donna (an AI companion) and an elderly individual.

## SENIOR CONTEXT
Name: {{SENIOR_NAME}}
Known conditions: {{HEALTH_CONDITIONS}}
Family: {{FAMILY_MEMBERS}}

## FULL CALL TRANSCRIPT
{{TRANSCRIPT}}

## ANALYSIS REQUIRED

Analyze the complete call and provide:

1. **Summary** (2-3 sentences): What happened in this call?

2. **Topics Discussed**: List main topics covered

3. **Reminders**: Were any reminders delivered? Which ones?

4. **Engagement Score** (1-10): How engaged was the senior?

5. **Concerns for Caregiver**: Flag any issues the family should know about
   - Health concerns (pain, symptoms, medication issues, falls)
   - Cognitive concerns (confusion, memory issues, disorientation)
   - Emotional concerns (persistent sadness, loneliness, anxiety)
   - Safety concerns (mentions of strangers, scams, being alone)

   For each concern, provide:
   - Type: health|cognitive|emotional|safety
   - Severity: low|medium|high
   - Description: What was observed
   - Evidence: Quote or specific observation
   - Action: What caregiver should do

6. **Positive Observations**: Good things noticed (high engagement, positive mood, etc.)

7. **Follow-up Suggestions**: Things to bring up in the next call

## OUTPUT FORMAT

Respond with ONLY valid JSON:

{
  "summary": "string",
  "topics_discussed": ["string"],
  "reminders_delivered": ["string"],
  "engagement_score": number,
  "concerns": [
    {
      "type": "health|cognitive|emotional|safety",
      "severity": "low|medium|high",
      "description": "string",
      "evidence": "string",
      "recommended_action": "string"
    }
  ],
  "positive_observations": ["string"],
  "follow_up_suggestions": ["string"],
  "call_quality": {
    "rapport": "strong|moderate|weak",
    "goals_achieved": boolean,
    "duration_appropriate": boolean
  }
}
`;

export async function analyzeCompletedCall(transcript, seniorContext) {
  const prompt = ANALYSIS_PROMPT
    .replace('{{SENIOR_NAME}}', seniorContext.name)
    .replace('{{HEALTH_CONDITIONS}}', seniorContext.conditions?.join(', ') || 'None known')
    .replace('{{FAMILY_MEMBERS}}', seniorContext.family?.join(', ') || 'Unknown')
    .replace('{{TRANSCRIPT}}', formatTranscript(transcript));

  try {
    const result = await gemini.generateContent(prompt);
    const text = result.response.text();

    let jsonText = text;
    if (text.includes('```')) {
      jsonText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[CallAnalysis] Error:', error.message);
    return getDefaultAnalysis();
  }
}

function formatTranscript(history) {
  return history
    .map(m => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`)
    .join('\n\n');
}

function getDefaultAnalysis() {
  return {
    summary: 'Analysis unavailable',
    topics_discussed: [],
    reminders_delivered: [],
    engagement_score: 5,
    concerns: [],
    positive_observations: [],
    follow_up_suggestions: [],
    call_quality: {
      rapport: 'moderate',
      goals_achieved: false,
      duration_appropriate: true
    }
  };
}
```

### Trigger Post-Call Analysis

**File:** `pipelines/v1-advanced.js`

Add to the call cleanup/end handler:

```javascript
// When call ends
async onCallEnd() {
  // ... existing cleanup ...

  // Run post-call analysis async (don't block)
  this.runPostCallAnalysis().catch(err => {
    console.error('[V1] Post-call analysis failed:', err.message);
  });
}

async runPostCallAnalysis() {
  const { analyzeCompletedCall } = await import('../services/call-analysis.js');

  const analysis = await analyzeCompletedCall(
    this.conversationHistory,
    this.senior
  );

  // Save to database
  await this.saveCallAnalysis(analysis);

  // If high-severity concerns, notify caregiver
  const highSeverity = analysis.concerns.filter(c => c.severity === 'high');
  if (highSeverity.length > 0) {
    await this.notifyCaregiver(highSeverity);
  }

  console.log(`[V1] Call analysis complete. Engagement: ${analysis.engagement_score}/10`);
}

async saveCallAnalysis(analysis) {
  // Save to conversations table or separate call_analyses table
  await db.insert(callAnalyses).values({
    conversation_id: this.conversationId,
    senior_id: this.senior?.id,
    summary: analysis.summary,
    topics: analysis.topics_discussed,
    engagement_score: analysis.engagement_score,
    concerns: analysis.concerns,
    positive_observations: analysis.positive_observations,
    follow_up_suggestions: analysis.follow_up_suggestions,
    created_at: new Date()
  });
}
```

---

## Implementation Guide

### Step 1: Install Dependencies

```bash
npm install @google/generative-ai
```

### Step 2: Environment Variables

```bash
# .env
GOOGLE_API_KEY=your_gemini_api_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Step 3: Update fast-observer.js

Replace the current implementation with the Conversation Director:

```javascript
/**
 * Conversation Director - Layer 2
 *
 * Proactively guides conversation flow using Gemini 3 Flash.
 * Runs in parallel with Claude, results used for NEXT turn.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
// Use 'gemini-3-flash' when available

const DIRECTOR_PROMPT = `[INSERT FULL PROMPT FROM ABOVE]`;

export async function getConversationDirection(
  userMessage,
  conversationHistory,
  seniorContext,
  callState,
  memories = []
) {
  const prompt = DIRECTOR_PROMPT
    .replace('{{SENIOR_NAME}}', seniorContext?.name || 'Friend')
    .replace('{{MINUTES_ELAPSED}}', (callState?.minutesElapsed || 0).toFixed(1))
    .replace('{{MAX_DURATION}}', callState?.maxDuration || 10)
    .replace('{{CALL_TYPE}}', callState?.callType || 'check-in')
    .replace('{{PENDING_REMINDERS}}', formatReminders(callState?.pendingReminders))
    .replace('{{INTERESTS}}', seniorContext?.interests?.join(', ') || 'unknown')
    .replace('{{FAMILY_MEMBERS}}', formatFamily(seniorContext?.family))
    .replace('{{MEMORIES}}', formatMemories(memories))
    .replace('{{CONVERSATION_HISTORY}}', formatHistory(conversationHistory));

  try {
    const result = await gemini.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON, handling potential markdown code blocks
    let jsonText = text;
    if (text.includes('```')) {
      jsonText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[ConversationDirector] Error:', error.message);
    return getDefaultDirection();
  }
}

function getDefaultDirection() {
  return {
    analysis: {
      call_phase: 'main',
      engagement_level: 'medium',
      current_topic: 'unknown',
      topics_covered: [],
      topics_pending: [],
      emotional_tone: 'neutral',
      turns_on_current_topic: 1
    },
    direction: {
      stay_or_shift: 'stay',
      next_topic: null,
      transition_phrase: null,
      follow_up_opportunity: null,
      pacing_note: 'good'
    },
    reminder: {
      should_deliver: false,
      which_reminder: null,
      delivery_approach: null,
      wait_reason: 'Using default - no analysis available'
    },
    guidance: {
      tone: 'warm',
      response_length: 'moderate',
      priority_action: 'Continue conversation naturally',
      specific_instruction: 'Be warm and attentive',
      things_to_avoid: null
    },
    model_recommendation: {
      use_sonnet: false,
      max_tokens: 150,
      reason: 'default'
    }
  };
}

function formatReminders(reminders) {
  if (!reminders?.length) return 'None';
  return reminders.map(r => `- ${r.title}: ${r.description || 'No details'}`).join('\n');
}

function formatFamily(family) {
  if (!family?.length) return 'Unknown';
  return family.join(', ');
}

function formatMemories(memories) {
  if (!memories?.length) return 'None available';
  return memories.slice(0, 5).map(m => `- ${m.content}`).join('\n');
}

function formatHistory(history) {
  if (!history?.length) return 'Call just started';
  return history
    .slice(-10) // Last 10 turns for context
    .map(m => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`)
    .join('\n');
}

/**
 * Format director output for injection into Claude's system prompt
 */
export function formatDirectorGuidance(direction) {
  if (!direction) return null;

  const lines = [];

  // Call phase and state
  lines.push(`[CALL: ${direction.analysis.call_phase} phase, ${direction.analysis.turns_on_current_topic} turns on "${direction.analysis.current_topic}"]`);

  // Engagement alert
  if (direction.analysis.engagement_level === 'low') {
    lines.push(`[ALERT: Low engagement - need to re-engage]`);
  }

  // Emotional tone
  if (direction.analysis.emotional_tone === 'sad' || direction.analysis.emotional_tone === 'concerned') {
    lines.push(`[EMOTIONAL: Senior seems ${direction.analysis.emotional_tone} - be extra gentle]`);
  }

  // Direction
  if (direction.direction.stay_or_shift === 'transition') {
    lines.push(`[SHIFT TO: ${direction.direction.next_topic}]`);
    if (direction.direction.transition_phrase) {
      lines.push(`[TRY: "${direction.direction.transition_phrase}"]`);
    }
  } else if (direction.direction.stay_or_shift === 'wrap_up') {
    lines.push(`[DIRECTION: Begin wrapping up naturally]`);
  } else if (direction.direction.follow_up_opportunity) {
    lines.push(`[EXPLORE: ${direction.direction.follow_up_opportunity}]`);
  }

  // Reminder
  if (direction.reminder.should_deliver) {
    lines.push(`[DELIVER REMINDER: ${direction.reminder.which_reminder}]`);
    lines.push(`[APPROACH: ${direction.reminder.delivery_approach}]`);
  }

  // Guidance
  lines.push(`[TONE: ${direction.guidance.tone}]`);
  lines.push(`[DO: ${direction.guidance.specific_instruction}]`);

  if (direction.guidance.things_to_avoid) {
    lines.push(`[AVOID: ${direction.guidance.things_to_avoid}]`);
  }

  return lines.join('\n');
}

// Export for backwards compatibility
export async function fastAnalyzeWithTools(userMessage, conversationHistory, seniorId) {
  // Wrapper that calls new function with minimal context
  return getConversationDirection(userMessage, conversationHistory, {}, {});
}
```

### Step 4: Update v1-advanced.js

Add call state tracking and integrate the Conversation Director:

```javascript
// Add to imports
import { getConversationDirection, formatDirectorGuidance } from './fast-observer.js';
import { analyzeCompletedCall } from '../services/call-analysis.js';

// Add to constructor
this.callState = {
  startTime: Date.now(),
  minutesElapsed: 0,
  callType: 'check-in',
  pendingReminders: this.pendingReminders || [],
  remindersDelivered: []
};

// Add method to update call state
updateCallState() {
  this.callState.minutesElapsed = (Date.now() - this.callState.startTime) / 60000;
}

// In processUtterance, before calling Claude:

// 1. Update call state
this.updateCallState();

// 2. Get director guidance (runs in parallel with other setup)
const directorPromise = getConversationDirection(
  userMessage,
  this.conversationHistory,
  this.senior,
  this.callState,
  this.prefetchedMemories || []
);

// 3. Wait for director result
const directorResult = await directorPromise;
const directorGuidance = formatDirectorGuidance(directorResult);

// 4. Select model based on director recommendation
const modelConfig = {
  model: directorResult.model_recommendation.use_sonnet
    ? 'claude-sonnet-4-20250514'
    : 'claude-3-haiku-20240307',
  max_tokens: directorResult.model_recommendation.max_tokens || 150
};

console.log(`[V1] Director: ${directorResult.guidance.priority_action} | Model: ${modelConfig.model} | Tokens: ${modelConfig.max_tokens}`);

// 5. Inject guidance into system prompt (update buildSystemPrompt call)
const systemPrompt = buildSystemPrompt(
  this.senior,
  this.memoryContext,
  this.reminderPrompt,
  null, // observerSignal - no longer used
  dynamicMemoryContext,
  quickGuidance,
  directorGuidance  // NEW - from Conversation Director
);

// 6. Call Claude with selected model
const stream = await anthropic.messages.stream({
  model: modelConfig.model,
  max_tokens: modelConfig.max_tokens,
  system: systemPrompt,
  messages: claudeMessages,
});

// 7. Track reminder delivery (if director said to deliver)
if (directorResult.reminder.should_deliver) {
  this.callState.remindersDelivered.push(directorResult.reminder.which_reminder);
}
```

### Step 5: Create call-analysis.js

Create `services/call-analysis.js` with the post-call analysis code from above.

### Step 6: Add Call End Handler

Add post-call analysis trigger to the call end handler in `v1-advanced.js`.

---

## Testing Checklist

### Conversation Director (L2)
- [ ] Outputs comprehensive direction JSON
- [ ] Opening phase guides toward health check
- [ ] Transition phrases are natural
- [ ] Reminders delivered at good moments
- [ ] Reminders NOT delivered during emotional moments
- [ ] Low engagement triggers re-engagement strategies
- [ ] Emotional moments recommend Sonnet
- [ ] Grief/loss gets extended, empathetic responses
- [ ] Wrap-up happens naturally at end of call
- [ ] Model selection works (Haiku/Sonnet switching)
- [ ] Token limits adjust based on context

### Post-Call Analysis
- [ ] Generates summary after call ends
- [ ] Detects health concerns from transcript
- [ ] Detects cognitive concerns
- [ ] Assigns correct severity levels
- [ ] Saves analysis to database
- [ ] High-severity concerns trigger notifications

---

## Cost Summary

| Component | Model | Per Call |
|-----------|-------|----------|
| L1 Quick | Regex | $0 |
| L2 Director | Gemini 3 Flash | ~$0.0002 |
| Voice (80%) | Claude Haiku | ~$0.001 |
| Voice (20%) | Claude Sonnet | ~$0.003 |
| Post-Call | Gemini Flash | ~$0.0005 |
| **Total** | | **~$0.002-0.004** |

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `pipelines/quick-observer.js` | Keep | L1 regex patterns (no changes) |
| `pipelines/fast-observer.js` | **Rewrite** | Conversation Director with Gemini Flash |
| `pipelines/observer-agent.js` | **Remove/Deprecate** | No longer needed real-time |
| `pipelines/v1-advanced.js` | **Update** | Add call state, integrate director, model selection |
| `services/call-analysis.js` | **Create** | Post-call analysis with Gemini Flash |

---

*Last updated: January 2026*
