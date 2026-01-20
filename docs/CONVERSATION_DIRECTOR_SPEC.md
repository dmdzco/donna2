# Conversation Director Specification

## Overview

This document specifies the enhanced observer architecture for Donna's V1 pipeline. The key change is transforming Layer 2 from a reactive sentiment analyzer into a **proactive Conversation Director** that guides the flow of each call.

---

## Architecture Summary

| Layer | Name | Model | Speed | Role |
|-------|------|-------|-------|------|
| L1 | Quick Observer | Regex (no AI) | 0ms | Instant pattern detection |
| L2 | **Conversation Director** | Gemini 3 Flash | ~100-150ms | Proactive flow guidance |
| L3 | Deep Observer | Gemini 3 Pro | ~300ms | Caregiver alerts, complex analysis |
| Voice | Main Conversation | Claude Haiku/Sonnet | ~250-400ms | Talks to senior |

### Why These Models?

| Model | Role | Why |
|-------|------|-----|
| **Gemini 3 Flash (L2)** | Conversation Director | Fastest, cheapest, good enough for flow guidance |
| **Gemini 3 Pro (L3)** | Deep Observer | Strong reasoning for concern detection, 3x cheaper than Sonnet |
| **Claude Haiku (Voice)** | Default conversation | Warm, empathetic, fast |
| **Claude Sonnet (Voice)** | Upgraded conversation | Best empathy for emotional/health moments |

---

## Layer 2: Conversation Director

### Purpose

The Conversation Director proactively guides each call by:

1. **Tracking state** - What topics covered, what's pending, call phase
2. **Steering flow** - When to transition topics, what to discuss next
3. **Managing reminders** - Finding natural moments to deliver reminders
4. **Monitoring pacing** - Detecting if conversation is dragging or rushed
5. **Recommending model** - When to upgrade from Haiku to Sonnet
6. **Providing guidance** - Specific instructions for Claude's next response

### Input

```javascript
{
  // Senior context
  senior: {
    name: "Margaret",
    interests: ["gardening", "grandchildren", "cooking"],
    family: ["daughter Sarah", "grandson Tommy"],
  },

  // Call state
  callState: {
    minutesElapsed: 4.5,
    maxDuration: 10,
    callType: "check-in",  // or "reminder", "scheduled"
    pendingReminders: [
      { id: "rem1", title: "Afternoon medication", description: "Take blood pressure pill" }
    ],
    topicsCovered: ["greeting", "health"],
    remindersDelivered: []
  },

  // Conversation
  conversationHistory: [
    { role: "assistant", content: "Hello Margaret! How are you feeling today?" },
    { role: "user", content: "Oh, I'm doing alright. A bit tired." },
    // ...
  ],

  // Pre-fetched memories
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

## Layer 3: Deep Observer (Gemini 3 Pro)

### Purpose

The Deep Observer runs async after each response and focuses on:

1. **Concern detection** - Health issues, cognitive changes, safety risks
2. **Pattern analysis** - Multi-turn emotional patterns, engagement trends
3. **Caregiver alerts** - Flagging issues for family members
4. **Call summary** - End-of-call summary for records

### Output Schema

```javascript
{
  "engagement_level": "high|medium|low",
  "emotional_state": "detailed description of emotional patterns",
  "concerns": [
    {
      "type": "health|cognitive|safety|emotional|social",
      "severity": "low|medium|high",
      "description": "what was observed",
      "evidence": "quotes or specific observations",
      "recommended_action": "what caregiver should know/do"
    }
  ],
  "positive_observations": [
    "good things noticed during call"
  ],
  "topics_discussed": ["list of topics"],
  "reminders_delivered": ["which reminders were given"],
  "call_quality": {
    "engagement_score": 1-10,
    "rapport_quality": "strong|moderate|weak",
    "goals_achieved": true|false
  },
  "follow_up_suggestions": [
    "things to bring up next call"
  ]
}
```

### System Prompt for Gemini 3 Pro

```
You are a Deep Observer analyzing a phone conversation between Donna (an AI companion) and an elderly individual.

Your job is to identify concerns for caregivers, detect patterns, and provide a comprehensive analysis of the call.

## SENIOR CONTEXT

Name: {{SENIOR_NAME}}
Known conditions: {{HEALTH_CONDITIONS}}
Family contacts: {{FAMILY_MEMBERS}}
Previous concerns: {{PREVIOUS_CONCERNS}}

## FULL CONVERSATION

{{CONVERSATION_TRANSCRIPT}}

## ANALYSIS FOCUS

### Concern Categories

**Health Concerns:**
- Mentions of pain, discomfort, symptoms
- Medication confusion or non-compliance
- Falls or mobility issues
- Sleep problems
- Appetite changes
- New symptoms

**Cognitive Concerns:**
- Confusion about time, place, people
- Repeating questions
- Difficulty following conversation
- Memory gaps
- Disorientation

**Safety Concerns:**
- Mentions of strangers, scams
- Being alone for extended periods
- Home safety issues (stairs, locks)
- Financial concerns or exploitation

**Emotional Concerns:**
- Persistent loneliness
- Depression indicators
- Anxiety about specific things
- Grief that seems unprocessed
- Isolation from family

**Social Concerns:**
- Lack of contact with family
- Loss of interests
- Withdrawal from activities
- Conflict with caregivers

### Severity Levels

**High:** Immediate caregiver notification recommended
- Falls, chest pain, severe confusion
- Mentions of self-harm or giving up
- Signs of exploitation or abuse
- Medical emergency indicators

**Medium:** Caregiver should know within 24 hours
- Medication non-compliance
- Moderate cognitive changes
- Persistent low mood
- Isolation patterns

**Low:** Note for next check-in
- Minor complaints
- Slight mood changes
- Small concerns worth monitoring

## OUTPUT FORMAT

Respond with ONLY valid JSON:

{
  "engagement_level": "high|medium|low",
  "emotional_state": "string - detailed description",
  "concerns": [
    {
      "type": "health|cognitive|safety|emotional|social",
      "severity": "low|medium|high",
      "description": "string",
      "evidence": "string - quotes or observations",
      "recommended_action": "string"
    }
  ],
  "positive_observations": ["string"],
  "topics_discussed": ["string"],
  "reminders_delivered": ["string"],
  "call_quality": {
    "engagement_score": number 1-10,
    "rapport_quality": "strong|moderate|weak",
    "goals_achieved": boolean
  },
  "follow_up_suggestions": ["string"]
}

Analyze the conversation:
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

```javascript
/**
 * Conversation Director - Layer 2
 *
 * Proactively guides conversation flow using Gemini 3 Flash.
 * Runs in parallel with Claude, results used for NEXT turn.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // or gemini-3-flash when available

const DIRECTOR_PROMPT = `... [full prompt from above] ...`;

export async function getConversationDirection(
  userMessage,
  conversationHistory,
  seniorContext,
  callState,
  memories = []
) {
  const prompt = DIRECTOR_PROMPT
    .replace('{{SENIOR_NAME}}', seniorContext.name)
    .replace('{{MINUTES_ELAPSED}}', callState.minutesElapsed.toFixed(1))
    .replace('{{MAX_DURATION}}', callState.maxDuration || 10)
    .replace('{{CALL_TYPE}}', callState.callType || 'check-in')
    .replace('{{PENDING_REMINDERS}}', formatReminders(callState.pendingReminders))
    .replace('{{INTERESTS}}', seniorContext.interests?.join(', ') || 'unknown')
    .replace('{{FAMILY_MEMBERS}}', formatFamily(seniorContext.family))
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
  return memories.map(m => `- ${m.content}`).join('\n');
}

function formatHistory(history) {
  return history
    .map(m => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`)
    .join('\n');
}

// Keep backward compatibility
export async function fastAnalyzeWithTools(userMessage, conversationHistory, seniorId) {
  // This can call getConversationDirection internally
  // or be deprecated in favor of the new function
}

export function formatDirectorGuidance(direction) {
  const lines = [];

  // Call phase and state
  lines.push(`[CALL: ${direction.analysis.call_phase} phase, ${direction.analysis.turns_on_current_topic} turns on "${direction.analysis.current_topic}"]`);

  // Engagement alert
  if (direction.analysis.engagement_level === 'low') {
    lines.push(`[ALERT: Low engagement - need to re-engage]`);
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
```

### Step 4: Update observer-agent.js (L3)

```javascript
/**
 * Deep Observer - Layer 3
 *
 * Comprehensive conversation analysis using Gemini 3 Pro.
 * Runs async after response, focuses on caregiver alerts.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const geminiPro = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // or gemini-3-pro when available

const DEEP_OBSERVER_PROMPT = `... [full prompt from above] ...`;

export class DeepObserver {
  constructor(seniorContext) {
    this.seniorContext = seniorContext;
  }

  async analyze(conversationHistory) {
    const prompt = DEEP_OBSERVER_PROMPT
      .replace('{{SENIOR_NAME}}', this.seniorContext.name)
      .replace('{{HEALTH_CONDITIONS}}', this.seniorContext.conditions?.join(', ') || 'None known')
      .replace('{{FAMILY_MEMBERS}}', this.seniorContext.family?.join(', ') || 'Unknown')
      .replace('{{PREVIOUS_CONCERNS}}', this.seniorContext.previousConcerns || 'None')
      .replace('{{CONVERSATION_TRANSCRIPT}}', this.formatTranscript(conversationHistory));

    try {
      const result = await geminiPro.generateContent(prompt);
      const text = result.response.text();

      let jsonText = text;
      if (text.includes('```')) {
        jsonText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }

      return JSON.parse(jsonText);
    } catch (error) {
      console.error('[DeepObserver] Error:', error.message);
      return this.getDefaultAnalysis();
    }
  }

  formatTranscript(history) {
    return history
      .map(m => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`)
      .join('\n\n');
  }

  getDefaultAnalysis() {
    return {
      engagement_level: 'medium',
      emotional_state: 'Unable to analyze',
      concerns: [],
      positive_observations: [],
      topics_discussed: [],
      reminders_delivered: [],
      call_quality: {
        engagement_score: 5,
        rapport_quality: 'moderate',
        goals_achieved: false
      },
      follow_up_suggestions: []
    };
  }
}
```

### Step 5: Update v1-advanced.js

```javascript
// Add to constructor
this.callState = {
  startTime: Date.now(),
  minutesElapsed: 0,
  callType: 'check-in',
  pendingReminders: this.pendingReminders,
  topicsCovered: [],
  remindersDelivered: []
};

// Add method to update call state
updateCallState() {
  this.callState.minutesElapsed = (Date.now() - this.callState.startTime) / 60000;
}

// In processUtterance, before calling Claude:
this.updateCallState();

// Get director guidance (runs in parallel with other setup)
const directorPromise = getConversationDirection(
  userMessage,
  this.conversationHistory,
  this.senior,
  this.callState,
  this.prefetchedMemories
);

// Use director result
const directorResult = await directorPromise;
const directorGuidance = formatDirectorGuidance(directorResult);

// Select model based on director recommendation
const modelConfig = {
  model: directorResult.model_recommendation.use_sonnet
    ? 'claude-sonnet-4-20250514'
    : 'claude-3-haiku-20240307',
  max_tokens: directorResult.model_recommendation.max_tokens
};

// Inject guidance into system prompt
const systemPrompt = buildSystemPrompt(
  this.senior,
  this.memoryContext,
  this.reminderPrompt,
  this.lastObserverSignal,
  dynamicMemoryContext,
  quickGuidance,
  directorGuidance  // NEW - replaces old fastObserverGuidance
);

// Call Claude with selected model
const stream = await anthropic.messages.stream({
  model: modelConfig.model,
  max_tokens: modelConfig.max_tokens,
  system: systemPrompt,
  messages: claudeMessages,
});
```

---

## Testing Checklist

- [ ] L2 outputs comprehensive direction JSON
- [ ] Opening phase guides toward health check
- [ ] Transition phrases are natural
- [ ] Reminders delivered at good moments
- [ ] Reminders NOT delivered during emotional moments
- [ ] Low engagement triggers re-engagement strategies
- [ ] Emotional moments recommend Sonnet
- [ ] Grief/loss gets extended, empathetic responses
- [ ] Wrap-up happens naturally at end of call
- [ ] L3 detects health concerns
- [ ] L3 detects cognitive concerns
- [ ] L3 generates caregiver alerts
- [ ] Model selection works (Haiku/Sonnet switching)
- [ ] Token limits adjust based on context

---

## Cost Estimates

| Component | Model | Cost per 1M tokens | Per-call estimate |
|-----------|-------|-------------------|-------------------|
| L2 Director | Gemini 3 Flash | $0.10 / $0.40 | ~$0.0002 |
| L3 Deep | Gemini 3 Pro | $1.00 / $4.00 | ~$0.002 |
| Voice (default) | Claude Haiku | $1.00 / $5.00 | ~$0.001 |
| Voice (upgraded) | Claude Sonnet | $3.00 / $15.00 | ~$0.003 |

**Estimated total per call:** $0.003 - $0.006 depending on Sonnet usage

---

*Last updated: January 2026*
