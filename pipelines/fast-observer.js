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

import Anthropic from '@anthropic-ai/sdk';
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';

const anthropic = new Anthropic();

/**
 * Fast analysis using Haiku for sentiment/intent
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Recent conversation
 * @returns {Promise<object>} Quick AI analysis
 */
async function analyzeSentimentWithHaiku(userMessage, conversationHistory = []) {
  const recentContext = conversationHistory
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      system: `You analyze elderly phone conversations quickly. Respond ONLY with JSON.
{
  "sentiment": "positive|neutral|negative|concerned",
  "engagement": "high|medium|low",
  "topic_shift": "suggested topic if conversation stalling, null otherwise",
  "needs_empathy": boolean,
  "mentioned_names": ["any names mentioned"]
}`,
      messages: [
        {
          role: 'user',
          content: `Recent conversation:\n${recentContext}\n\nLatest message: "${userMessage}"\n\nAnalyze:`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    // Handle potential markdown code blocks
    const jsonText = text.includes('```')
      ? text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      : text;
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[FastObserver] Haiku analysis error:', error.message);
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
    analyzeSentimentWithHaiku(userMessage, conversationHistory),
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
 * Format fast observer results for system prompt injection
 * NOTE: Use only factual context, no instructions (model was reading them aloud)
 * @param {object} analysis - Results from fastAnalyzeWithTools
 * @returns {string|null} Formatted context string
 */
export function formatFastObserverGuidance(analysis) {
  const context = [];

  // Sentiment context (facts only, no instructions)
  if (analysis.sentiment) {
    if (analysis.sentiment.sentiment) {
      context.push(`User mood: ${analysis.sentiment.sentiment}`);
    }
    if (analysis.sentiment.mentioned_names?.length > 0) {
      context.push(`Names mentioned: ${analysis.sentiment.mentioned_names.join(', ')}`);
    }
  }

  // Memory context (facts only)
  if (analysis.memories?.length > 0) {
    const memoryText = analysis.memories.map(m => m.content).join('; ');
    context.push(`Relevant memories: ${memoryText}`);
  }

  // Current events (facts only)
  if (analysis.currentEvents?.items?.length > 0) {
    const newsText = analysis.currentEvents.items
      .slice(0, 2)
      .map(n => n.title || n.summary)
      .join('; ');
    context.push(`Recent news: ${newsText}`);
  }

  return context.length > 0 ? context.join('. ') : null;
}

export default {
  fastAnalyzeWithTools,
  formatFastObserverGuidance,
};
