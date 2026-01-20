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

  // Build guidance string for system prompt
  result.guidance = buildGuidance(result);

  return result;
}

/**
 * Build guidance string for injection into system prompt
 */
function buildGuidance(analysis) {
  const lines = [];

  // Health signals - highest priority
  if (analysis.healthSignals.length > 0) {
    const healthType = analysis.healthSignals[0];
    const healthGuidance = {
      dizziness: 'Express genuine concern about their dizziness. Ask if they need help or if this is new.',
      pain: 'Show empathy about their discomfort. Ask where it hurts and if they\'ve told anyone.',
      fall: 'This is important - ask if they\'re okay and if anyone knows. Express care.',
      medication: 'If they mention medication, gently ask if they\'ve taken it today.',
      medical_appointment: 'Ask about their appointment - when it is, if they need a ride.',
      fatigue: 'Note they seem tired. Ask if they\'ve been sleeping okay.',
      sleep_issues: 'Sleep issues can be concerning. Ask gently how long this has been happening.',
      memory_concern: 'Be reassuring about memory. Everyone forgets things sometimes.',
      cardiovascular: 'Heart/chest mentions need gentle follow-up. Ask if they\'re feeling okay now.',
      appetite: 'Ask what they\'ve been eating. Meals are important conversation topics too.',
    };
    lines.push(`[HEALTH: ${healthGuidance[healthType] || 'Follow up on their health mention with care.'}]`);
  }

  // Family signals - warm conversation opportunity
  if (analysis.familySignals.length > 0) {
    lines.push('[FAMILY: They mentioned family - this is a warm topic. Ask a follow-up question about this person.]');
  }

  // Emotion signals
  const negativeEmotions = analysis.emotionSignals.filter(e => e.valence === 'negative');
  const positiveEmotions = analysis.emotionSignals.filter(e => e.valence === 'positive');

  if (negativeEmotions.length > 0) {
    const emotion = negativeEmotions[0].signal;
    const emotionGuidance = {
      lonely: 'They may be feeling lonely. Be extra warm and engaging. Ask about their day.',
      sad: 'Acknowledge their feelings. Ask what\'s on their mind.',
      anxious: 'They seem worried. Ask what\'s concerning them and listen.',
      frustrated: 'Acknowledge their frustration. Ask what happened.',
      bored: 'They might need stimulation. Suggest an activity or ask about their interests.',
    };
    lines.push(`[EMOTION: ${emotionGuidance[emotion] || 'They expressed a difficult emotion. Acknowledge it warmly.'}]`);
  } else if (positiveEmotions.length > 0) {
    lines.push('[EMOTION: They seem positive - match their energy and share in their happiness.]');
  }

  // Question handling
  if (analysis.isQuestion) {
    lines.push('[QUESTION: They asked a question. Answer it directly first, then continue conversation.]');
  }

  // Low engagement
  if (analysis.engagementLevel === 'low') {
    lines.push('[ENGAGEMENT: Short responses detected. Try asking an open-ended question about something they enjoy.]');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

export default { quickAnalyze };
