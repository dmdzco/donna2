/**
 * Context Cache Service
 *
 * Pre-caches senior context early in their timezone day so it's ready
 * for calls (whether inbound or outbound).
 *
 * Cached data:
 * - Recent call summaries
 * - Critical memories (Tier 1)
 * - Important memories (with decay applied)
 * - Pre-generated greeting
 */

import { memoryService } from './memory.js';
import { conversationService } from './conversations.js';
import { seniorService } from './seniors.js';

// In-memory cache (could be Redis for multi-instance deployments)
const cache = new Map();

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Pre-fetch hour in local timezone (5 AM)
const PREFETCH_HOUR = 5;

/**
 * Get local hour for a timezone
 */
function getLocalHour(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'America/New_York',
      hour: 'numeric',
      hour12: false
    });
    return parseInt(formatter.format(now), 10);
  } catch (e) {
    // Default to EST if timezone invalid
    return new Date().getUTCHours() - 5;
  }
}

/**
 * Generate time-appropriate greeting
 */
function generateGreeting(senior, localHour) {
  const firstName = senior?.name?.split(' ')[0] || 'there';

  let timeGreeting;
  if (localHour >= 5 && localHour < 12) {
    timeGreeting = 'Good morning';
  } else if (localHour >= 12 && localHour < 17) {
    timeGreeting = 'Good afternoon';
  } else {
    timeGreeting = 'Good evening';
  }

  return `${timeGreeting}, ${firstName}! It's Donna. How are you doing today?`;
}

/**
 * Pre-fetch and cache context for a senior
 */
async function prefetchAndCache(seniorId) {
  const startTime = Date.now();

  try {
    // Get senior profile
    const senior = await seniorService.getById(seniorId);
    if (!senior) {
      console.log(`[ContextCache] Senior ${seniorId} not found, skipping`);
      return null;
    }

    // Fetch all context in parallel
    const [summaries, criticalMemories, importantMemories] = await Promise.all([
      conversationService.getRecentSummaries(seniorId, 3),
      memoryService.getCritical(seniorId, 3),
      memoryService.getImportant(seniorId, 5)
    ]);

    // Generate greeting based on current local time
    const localHour = getLocalHour(senior.timezone);
    const greeting = generateGreeting(senior, localHour);

    // Build memory context string (Tier 1 + important)
    const memoryParts = [];
    if (criticalMemories.length > 0) {
      memoryParts.push('Critical to know:');
      criticalMemories.forEach(m => memoryParts.push(`- ${m.content}`));
    }
    if (importantMemories.length > 0) {
      // Filter out duplicates from critical
      const criticalIds = new Set(criticalMemories.map(m => m.id));
      const unique = importantMemories.filter(m => !criticalIds.has(m.id));
      if (unique.length > 0) {
        const groups = memoryService.groupByType(unique);
        const formatted = memoryService.formatGroupedMemories(groups);
        memoryParts.push('\nBackground:\n' + formatted);
      }
    }

    const cachedContext = {
      seniorId,
      senior,
      summaries,
      criticalMemories,
      importantMemories,
      memoryContext: memoryParts.join('\n'),
      greeting,
      cachedAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    cache.set(seniorId, cachedContext);

    const elapsed = Date.now() - startTime;
    console.log(`[ContextCache] Pre-cached context for ${senior.name} in ${elapsed}ms`);

    return cachedContext;
  } catch (error) {
    console.error(`[ContextCache] Error pre-caching ${seniorId}:`, error.message);
    return null;
  }
}

/**
 * Get cached context for a senior
 * Returns null if not cached or expired
 */
function getCache(seniorId) {
  const cached = cache.get(seniorId);

  if (!cached) {
    return null;
  }

  // Check expiration
  if (Date.now() > cached.expiresAt) {
    cache.delete(seniorId);
    console.log(`[ContextCache] Cache expired for ${seniorId}`);
    return null;
  }

  console.log(`[ContextCache] Cache hit for ${seniorId} (age: ${Math.round((Date.now() - cached.cachedAt) / 60000)} min)`);
  return cached;
}

/**
 * Clear cache for a senior (e.g., after a call ends and new memories are stored)
 */
function clearCache(seniorId) {
  if (cache.has(seniorId)) {
    cache.delete(seniorId);
    console.log(`[ContextCache] Cleared cache for ${seniorId}`);
  }
}

/**
 * Clear all caches
 */
function clearAll() {
  const count = cache.size;
  cache.clear();
  console.log(`[ContextCache] Cleared all ${count} cached contexts`);
}

/**
 * Run daily pre-fetch for seniors whose local time is at PREFETCH_HOUR
 * Called hourly by scheduler
 */
async function runDailyPrefetch() {
  console.log('[ContextCache] Running daily pre-fetch check...');

  try {
    // Get all seniors
    const seniors = await seniorService.list();

    let prefetchedCount = 0;
    for (const senior of seniors) {
      const localHour = getLocalHour(senior.timezone);

      // Pre-fetch if it's 5 AM in their timezone
      if (localHour === PREFETCH_HOUR) {
        await prefetchAndCache(senior.id);
        prefetchedCount++;
      }
    }

    if (prefetchedCount > 0) {
      console.log(`[ContextCache] Pre-fetched context for ${prefetchedCount} seniors`);
    }
  } catch (error) {
    console.error('[ContextCache] Daily pre-fetch error:', error.message);
  }
}

/**
 * Get cache stats
 */
function getStats() {
  const now = Date.now();
  let validCount = 0;
  let expiredCount = 0;

  for (const [id, cached] of cache) {
    if (now > cached.expiresAt) {
      expiredCount++;
    } else {
      validCount++;
    }
  }

  return {
    total: cache.size,
    valid: validCount,
    expired: expiredCount
  };
}

export const contextCacheService = {
  prefetchAndCache,
  getCache,
  clearCache,
  clearAll,
  runDailyPrefetch,
  getStats,
  getLocalHour,
  generateGreeting
};

export default contextCacheService;
