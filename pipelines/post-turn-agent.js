/**
 * Post-Turn Agent - Layer 4
 *
 * Runs AFTER response is sent to user (non-blocking).
 * Handles background tasks that don't affect current response:
 * - Extract and log health concerns for caregivers
 * - Prefetch context for anticipated topics
 * - Store important memories from conversation
 * - Flag conversations that need caregiver review
 */

import Anthropic from '@anthropic-ai/sdk';
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';

const anthropic = new Anthropic();

/**
 * Extract health concerns from user message
 * @param {string} userMessage - What the user said
 * @param {string} assistantResponse - What Donna replied
 * @param {string} seniorId - Senior's UUID
 * @returns {Promise<object|null>} Extracted concern or null
 */
async function extractHealthConcern(userMessage, assistantResponse, seniorId) {
  if (!seniorId) return null;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      system: `You extract health concerns from elderly conversations for caregiver alerts.
Output JSON only: { "concern": "brief description", "severity": "low|medium|high", "category": "physical|emotional|cognitive|medication" }
If no real concern, output: { "concern": null }`,
      messages: [
        {
          role: 'user',
          content: `Senior said: "${userMessage}"\nDonna replied: "${assistantResponse}"\n\nExtract any health concern:`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonText = text.includes('```')
      ? text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      : text;
    const result = JSON.parse(jsonText);

    if (result.concern) {
      console.log(`[PostTurn] Health concern detected: ${result.concern} (${result.severity})`);

      // Store as memory for caregiver review
      await memoryService.store(
        seniorId,
        'health_concern',
        result.concern,
        'post_turn_agent',
        result.severity === 'high' ? 90 : result.severity === 'medium' ? 70 : 50,
        { severity: result.severity, category: result.category, timestamp: new Date().toISOString() }
      );

      return result;
    }
  } catch (error) {
    console.error('[PostTurn] Health extraction error:', error.message);
  }

  return null;
}

/**
 * Detect if user mentioned something worth remembering
 * @param {string} userMessage - What the user said
 * @param {string} seniorId - Senior's UUID
 * @returns {Promise<boolean>} Whether a memory was stored
 */
async function extractAndStoreMemory(userMessage, seniorId) {
  if (!seniorId) return false;

  // Quick regex check - only process if likely contains memorable info
  const memoryPatterns = /\b(my|i have|i got|we|visited|went|bought|started|joined|daughter|son|grandchild|doctor|hospital|birthday|anniversary|passed away|moved|retired)\b/i;
  if (!memoryPatterns.test(userMessage)) return false;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      system: `Extract personal facts worth remembering about this elderly person.
Output JSON: { "memory": "fact to remember", "type": "family|health|preference|life_event|routine" }
If nothing memorable, output: { "memory": null }
Examples of good memories:
- "Daughter Sarah visited from Chicago"
- "Started physical therapy for knee"
- "Loves watching birds in the morning"`,
      messages: [
        {
          role: 'user',
          content: `Senior said: "${userMessage}"\n\nExtract memorable fact:`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonText = text.includes('```')
      ? text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      : text;
    const result = JSON.parse(jsonText);

    if (result.memory) {
      console.log(`[PostTurn] Storing memory: ${result.memory}`);
      await memoryService.store(
        seniorId,
        result.type || 'personal',
        result.memory,
        'post_turn_agent',
        60,
        { extracted_from: userMessage.substring(0, 100) }
      );
      return true;
    }
  } catch (error) {
    console.error('[PostTurn] Memory extraction error:', error.message);
  }

  return false;
}

/**
 * Prefetch context for topics the user might want to discuss
 * @param {string} userMessage - What the user said
 * @param {object} senior - Senior profile with interests
 */
async function prefetchTopicContext(userMessage, senior) {
  // Detect future topic hints
  const newsHints = /\b(tell me about|what's happening|any news|heard about|what do you think about)\b/i;
  const topicMatch = userMessage.match(/(?:about|happening with|news on)\s+(\w+(?:\s+\w+)?)/i);

  if (newsHints.test(userMessage) && topicMatch) {
    const topic = topicMatch[1];
    console.log(`[PostTurn] Prefetching news for topic: ${topic}`);
    try {
      await newsService.getRelevantNews(topic);
    } catch (error) {
      console.error('[PostTurn] News prefetch error:', error.message);
    }
  }

  // Prefetch news for senior's interests if they seem engaged
  if (senior?.interests?.length > 0 && userMessage.split(' ').length > 10) {
    const randomInterest = senior.interests[Math.floor(Math.random() * senior.interests.length)];
    console.log(`[PostTurn] Prefetching news for interest: ${randomInterest}`);
    try {
      await newsService.getRelevantNews(randomInterest);
    } catch (error) {
      // Silently fail - this is just prefetch
    }
  }
}

/**
 * Run all post-turn tasks (fire and forget)
 * @param {string} userMessage - What the user said
 * @param {string} assistantResponse - What Donna replied
 * @param {object} quickSignals - Signals from quick observer
 * @param {object} senior - Senior profile
 */
export async function runPostTurnTasks(userMessage, assistantResponse, quickSignals, senior) {
  const seniorId = senior?.id;
  const tasks = [];

  // Health concern extraction (if health was mentioned)
  if (quickSignals?.healthSignals?.length > 0) {
    tasks.push(extractHealthConcern(userMessage, assistantResponse, seniorId));
  }

  // Memory extraction (always try for meaningful messages)
  if (userMessage.split(' ').length >= 5) {
    tasks.push(extractAndStoreMemory(userMessage, seniorId));
  }

  // Topic prefetch (for engaged conversations)
  tasks.push(prefetchTopicContext(userMessage, senior));

  // Run all in parallel, don't wait
  Promise.all(tasks).catch(error => {
    console.error('[PostTurn] Background task error:', error.message);
  });
}

export default {
  runPostTurnTasks,
  extractHealthConcern,
  extractAndStoreMemory,
  prefetchTopicContext,
};
