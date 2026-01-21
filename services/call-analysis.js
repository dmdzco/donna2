/**
 * Post-Call Analysis Service
 *
 * Runs after call ends to generate summary, alerts, and analytics.
 * Uses Gemini Flash for cost efficiency (~$0.0005 per call).
 *
 * Outputs:
 * - Call summary for records
 * - Caregiver alerts (health, cognitive, safety concerns)
 * - Engagement metrics
 * - Follow-up suggestions for next call
 */

import { getAdapter } from '../adapters/llm/index.js';
import { db } from '../db/client.js';
import { callAnalyses } from '../db/schema.js';

// Use Gemini Flash for cost-efficient batch analysis
const ANALYSIS_MODEL = process.env.CALL_ANALYSIS_MODEL || 'gemini-3-flash';

/**
 * Repair malformed JSON from LLM responses
 */
function repairJson(jsonText) {
  let repaired = jsonText;

  // Remove trailing commas in arrays and objects
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Try to close unclosed structures
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Check for unterminated string at end
  const lastQuote = repaired.lastIndexOf('"');
  const afterLastQuote = repaired.substring(lastQuote + 1);
  if (lastQuote > 0 && !afterLastQuote.match(/["\]},:]/)) {
    repaired = repaired.substring(0, lastQuote + 1) + '"';
  }

  // Close unclosed brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  // Final cleanup of trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  return repaired;
}

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
}`;

/**
 * Analyze a completed call
 * @param {Array} transcript - Conversation history array
 * @param {object} seniorContext - Senior profile data
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeCompletedCall(transcript, seniorContext) {
  const prompt = ANALYSIS_PROMPT
    .replace('{{SENIOR_NAME}}', seniorContext?.name || 'Unknown')
    .replace('{{HEALTH_CONDITIONS}}', seniorContext?.medicalNotes || 'None known')
    .replace('{{FAMILY_MEMBERS}}', seniorContext?.family?.join(', ') || 'Unknown')
    .replace('{{TRANSCRIPT}}', formatTranscript(transcript));

  try {
    const adapter = getAdapter(ANALYSIS_MODEL);
    const messages = [
      {
        role: 'user',
        content: 'Please analyze this call transcript.',
      },
    ];

    const text = await adapter.generate(prompt, messages, {
      maxTokens: 1500,
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

    // Try parsing, repair if needed
    let analysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.log('[CallAnalysis] JSON parse failed, attempting repair...');
      const repaired = repairJson(jsonText);
      analysis = JSON.parse(repaired);
    }
    console.log(`[CallAnalysis] Analysis complete: engagement=${analysis.engagement_score}/10, concerns=${analysis.concerns?.length || 0}`);
    return analysis;
  } catch (error) {
    console.error('[CallAnalysis] Error:', error.message);
    return getDefaultAnalysis();
  }
}

/**
 * Save call analysis to database
 * @param {string} conversationId - Conversation UUID
 * @param {string} seniorId - Senior UUID
 * @param {object} analysis - Analysis result
 */
export async function saveCallAnalysis(conversationId, seniorId, analysis) {
  try {
    // Check if callAnalyses table exists
    if (!callAnalyses) {
      console.log('[CallAnalysis] callAnalyses table not available, skipping save');
      return null;
    }

    const result = await db.insert(callAnalyses).values({
      conversationId: conversationId,
      seniorId: seniorId,
      summary: analysis.summary,
      topics: analysis.topics_discussed,
      engagementScore: analysis.engagement_score,
      concerns: analysis.concerns,
      positiveObservations: analysis.positive_observations,
      followUpSuggestions: analysis.follow_up_suggestions,
      callQuality: analysis.call_quality,
    }).returning();

    console.log(`[CallAnalysis] Saved analysis for conversation ${conversationId}`);
    return result[0];
  } catch (error) {
    // Table might not exist yet - that's okay
    console.error('[CallAnalysis] Save error:', error.message);
    return null;
  }
}

/**
 * Check for high-severity concerns and return them
 * @param {object} analysis - Analysis result
 * @returns {Array} High-severity concerns
 */
export function getHighSeverityConcerns(analysis) {
  if (!analysis?.concerns?.length) return [];
  return analysis.concerns.filter(c => c.severity === 'high');
}

/**
 * Format transcript for analysis
 */
function formatTranscript(history) {
  if (!history?.length) return 'No transcript available';
  return history
    .map(m => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`)
    .join('\n\n');
}

/**
 * Default analysis when processing fails
 */
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

export default {
  analyzeCompletedCall,
  saveCallAnalysis,
  getHighSeverityConcerns,
};
