/**
 * Quick Observer - Layer 1 (0ms)
 *
 * Instant regex-based analysis that affects the CURRENT response.
 * Runs synchronously before Claude is called.
 *
 * Detects:
 * - Health mentions (dizzy, pain, fell, medicine, etc.)
 * - Family mentions (daughter, son, grandkids, etc.)
 * - Emotional signals (lonely, sad, happy, worried)
 * - Questions from user (needs direct answer)
 * - Short responses (may indicate disengagement)
 */

// Health-related patterns that may need attention or follow-up
const HEALTH_PATTERNS = [
  { pattern: /\b(dizzy|dizziness|lightheaded)\b/i, signal: 'dizziness' },
  { pattern: /\b(pain|hurt|ache|sore)\b/i, signal: 'pain' },
  { pattern: /\b(fell|fall|tripped|stumbled)\b/i, signal: 'fall' },
  { pattern: /\b(medicine|medication|pill|prescription)\b/i, signal: 'medication' },
  { pattern: /\b(doctor|hospital|appointment|checkup)\b/i, signal: 'medical_appointment' },
  { pattern: /\b(tired|exhausted|fatigue|weak)\b/i, signal: 'fatigue' },
  { pattern: /\b(can't sleep|insomnia|awake)\b/i, signal: 'sleep_issues' },
  { pattern: /\b(forgot|forget|memory|remember)\b/i, signal: 'memory_concern' },
  { pattern: /\b(blood pressure|heart|chest)\b/i, signal: 'cardiovascular' },
  { pattern: /\b(eat|eating|appetite|hungry|food)\b/i, signal: 'appetite' },
];

// Family-related patterns (opportunities for warm conversation)
const FAMILY_PATTERNS = [
  { pattern: /\b(daughter|son|child|children|kid)\b/i, signal: 'children' },
  { pattern: /\b(grandchild|grandkid|grandson|granddaughter)\b/i, signal: 'grandchildren' },
  { pattern: /\b(husband|wife|spouse|partner)\b/i, signal: 'spouse' },
  { pattern: /\b(sister|brother|sibling)\b/i, signal: 'siblings' },
  { pattern: /\b(family|relative)\b/i, signal: 'family_general' },
  { pattern: /\b(visit|visiting|came over|stopped by)\b/i, signal: 'family_visit' },
  { pattern: /\b(called|phoned|texted)\b/i, signal: 'family_contact' },
];

// Emotional signals
const EMOTION_PATTERNS = [
  { pattern: /\b(lonely|alone|miss|missing)\b/i, signal: 'lonely', valence: 'negative' },
  { pattern: /\b(sad|down|depressed|blue)\b/i, signal: 'sad', valence: 'negative' },
  { pattern: /\b(worried|anxious|nervous|scared)\b/i, signal: 'anxious', valence: 'negative' },
  { pattern: /\b(happy|glad|good|great|wonderful)\b/i, signal: 'positive', valence: 'positive' },
  { pattern: /\b(excited|looking forward|can't wait)\b/i, signal: 'excited', valence: 'positive' },
  { pattern: /\b(frustrated|annoyed|angry|upset)\b/i, signal: 'frustrated', valence: 'negative' },
  { pattern: /\b(bored|nothing to do)\b/i, signal: 'bored', valence: 'negative' },
  { pattern: /\b(thank|appreciate|grateful)\b/i, signal: 'grateful', valence: 'positive' },
];

// Question indicators (user expects a response)
const QUESTION_PATTERNS = [
  { pattern: /\?$/, signal: 'explicit_question' },
  { pattern: /^(what|where|when|why|how|who|which|do you|can you|could you|would you|did you)/i, signal: 'question_start' },
  { pattern: /\b(tell me|let me know|wonder|wondering)\b/i, signal: 'information_request' },
];

// Engagement indicators
const ENGAGEMENT_PATTERNS = [
  { pattern: /^(yes|no|ok|okay|sure|fine|mm|hmm|uh huh|yeah|yep|nope)$/i, signal: 'minimal_response' },
  { pattern: /^.{1,15}$/i, signal: 'very_short' }, // Very short responses
  { pattern: /^.{1,30}$/i, signal: 'short' }, // Short responses
];

// Reminder acknowledgment patterns - user confirming they will do/have done reminder
const REMINDER_ACKNOWLEDGMENT_PATTERNS = [
  // Acknowledgment (will do) - higher confidence
  { pattern: /\b(ok(ay)?|sure|yes|will do|got it|i('ll| will) (take|do|remember)|sounds good|alright)\b/i, type: 'acknowledged', confidence: 0.8 },
  { pattern: /\b(thank(s| you)|appreciate|good reminder|glad you called|thanks for reminding)\b/i, type: 'acknowledged', confidence: 0.7 },
  { pattern: /\b(i('ll| will) get (to it|on it|it done)|going to (take|do) it|about to)\b/i, type: 'acknowledged', confidence: 0.9 },

  // Confirmation (already done) - higher confidence
  { pattern: /\b(already (took|did|done|finished|had|taken)|just (took|did|finished)|i('ve| have) (taken|done|had|finished))\b/i, type: 'confirmed', confidence: 0.95 },
  { pattern: /\b(took (it|them|my|the)|did (it|that)|done( with)?( it)?|finished|completed)\b/i, type: 'confirmed', confidence: 0.85 },
  { pattern: /\b(earlier|this morning|a (few )?minutes ago|before you called)\b/i, type: 'confirmed', confidence: 0.8 },
];

/**
 * Quick analysis of user message - runs in 0ms (synchronous regex)
 * Returns guidance to inject into system prompt for current response
 *
 * @param {string} userMessage - The current user message
 * @param {Array<{role: string, content: string}>} recentHistory - Last few exchanges (optional)
 * @returns {object} Analysis result with guidance
 */
export function quickAnalyze(userMessage, recentHistory = []) {
  const result = {
    healthSignals: [],
    familySignals: [],
    emotionSignals: [],
    isQuestion: false,
    engagementLevel: 'normal',
    guidance: null,
    modelRecommendation: null, // Dynamic model/token selection
    reminderResponse: null,    // Reminder acknowledgment detection
  };

  if (!userMessage) return result;

  const text = userMessage.trim();

  // Check health patterns
  for (const { pattern, signal } of HEALTH_PATTERNS) {
    if (pattern.test(text)) {
      result.healthSignals.push(signal);
    }
  }

  // Check family patterns
  for (const { pattern, signal } of FAMILY_PATTERNS) {
    if (pattern.test(text)) {
      result.familySignals.push(signal);
    }
  }

  // Check emotion patterns
  for (const { pattern, signal, valence } of EMOTION_PATTERNS) {
    if (pattern.test(text)) {
      result.emotionSignals.push({ signal, valence });
    }
  }

  // Check for questions
  for (const { pattern } of QUESTION_PATTERNS) {
    if (pattern.test(text)) {
      result.isQuestion = true;
      break;
    }
  }

  // Check engagement level
  for (const { pattern, signal } of ENGAGEMENT_PATTERNS) {
    if (pattern.test(text)) {
      if (signal === 'minimal_response' || signal === 'very_short') {
        result.engagementLevel = 'low';
      } else if (signal === 'short' && result.engagementLevel !== 'low') {
        result.engagementLevel = 'medium';
      }
    }
  }

  // Check for consecutive short responses (disengagement pattern)
  if (recentHistory.length >= 2) {
    const lastUserMessages = recentHistory
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content);

    const shortCount = lastUserMessages.filter(m => m && m.length < 20).length;
    if (shortCount >= 2) {
      result.engagementLevel = 'low';
    }
  }

  // Check for reminder acknowledgment/confirmation
  let bestReminderMatch = null;
  for (const { pattern, type, confidence } of REMINDER_ACKNOWLEDGMENT_PATTERNS) {
    if (pattern.test(text)) {
      if (!bestReminderMatch || confidence > bestReminderMatch.confidence) {
        bestReminderMatch = { type, confidence };
      }
    }
  }
  if (bestReminderMatch) {
    result.reminderResponse = bestReminderMatch;
  }

  // Build guidance string for system prompt
  result.guidance = buildGuidance(result);

  // Build model recommendation for dynamic routing
  result.modelRecommendation = buildModelRecommendation(result);

  return result;
}

/**
 * Build model recommendation based on detected signals
 * Returns upgrade to Sonnet + higher token count for sensitive situations
 */
function buildModelRecommendation(analysis) {
  // Health mentions - safety requires thoughtful response
  if (analysis.healthSignals.length > 0) {
    const severeHealth = ['fall', 'dizziness', 'cardiovascular', 'pain'];
    const isSevere = analysis.healthSignals.some(s => severeHealth.includes(s));
    return {
      use_sonnet: true,
      max_tokens: isSevere ? 150 : 120,
      reason: 'health_safety'
    };
  }

  // Negative emotions - need nuanced empathy
  const negativeEmotions = analysis.emotionSignals.filter(e => e.valence === 'negative');
  if (negativeEmotions.length > 0) {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'emotional_support'
    };
  }

  // Low engagement - need creative re-engagement
  if (analysis.engagementLevel === 'low') {
    return {
      use_sonnet: true,
      max_tokens: 120,
      reason: 'low_engagement'
    };
  }

  // Simple question - quick answer is better
  if (analysis.isQuestion && analysis.healthSignals.length === 0 && negativeEmotions.length === 0) {
    return {
      use_sonnet: false,
      max_tokens: 60,
      reason: 'simple_question'
    };
  }

  // Family mention - Haiku handles warmth fine
  if (analysis.familySignals.length > 0) {
    return {
      use_sonnet: false,
      max_tokens: 75,
      reason: 'family_warmth'
    };
  }

  // Default - no recommendation, use pipeline defaults
  return null;
}

/**
 * Build guidance string for injection into system prompt
 * NOTE: Bracketed text is internal guidance - model instructed not to read aloud
 */
function buildGuidance(analysis) {
  const lines = [];

  // Health signals - highest priority
  if (analysis.healthSignals.length > 0) {
    const healthType = analysis.healthSignals[0];
    const healthGuidance = {
      dizziness: 'Express concern about their dizziness. Ask if they need help.',
      pain: 'Show empathy about their discomfort. Ask where it hurts.',
      fall: 'Ask if they are okay and if anyone knows about this.',
      medication: 'Gently ask if they have taken their medication today.',
      medical_appointment: 'Ask about their appointment - when is it?',
      fatigue: 'Ask if they have been sleeping okay.',
      sleep_issues: 'Ask how long they have had trouble sleeping.',
      memory_concern: 'Be reassuring. Everyone forgets things sometimes.',
      cardiovascular: 'Ask if they are feeling okay right now.',
      appetite: 'Ask what they have been eating lately.',
    };
    lines.push(`[HEALTH] ${healthGuidance[healthType] || 'Follow up on their health with care.'}`);
  }

  // Family signals
  if (analysis.familySignals.length > 0) {
    lines.push('[FAMILY] They mentioned family. Ask a warm follow-up about this person.');
  }

  // Emotion signals
  const negativeEmotions = analysis.emotionSignals.filter(e => e.valence === 'negative');
  const positiveEmotions = analysis.emotionSignals.filter(e => e.valence === 'positive');

  if (negativeEmotions.length > 0) {
    const emotion = negativeEmotions[0].signal;
    const emotionGuidance = {
      lonely: 'Be extra warm. Ask about their day.',
      sad: 'Acknowledge their feelings. Ask what is on their mind.',
      anxious: 'Ask what is concerning them.',
      frustrated: 'Acknowledge their frustration. Ask what happened.',
      bored: 'Ask about their interests or suggest an activity.',
    };
    lines.push(`[EMOTION] ${emotionGuidance[emotion] || 'Acknowledge their feelings warmly.'}`);
  } else if (positiveEmotions.length > 0) {
    lines.push('[EMOTION] They seem positive. Match their energy.');
  }

  // Question handling
  if (analysis.isQuestion) {
    lines.push('[QUESTION] Answer their question directly first, then continue.');
  }

  // Low engagement
  if (analysis.engagementLevel === 'low') {
    lines.push('[ENGAGEMENT] Short responses. Ask an open question about something they enjoy.');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

export default { quickAnalyze };
