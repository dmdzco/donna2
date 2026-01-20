/**
 * Fast Observer - Layer 2 (~300ms)
 *
 * Runs in parallel with Claude's response generation.
 * Uses lightweight AI (Haiku) + tools for fast analysis.
 *
 * Executes in parallel:
 * - Haiku sentiment/intent analysis (~100ms)
 * - Memory search (~100ms)
 * - Optional: News/current events lookup
 *
 * Results are cached for injection into NEXT response
 * (or current response if Claude is slow enough)
 */

import { getAdapter } from '../adapters/llm/index.js';
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';

// Fast observer model (gemini-3-flash for speed)
const FAST_OBSERVER_MODEL = process.env.FAST_OBSERVER_MODEL || 'gemini-3-flash';

/**
 * Fast analysis using Gemini 3 Flash for sentiment/intent
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Recent conversation
 * @returns {Promise<object>} Quick AI analysis
 */
async function analyzeSentiment(userMessage, conversationHistory = []) {
  const recentContext = conversationHistory
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const systemPrompt = `Analyze this elderly phone conversation. Return ONLY a JSON object with no other text:
{"sentiment":"positive|neutral|negative|concerned","engagement":"high|medium|low","topic_shift":null,"needs_empathy":false,"mentioned_names":[]}`;

  const messages = [
    {
      role: 'user',
      content: `Conversation:\n${recentContext}\n\nLatest: "${userMessage}"`,
    },
  ];

  try {
    const adapter = getAdapter(FAST_OBSERVER_MODEL);
    const text = await adapter.generate(systemPrompt, messages, { maxTokens: 300, temperature: 0.1 });

    // Extract JSON from response (handle markdown, extra text)
    let jsonText = text.trim();
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    // Try to find JSON object in response
    const jsonMatch = jsonText.match(/\{[^{}]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Try to parse, log on failure
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[FastObserver] JSON parse failed, raw:', text.substring(0, 200));
      throw parseError;
    }
  } catch (error) {
    console.error('[FastObserver] Analysis error:', error.message);
    return {
      sentiment: 'neutral',
      engagement: 'medium',
      topic_shift: null,
      needs_empathy: false,
      mentioned_names: [],
    };
  }
}

/**
 * Search memories relevant to current conversation
 * @param {string} seniorId - Senior's UUID
 * @param {string} userMessage - Current user message
 * @returns {Promise<Array>} Relevant memories
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
    console.error('[FastObserver] Memory search error:', error.message);
    return [];
  }
}

/**
 * Check for current events if user mentions news/weather/etc
 * @param {string} userMessage - Current user message
 * @returns {Promise<object|null>} News/weather info if relevant
 */
async function checkCurrentEvents(userMessage) {
  const newsKeywords = /\b(news|weather|today|happening|world|president|election)\b/i;

  if (!newsKeywords.test(userMessage)) {
    return null;
  }

  try {
    // Extract topic from message
    const topicMatch = userMessage.match(/(?:about|the|what's)\s+(\w+(?:\s+\w+)?)/i);
    const topic = topicMatch ? topicMatch[1] : 'general news';

    const news = await newsService.getRelevantNews(topic);
    if (news && news.length > 0) {
      return {
        type: 'news',
        items: news.slice(0, 2),
      };
    }
  } catch (error) {
    console.error('[FastObserver] News fetch error:', error.message);
  }

  return null;
}

/**
 * Run fast analysis in parallel (~300ms total)
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Recent conversation
 * @param {string|null} seniorId - Senior's UUID (optional)
 * @returns {Promise<object>} Combined analysis results
 */
export async function fastAnalyzeWithTools(userMessage, conversationHistory = [], seniorId = null) {
  const startTime = Date.now();

  // Run all analyses in parallel
  const [sentiment, memories, currentEvents] = await Promise.all([
    analyzeSentiment(userMessage, conversationHistory),
    searchRelevantMemories(seniorId, userMessage),
    checkCurrentEvents(userMessage),
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`[FastObserver] Analysis completed in ${elapsed}ms`);

  // Build model recommendation based on analysis
  const modelRecommendation = buildModelRecommendation(sentiment, memories);

  return {
    sentiment,
    memories,
    currentEvents,
    elapsed,
    modelRecommendation,
  };
}

/**
 * Build model recommendation based on fast observer results
 * Returns upgrade to Sonnet + higher token count for sensitive situations
 */
function buildModelRecommendation(sentiment, memories) {
  // Needs empathy - requires sophistication
  if (sentiment?.needs_empathy) {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'needs_empathy'
    };
  }

  // Concerned sentiment - careful, nuanced response needed
  if (sentiment?.sentiment === 'concerned' || sentiment?.sentiment === 'negative') {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'concerned_sentiment'
    };
  }

  // Low engagement with topic shift - creative re-engagement
  if (sentiment?.engagement === 'low' && sentiment?.topic_shift) {
    return {
      use_sonnet: true,
      max_tokens: 120,
      reason: 'creative_reengagement'
    };
  }

  // High importance memory match - personalized response
  const highImportanceMemory = memories?.find(m => m.importance >= 80);
  if (highImportanceMemory) {
    return {
      use_sonnet: true,
      max_tokens: 150,
      reason: 'important_memory'
    };
  }

  // Any memory match - slightly more tokens for personalization
  if (memories?.length > 0) {
    return {
      use_sonnet: false,
      max_tokens: 100,
      reason: 'memory_personalization'
    };
  }

  // Default - no recommendation
  return null;
}

/**
 * Format fast observer results - returns { guidance, memories }
 * Guidance only for Sonnet, memories for all models
 * @param {object} analysis - Results from fastAnalyzeWithTools
 * @returns {object} { guidance: string|null, memories: string|null }
 */
export function formatFastObserverGuidance(analysis) {
  const guidanceLines = [];
  let memoriesText = null;

  // Sentiment-based guidance (Sonnet only)
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
    if (analysis.sentiment.topic_shift) {
      guidanceLines.push(`Consider topic: ${analysis.sentiment.topic_shift}`);
    }
    if (analysis.sentiment.mentioned_names?.length > 0) {
      guidanceLines.push(`They mentioned: ${analysis.sentiment.mentioned_names.join(', ')} - ask about them`);
    }
  }

  // Memory-based context (all models)
  if (analysis.memories?.length > 0) {
    memoriesText = analysis.memories.map(m => `- ${m.content}`).join('\n');
  }

  // Current events (all models)
  if (analysis.currentEvents?.items?.length > 0) {
    const newsText = analysis.currentEvents.items
      .slice(0, 2)
      .map(n => n.title || n.summary)
      .join('; ');
    guidanceLines.push(`News to share if asked: ${newsText}`);
  }

  return {
    guidance: guidanceLines.length > 0 ? guidanceLines.join('\n') : null,
    memories: memoriesText,
  };
}

export default {
  fastAnalyzeWithTools,
  formatFastObserverGuidance,
};
