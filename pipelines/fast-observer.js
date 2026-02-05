/**
 * Conversation Director - Layer 2
 *
 * Proactively guides conversation flow using Gemini 3 Flash.
 * Runs in parallel with Claude's response generation.
 * Results affect NEXT turn (or current if ready in time).
 *
 * The Director:
 * 1. Tracks state - Topics covered, goals pending, call phase
 * 2. Steers flow - When to transition topics, what to discuss next
 * 3. Manages reminders - Finding natural moments to deliver reminders
 * 4. Monitors pacing - Detecting if conversation is dragging or rushed
 * 5. Recommends model - When to upgrade from Haiku to Sonnet
 * 6. Provides guidance - Specific instructions for Claude's next response
 */

import { getAdapter } from '../adapters/llm/index.js';
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';

// Conversation Director model (Gemini 3 Flash for speed ~100-150ms)
const DIRECTOR_MODEL = process.env.FAST_OBSERVER_MODEL || 'gemini-3-flash';

/**
 * Repair common JSON issues from truncated/malformed LLM responses
 */
function repairJson(jsonText) {
  let repaired = jsonText;

  // Remove trailing commas in arrays and objects (common LLM issue)
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Try to close unclosed strings, arrays, and objects
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Check for unterminated string at end
  const lastQuote = repaired.lastIndexOf('"');
  const afterLastQuote = repaired.substring(lastQuote + 1);
  if (lastQuote > 0 && !afterLastQuote.match(/["\]},:]/)) {
    // Unterminated string - close it
    repaired = repaired.substring(0, lastQuote + 1) + '"';
  }

  // Close unclosed brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  // Close unclosed braces
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  // Remove any trailing commas again after repairs
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  return repaired;
}

/**
 * Full system prompt for the Conversation Director
 */
const DIRECTOR_SYSTEM_PROMPT = `You are a Conversation Director for Donna, an AI companion that calls elderly individuals.

Your job is to GUIDE the conversation proactively - not just react to what was said, but steer where it should go next. You are like a director behind the scenes, giving the actor (Donna) stage directions.

## CALL CONTEXT

Senior: {{SENIOR_NAME}}
Call duration: {{MINUTES_ELAPSED}} minutes (max {{MAX_DURATION}} minutes)
Call type: {{CALL_TYPE}}
Pending reminders (NOT yet delivered): {{PENDING_REMINDERS}}
Already delivered this call (do NOT repeat): {{DELIVERED_REMINDERS}}
Senior's interests: {{INTERESTS}}
Senior's family: {{FAMILY_MEMBERS}}
Important memories: {{MEMORIES}}
Previous calls today: {{TODAYS_PREVIOUS_CALLS}}

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

4. **Winding Down (7-9 min)**:
   - Conversation is naturally slowing - short responses, repeated topics
   - Summarize what you discussed ("It was so nice hearing about...")
   - Confirm any action items (medication taken? appointments noted?)
   - Transition: "Well, it's been so lovely talking with you..."

5. **Closing (9-10 min, or after goodbye detected)**:
   - Senior said goodbye or is clearly ready to end
   - Give a warm, brief sign-off referencing something from the call
   - Mention next call if known ("I'll call you again tomorrow!")
   - Keep it short - don't prolong after goodbyes
   - After mutual goodbyes, the call will end automatically

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
- NEVER recommend delivering a reminder that is in the "Already delivered" list
- If a delivered reminder comes up again, suggest acknowledging with "As I mentioned earlier..."
- If a reminder was already delivered in a PREVIOUS call today, suggest asking "Did you get a chance to [do it]?" instead of re-delivering

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
    "call_phase": "opening|rapport|main|winding_down|closing",
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

Now analyze the current conversation and provide direction:`;

/**
 * Get conversation direction from the Director
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Full conversation history
 * @param {object} seniorContext - Senior profile data
 * @param {object} callState - Current call state
 * @param {Array} memories - Pre-fetched memories
 * @returns {Promise<object>} Director output
 */
export async function getConversationDirection(
  userMessage,
  conversationHistory,
  seniorContext,
  callState,
  memories = []
) {
  const startTime = Date.now();

  // Filter out reminders that have already been delivered
  const deliveredSet = new Set(callState?.remindersDelivered || []);
  const remainingReminders = (callState?.pendingReminders || []).filter(
    r => !deliveredSet.has(r.title) && !deliveredSet.has(r.id)
  );

  // Build the prompt with context
  const prompt = DIRECTOR_SYSTEM_PROMPT
    .replace('{{SENIOR_NAME}}', seniorContext?.name?.split(' ')[0] || 'Friend')
    .replace('{{MINUTES_ELAPSED}}', (callState?.minutesElapsed || 0).toFixed(1))
    .replace('{{MAX_DURATION}}', callState?.maxDuration || 10)
    .replace('{{CALL_TYPE}}', callState?.callType || 'check-in')
    .replace('{{PENDING_REMINDERS}}', formatReminders(remainingReminders))
    .replace('{{DELIVERED_REMINDERS}}', deliveredSet.size > 0 ? [...deliveredSet].join(', ') : 'None')
    .replace('{{INTERESTS}}', seniorContext?.interests?.join(', ') || 'unknown')
    .replace('{{FAMILY_MEMBERS}}', formatFamily(seniorContext?.family))
    .replace('{{MEMORIES}}', formatMemories(memories))
    .replace('{{TODAYS_PREVIOUS_CALLS}}', callState?.todaysContext || 'None (first call today)')
    .replace('{{CONVERSATION_HISTORY}}', formatHistory(conversationHistory));

  try {
    const adapter = getAdapter(DIRECTOR_MODEL);
    const messages = [
      {
        role: 'user',
        content: `Current message from senior: "${userMessage}"`,
      },
    ];

    const text = await adapter.generate(prompt, messages, {
      maxTokens: 1200, // Increased to avoid JSON truncation
      temperature: 0.2,
    });

    // Parse JSON response (handle markdown, extra text)
    let jsonText = text.trim();
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    // Extract JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Repair common JSON issues from truncated/malformed responses
    jsonText = repairJson(jsonText);

    let direction;
    try {
      direction = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[ConversationDirector] JSON parse failed, raw:', text.substring(0, 300));
      throw parseError;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ConversationDirector] Analysis complete in ${elapsed}ms: phase=${direction.analysis?.call_phase}, engagement=${direction.analysis?.engagement_level}`);

    return direction;
  } catch (error) {
    console.error('[ConversationDirector] Error:', error.message);
    return getDefaultDirection();
  }
}

/**
 * Default direction when analysis fails
 */
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

/**
 * Format director output for injection into Claude's system prompt
 */
export function formatDirectorGuidance(direction) {
  if (!direction) return null;

  // Compact format: phase|engagement|tone + action
  const parts = [];

  // Core state (always include)
  const phase = direction.analysis?.call_phase || 'main';
  const engagement = direction.analysis?.engagement_level || 'medium';
  const tone = direction.guidance?.tone || 'warm';
  parts.push(`${phase}/${engagement}/${tone}`);

  // Priority action
  if (phase === 'closing') {
    parts.push('CLOSING: Say a warm goodbye. Keep it brief.');
  } else if (phase === 'winding_down') {
    parts.push('WINDING DOWN: Summarize key points, confirm action items, begin warm sign-off.');
  } else if (direction.reminder?.should_deliver) {
    parts.push(`REMIND: ${direction.reminder.which_reminder}`);
  } else if (direction.analysis?.engagement_level === 'low') {
    parts.push('RE-ENGAGE');
  } else if (direction.direction?.stay_or_shift === 'transition' && direction.direction?.next_topic) {
    parts.push(`SHIFT→${direction.direction.next_topic}`);
  } else if (direction.direction?.stay_or_shift === 'wrap_up') {
    parts.push('WRAP-UP');
  } else if (direction.guidance?.specific_instruction) {
    // Skip stage-direction-like instructions that Haiku might speak aloud
    const instr = direction.guidance.specific_instruction;
    const isStageDirection = /\b(laugh|pause|sigh|smile|nod|speak|empathy|concern|warmth|gently)\b/i.test(instr);
    if (!isStageDirection) {
      parts.push(instr.length > 40 ? instr.substring(0, 40) + '...' : instr);
    }
  }

  // Emotional flag only if notable
  if (direction.analysis?.emotional_tone === 'sad' || direction.analysis?.emotional_tone === 'concerned') {
    parts.push(`(${direction.analysis.emotional_tone})`);
  }

  return parts.join(' | ');
}

/**
 * Search memories relevant to current conversation
 */
async function searchRelevantMemories(seniorId, userMessage) {
  if (!seniorId) return [];

  try {
    const memories = await memoryService.search(seniorId, userMessage, 3, 0.65);
    return memories.map(m => ({
      content: m.content,
      type: m.type,
      importance: m.importance,
    }));
  } catch (error) {
    console.error('[ConversationDirector] Memory search error:', error.message);
    return [];
  }
}

/**
 * Check if user is asking for web search (news, info lookup, etc)
 */
async function checkCurrentEvents(userMessage) {
  // Patterns that trigger web search
  const searchTriggers = /\b(news|weather|happening|world|president|election|look.{0,10}up|search|can you (find|check)|do you know|what('s| is) the (best|top)|what year did|how many\b.*\b(are there|does|did)|who (was|is|were|invented|discovered|founded|wrote|created)|when did|how long ago|what happened in|how (tall|old|big|far|deep|long|fast|heavy|much does) is|what('s| is) the (population|capital|distance|height|size|age) of|I wonder|I('m| am) curious|have you heard about|tell me about|what do you know about|what is the\b.{3,}|what are the\b.{3,}|where is\b.{3,}\b(located|at))\b/i;

  if (!searchTriggers.test(userMessage)) {
    return null;
  }

  try {
    // Determine if this is a news request, curiosity/factual question, or general search
    const isNewsRequest = /\b(news|headline|happening|current events|today)\b/i.test(userMessage);
    const isFactualOrCuriosity = /\b(what year did|how many|who (was|is|were|invented|discovered|founded|wrote|created)|when did|how long ago|what happened in|how (tall|old|big|far|deep|long|fast|heavy|much does) is|what('s| is) the (population|capital|distance|height|size|age) of|I wonder|I('m| am) curious|have you heard about|tell me about|what do you know about|what is the|what are the|where is\b.{3,}\b(located|at))\b/i.test(userMessage);

    if (isNewsRequest) {
      // Use news service for news-type queries
      const topicMatch = userMessage.match(/(?:news\s+(?:about|on)|about|on|the)\s+(.{3,40}?)(?:\?|$|\.)/i);
      const topic = topicMatch ? topicMatch[1].trim() : 'general news';

      const news = await newsService.getNewsForSenior([topic], 2);
      if (news) {
        return {
          type: 'news',
          content: news,
        };
      }
    } else if (isFactualOrCuriosity) {
      // Factual / curiosity question - pass the full question as the search query
      const searchResult = await performWebSearch(userMessage);
      if (searchResult) {
        return {
          type: 'factual',
          content: searchResult,
        };
      }
    } else {
      // General web search - use OpenAI directly
      const searchResult = await performWebSearch(userMessage);
      if (searchResult) {
        return {
          type: 'search',
          content: searchResult,
        };
      }
    }
  } catch (error) {
    console.error('[ConversationDirector] Search error:', error.message);
  }

  return null;
}

/**
 * Perform a general web search using OpenAI
 */
async function performWebSearch(query) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[ConversationDirector] OpenAI not configured, skipping web search');
    return null;
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log(`[ConversationDirector] Web search: "${query.substring(0, 50)}..."`);

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      input: `Answer this question in 2-3 short, friendly sentences: ${query}

              This will be spoken aloud to an elderly person during a phone call, so:
              - Use warm, conversational language (like a friend explaining something)
              - Avoid jargon, technical terms, or complex numbers
              - Round numbers to make them easy to remember
              - If it's a factual question, give the answer right away
              - If you can't find the answer, just say "I'm not sure about that"`,
      tool_choice: 'required',
    });

    const result = response.output_text?.trim();

    if (!result) {
      console.log('[ConversationDirector] No search result returned');
      return null;
    }

    console.log(`[ConversationDirector] Search result: "${result.substring(0, 100)}..."`);

    return result;

  } catch (error) {
    console.error('[ConversationDirector] Web search error:', error.message);
    return null;
  }
}

/**
 * Run the full Conversation Director pipeline
 * Returns direction + memories + news for comprehensive context
 *
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Full conversation history
 * @param {string|null} seniorId - Senior's UUID (optional)
 * @param {object} seniorContext - Senior profile data
 * @param {object} callState - Current call state
 * @returns {Promise<object>} Combined analysis results
 */
export async function runDirectorPipeline(
  userMessage,
  conversationHistory = [],
  seniorId = null,
  seniorContext = null,
  callState = null
) {
  const startTime = Date.now();

  // Run all analyses in parallel
  const [direction, memories, currentEvents] = await Promise.all([
    getConversationDirection(
      userMessage,
      conversationHistory,
      seniorContext,
      callState,
      [] // We get memories separately for better control
    ),
    searchRelevantMemories(seniorId, userMessage),
    checkCurrentEvents(userMessage),
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`[ConversationDirector] Full pipeline: ${elapsed}ms`);

  return {
    direction,
    memories,
    currentEvents,
    elapsed,
    // Map to legacy format for backwards compatibility
    modelRecommendation: direction.model_recommendation ? {
      use_sonnet: direction.model_recommendation.use_sonnet,
      max_tokens: direction.model_recommendation.max_tokens,
      reason: direction.model_recommendation.reason
    } : null,
  };
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use runDirectorPipeline instead
 */
export async function fastAnalyzeWithTools(userMessage, conversationHistory = [], seniorId = null) {
  return runDirectorPipeline(userMessage, conversationHistory, seniorId, null, null);
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use formatDirectorGuidance instead
 */
export function formatFastObserverGuidance(analysis) {
  // Handle both old format (has direction) and new format (has sentiment)
  if (analysis.direction) {
    return {
      guidance: formatDirectorGuidance(analysis.direction),
      memories: analysis.memories?.length > 0
        ? analysis.memories.map(m => `- ${m.content}`).join('\n')
        : null,
    };
  }

  // Fallback for old sentiment-based format
  const guidanceLines = [];
  let memoriesText = null;

  if (analysis.sentiment) {
    if (analysis.sentiment.sentiment === 'negative' || analysis.sentiment.sentiment === 'concerned') {
      guidanceLines.push('User seems worried - respond with warmth');
    }
    if (analysis.sentiment.needs_empathy) {
      guidanceLines.push('User needs emotional support - acknowledge feelings');
    }
    if (analysis.sentiment.engagement === 'low') {
      guidanceLines.push('Low engagement - ask about their interests');
    }
  }

  if (analysis.memories?.length > 0) {
    memoriesText = analysis.memories.map(m => `- ${m.content}`).join('\n');
  }

  return {
    guidance: guidanceLines.length > 0 ? guidanceLines.join('\n') : null,
    memories: memoriesText,
  };
}

// Helper functions
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

export default {
  getConversationDirection,
  formatDirectorGuidance,
  runDirectorPipeline,
  fastAnalyzeWithTools,
  formatFastObserverGuidance,
};
