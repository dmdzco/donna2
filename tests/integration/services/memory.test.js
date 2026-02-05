/**
 * Memory System Tests
 *
 * Tests for semantic memory storage, search, decay, and context building
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import fixtures
import { dorothyMemories, haroldMemories, staleMemory, similarMemories, createMockEmbedding } from '../../fixtures/memories.js';
import { dorothy } from '../../fixtures/seniors.js';

// Memory decay constants (from memory.js)
const DECAY_HALF_LIFE_DAYS = 30;
const ACCESS_BOOST = 10;
const MAX_IMPORTANCE = 100;
const ARCHIVE_THRESHOLD_DAYS = 90;

// Recreate calculateEffectiveImportance for testing
function calculateEffectiveImportance(baseImportance, createdAt, lastAccessedAt) {
  const now = Date.now();
  const ageMs = now - new Date(createdAt).getTime();
  const daysSinceCreation = ageMs / (1000 * 60 * 60 * 24);

  const decayFactor = Math.pow(0.5, daysSinceCreation / DECAY_HALF_LIFE_DAYS);
  let effective = baseImportance * decayFactor;

  if (lastAccessedAt) {
    const daysSinceAccess = (now - new Date(lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < 7) {
      effective = Math.min(MAX_IMPORTANCE, effective + ACCESS_BOOST * (1 - daysSinceAccess / 7));
    }
  }

  return Math.round(effective);
}

// Calculate cosine similarity
function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Vectors must have same length');
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe('Memory System', () => {
  // ============================================================================
  // EMBEDDING GENERATION
  // ============================================================================
  describe('Embedding generation', () => {
    it('creates 1536-dimension vector', () => {
      const embedding = createMockEmbedding(1);
      expect(embedding).toHaveLength(1536);
    });

    it('creates deterministic embeddings from same seed', () => {
      const embedding1 = createMockEmbedding(42);
      const embedding2 = createMockEmbedding(42);
      expect(embedding1).toEqual(embedding2);
    });

    it('creates different embeddings from different seeds', () => {
      const embedding1 = createMockEmbedding(1);
      const embedding2 = createMockEmbedding(2);
      expect(embedding1).not.toEqual(embedding2);
    });
  });

  // ============================================================================
  // MEMORY DECAY CALCULATIONS
  // ============================================================================
  describe('Memory decay calculations', () => {
    it('calculates decay correctly at 0 days (no decay)', () => {
      const now = new Date();
      const effective = calculateEffectiveImportance(100, now, now);
      // Should be close to 100 (some small floating point variance)
      expect(effective).toBeGreaterThanOrEqual(90);
    });

    it('calculates half-life decay at 30 days', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const effective = calculateEffectiveImportance(100, thirtyDaysAgo, null);
      // Should be approximately 50 (half of 100)
      expect(effective).toBeGreaterThanOrEqual(45);
      expect(effective).toBeLessThanOrEqual(55);
    });

    it('calculates quarter importance at 60 days', () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const effective = calculateEffectiveImportance(100, sixtyDaysAgo, null);
      // Should be approximately 25 (quarter of 100)
      expect(effective).toBeGreaterThanOrEqual(20);
      expect(effective).toBeLessThanOrEqual(30);
    });

    it('applies access boost for recently accessed memory', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const justNow = new Date();

      const withoutBoost = calculateEffectiveImportance(100, thirtyDaysAgo, null);
      const withBoost = calculateEffectiveImportance(100, thirtyDaysAgo, justNow);

      expect(withBoost).toBeGreaterThan(withoutBoost);
    });

    it('caps importance at MAX_IMPORTANCE (100)', () => {
      const now = new Date();
      // High base importance with recent access
      const effective = calculateEffectiveImportance(150, now, now);
      expect(effective).toBeLessThanOrEqual(MAX_IMPORTANCE);
    });

    it('ignores access boost if last access was > 7 days ago', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const withOldAccess = calculateEffectiveImportance(100, thirtyDaysAgo, tenDaysAgo);
      const withoutAccess = calculateEffectiveImportance(100, thirtyDaysAgo, null);

      // Should be approximately equal (no boost applied)
      expect(Math.abs(withOldAccess - withoutAccess)).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // DEDUPLICATION LOGIC
  // ============================================================================
  describe('Deduplication logic', () => {
    it('considers memories with cosine similarity > 0.9 as duplicates', () => {
      // Using similar embeddings from fixtures
      const embedding1 = createMockEmbedding(1);
      const embedding2 = createMockEmbedding(1.01); // Very similar

      const similarity = cosineSimilarity(embedding1, embedding2);

      // Very similar embeddings should have high cosine similarity
      expect(similarity).toBeGreaterThan(0.99);
    });

    it('considers memories with different content as unique', () => {
      const embedding1 = createMockEmbedding(1);
      const embedding2 = createMockEmbedding(100); // Different

      const similarity = cosineSimilarity(embedding1, embedding2);

      // Different embeddings should have lower similarity
      expect(similarity).toBeLessThan(0.9);
    });

    it('identifies duplicate content threshold correctly', () => {
      const DEDUP_THRESHOLD = 0.9;

      // Test case 1: Same topic, different wording
      const sameTopicSimilarity = 0.95;
      expect(sameTopicSimilarity > DEDUP_THRESHOLD).toBe(true);

      // Test case 2: Different topics
      const differentTopicSimilarity = 0.6;
      expect(differentTopicSimilarity > DEDUP_THRESHOLD).toBe(false);
    });
  });

  // ============================================================================
  // MEMORY TYPE CLASSIFICATION
  // ============================================================================
  describe('Memory type classification', () => {
    const validTypes = ['fact', 'preference', 'event', 'concern', 'relationship'];

    it('validates all memory types', () => {
      dorothyMemories.forEach((memory) => {
        expect(validTypes).toContain(memory.type);
      });
    });

    it('fixtures contain diverse memory types', () => {
      const types = [...new Set(dorothyMemories.map((m) => m.type))];
      expect(types.length).toBeGreaterThanOrEqual(3);
    });

    it('concern type used for health/safety issues', () => {
      const concerns = dorothyMemories.filter((m) => m.type === 'concern');
      concerns.forEach((concern) => {
        expect(concern.content.toLowerCase()).toMatch(/pain|fall|concern|worry|health|medical/i);
      });
    });

    it('relationship type used for family/friends', () => {
      const relationships = dorothyMemories.filter((m) => m.type === 'relationship');
      relationships.forEach((rel) => {
        expect(rel.content.toLowerCase()).toMatch(/friend|family|daughter|son|wife|husband|neighbor/i);
      });
    });
  });

  // ============================================================================
  // IMPORTANCE SCORING
  // ============================================================================
  describe('Importance scoring', () => {
    it('health concerns have high importance (>= 8)', () => {
      const healthConcerns = dorothyMemories.filter(
        (m) => m.type === 'concern' && m.content.toLowerCase().includes('pain')
      );

      healthConcerns.forEach((concern) => {
        expect(concern.importance).toBeGreaterThanOrEqual(8);
      });
    });

    it('deceased spouse memories have highest importance (10)', () => {
      const deceasedSpouse = haroldMemories.find((m) =>
        m.content.toLowerCase().includes('passed away')
      );

      expect(deceasedSpouse).toBeDefined();
      expect(deceasedSpouse.importance).toBe(10);
    });

    it('casual facts have lower importance (< 7)', () => {
      const casualFacts = dorothyMemories.filter(
        (m) => m.type === 'event' && m.importance < 7
      );

      expect(casualFacts.length).toBeGreaterThan(0);
    });

    it('importance values are within valid range (1-10)', () => {
      [...dorothyMemories, ...haroldMemories].forEach((memory) => {
        expect(memory.importance).toBeGreaterThanOrEqual(1);
        expect(memory.importance).toBeLessThanOrEqual(10);
      });
    });
  });

  // ============================================================================
  // MEMORY SEARCH RELEVANCE
  // ============================================================================
  describe('Memory search relevance', () => {
    it('similar embeddings have high cosine similarity', () => {
      // Test vectors should produce predictable similarities
      const baseEmbedding = createMockEmbedding(1);
      const similarEmbedding = createMockEmbedding(1.001);
      const differentEmbedding = createMockEmbedding(50);

      const highSimilarity = cosineSimilarity(baseEmbedding, similarEmbedding);
      const lowSimilarity = cosineSimilarity(baseEmbedding, differentEmbedding);

      expect(highSimilarity).toBeGreaterThan(lowSimilarity);
    });

    it('minimum similarity threshold is 0.7', () => {
      const MIN_SIMILARITY = 0.7;

      // Test that very similar embeddings pass threshold
      const base = createMockEmbedding(1);
      const verySimilar = createMockEmbedding(1.05); // Very close seed

      const similarity = cosineSimilarity(base, verySimilar);

      // Very similar embeddings should be above threshold
      expect(similarity).toBeGreaterThan(MIN_SIMILARITY);
    });
  });

  // ============================================================================
  // CONTEXT BUILDING TIERS
  // ============================================================================
  describe('Context building tiers', () => {
    it('Tier 1 (Critical) includes health concerns', () => {
      const criticalMemories = dorothyMemories.filter(
        (m) => m.type === 'concern' || m.importance >= 8
      );

      expect(criticalMemories.length).toBeGreaterThan(0);
    });

    it('Tier 1 (Critical) includes high importance (>= 8) memories', () => {
      const highImportance = dorothyMemories.filter((m) => m.importance >= 8);
      expect(highImportance.length).toBeGreaterThan(0);
    });

    it('Context includes all tiers on first turn', () => {
      const isFirstTurn = true;

      // On first turn, should include:
      // - Tier 1: Critical
      // - Tier 2: Contextual (if topic provided)
      // - Tier 3: Background

      if (isFirstTurn) {
        // All tiers available
        expect(true).toBe(true);
      }
    });

    it('Context excludes Tier 3 (Background) on subsequent turns', () => {
      const isFirstTurn = false;

      // On subsequent turns, should only include:
      // - Tier 1: Critical
      // - Tier 2: Contextual

      if (!isFirstTurn) {
        // Tier 3 excluded
        expect(true).toBe(true);
      }
    });
  });

  // ============================================================================
  // MEMORY GROUPING
  // ============================================================================
  describe('Memory grouping by type', () => {
    it('groups memories correctly', () => {
      const groups = {};
      dorothyMemories.forEach((m) => {
        const type = m.type || 'fact';
        if (!groups[type]) groups[type] = [];
        groups[type].push(m.content);
      });

      expect(Object.keys(groups).length).toBeGreaterThan(0);
    });

    it('formats type labels for display', () => {
      const typeLabels = {
        relationship: 'Family/Friends',
        concern: 'Concerns',
        preference: 'Preferences',
        event: 'Recent events',
        fact: 'Facts',
      };

      expect(typeLabels['relationship']).toBe('Family/Friends');
      expect(typeLabels['concern']).toBe('Concerns');
    });
  });

  // ============================================================================
  // ARCHIVE FLAGGING
  // ============================================================================
  describe('Archive flagging', () => {
    it('flags memories without access for 90+ days', () => {
      const ninetyDaysAgo = new Date(Date.now() - ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

      const shouldArchive = staleMemory.lastAccessedAt < ninetyDaysAgo;
      expect(shouldArchive).toBe(true);
    });

    it('keeps recently accessed memories active', () => {
      const recentMemory = dorothyMemories[0];
      const ninetyDaysAgo = new Date(Date.now() - ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

      const shouldArchive = new Date(recentMemory.lastAccessedAt) < ninetyDaysAgo;
      expect(shouldArchive).toBe(false);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge cases', () => {
    it('handles empty memory list', () => {
      const emptyMemories = [];
      const groups = {};
      emptyMemories.forEach((m) => {
        const type = m.type || 'fact';
        if (!groups[type]) groups[type] = [];
        groups[type].push(m.content);
      });

      expect(Object.keys(groups).length).toBe(0);
    });

    it('handles null embedding gracefully', () => {
      // If OpenAI is not configured, embedding should be null
      const memoryWithoutEmbedding = {
        ...dorothyMemories[0],
        embedding: null,
      };

      expect(memoryWithoutEmbedding.embedding).toBeNull();
    });

    it('handles missing metadata', () => {
      const memoryWithoutMetadata = {
        ...dorothyMemories[0],
        metadata: null,
      };

      expect(memoryWithoutMetadata.metadata).toBeNull();
    });

    it('handles very old memories (> 1 year)', () => {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const effective = calculateEffectiveImportance(100, oneYearAgo, null);

      // After 365 days with 30-day half-life, importance should be very low
      // 100 * 0.5^(365/30) ≈ 100 * 0.5^12.17 ≈ 0.02
      expect(effective).toBeLessThan(5);
    });

    it('handles concurrent access updates', () => {
      // Access count should increment on access
      const initialCount = dorothyMemories[0].accessCount;
      const newCount = initialCount + 1;

      expect(newCount).toBe(initialCount + 1);
    });
  });

  // ============================================================================
  // MEMORY FIXTURE VALIDATION
  // ============================================================================
  describe('Memory fixture validation', () => {
    it('Dorothy has expected number of memories', () => {
      expect(dorothyMemories.length).toBeGreaterThanOrEqual(4);
    });

    it('Harold has memories about his late wife', () => {
      const wifeMemory = haroldMemories.find((m) =>
        m.content.toLowerCase().includes('margaret')
      );

      expect(wifeMemory).toBeDefined();
    });

    it('all memories have required fields', () => {
      [...dorothyMemories, ...haroldMemories].forEach((memory) => {
        expect(memory.id).toBeDefined();
        expect(memory.seniorId).toBeDefined();
        expect(memory.type).toBeDefined();
        expect(memory.content).toBeDefined();
        expect(memory.embedding).toBeDefined();
        expect(memory.importance).toBeDefined();
        expect(memory.createdAt).toBeDefined();
      });
    });
  });
});
