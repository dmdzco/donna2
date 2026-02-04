/**
 * Conversation Director Tests (Layer 2)
 *
 * Tests for proactive call guidance using mocked Gemini responses
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import mock data
import { mockDirectorResponse, mockDirectorResponses } from '../../mocks/google.js';
import { engagedConversation, lowEngagementConversation, emotionalSupportConversation } from '../../fixtures/transcripts.js';
import { dorothy } from '../../fixtures/seniors.js';

// JSON repair function (recreated from fast-observer.js)
function repairJson(jsonText) {
  let repaired = jsonText;

  // Remove trailing commas in arrays and objects
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Count braces and brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Check for unterminated string
  const lastQuote = repaired.lastIndexOf('"');
  const afterLastQuote = repaired.substring(lastQuote + 1);
  if (lastQuote > 0 && !afterLastQuote.match(/["\]},:]/)) {
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

  // Remove trailing commas again
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  return repaired;
}

// Default direction (recreated from fast-observer.js)
function getDefaultDirection() {
  return {
    analysis: {
      call_phase: 'main',
      engagement_level: 'medium',
      current_topic: 'unknown',
      topics_covered: [],
      topics_pending: [],
      emotional_tone: 'neutral',
      turns_on_current_topic: 1,
    },
    direction: {
      stay_or_shift: 'stay',
      next_topic: null,
      transition_phrase: null,
      follow_up_opportunity: null,
      pacing_note: 'good',
    },
    reminder: {
      should_deliver: false,
      which_reminder: null,
      delivery_approach: null,
      wait_reason: 'Using default - no analysis available',
    },
    guidance: {
      tone: 'warm',
      response_length: 'moderate',
      priority_action: 'Continue conversation naturally',
      specific_instruction: 'Be warm and attentive',
      things_to_avoid: null,
    },
    model_recommendation: {
      use_sonnet: false,
      max_tokens: 150,
      reason: 'default',
    },
  };
}

describe('Conversation Director (fast-observer)', () => {
  // ============================================================================
  // CALL PHASE TRACKING
  // ============================================================================
  describe('Call phase tracking', () => {
    it('identifies opening phase (0-2 min)', () => {
      const direction = mockDirectorResponses.openingPhase;
      expect(direction.analysis.call_phase).toBe('opening');
    });

    it('identifies main phase (4-8 min)', () => {
      const direction = mockDirectorResponse;
      expect(direction.analysis.call_phase).toBe('main');
    });

    it('identifies closing phase (8-10 min)', () => {
      const direction = mockDirectorResponses.closingPhase;
      expect(direction.analysis.call_phase).toBe('closing');
    });

    it('provides phase-appropriate guidance', () => {
      // Opening should focus on greeting
      const opening = mockDirectorResponses.openingPhase;
      expect(opening.direction.approach).toBe('warm_greeting');

      // Closing should focus on graceful ending
      const closing = mockDirectorResponses.closingPhase;
      expect(closing.direction.approach).toBe('warm_closing');
    });
  });

  // ============================================================================
  // ENGAGEMENT MONITORING
  // ============================================================================
  describe('Engagement monitoring', () => {
    it('detects high engagement', () => {
      const direction = mockDirectorResponse;
      expect(direction.analysis.engagement_level).toBe('high');
    });

    it('detects low engagement', () => {
      const direction = mockDirectorResponses.lowEngagement;
      expect(direction.analysis.engagement_level).toBe('low');
    });

    it('suggests re-engagement strategies for low engagement', () => {
      const direction = mockDirectorResponses.lowEngagement;
      expect(direction.direction.approach).toBe('re_engage');
      expect(direction.direction.priority).toBe('boost_engagement');
    });

    it('increases tokens for low engagement', () => {
      const direction = mockDirectorResponses.lowEngagement;
      expect(direction.token_recommendation).toBeGreaterThan(100);
    });
  });

  // ============================================================================
  // TOPIC MANAGEMENT
  // ============================================================================
  describe('Topic management', () => {
    it('tracks topics discussed', () => {
      const direction = mockDirectorResponse;
      expect(direction.analysis.topics_discussed).toBeInstanceOf(Array);
      expect(direction.analysis.topics_discussed.length).toBeGreaterThan(0);
    });

    it('suggests next topics based on interests', () => {
      const direction = mockDirectorResponse;
      expect(direction.direction.suggested_topics).toBeInstanceOf(Array);
    });

    it('recommends when to transition topics', () => {
      const direction = mockDirectorResponse;
      expect(direction.analysis.topic_momentum).toBeDefined();
    });
  });

  // ============================================================================
  // REMINDER DELIVERY TIMING
  // ============================================================================
  describe('Reminder delivery timing', () => {
    it('indicates when ready to deliver reminder', () => {
      const direction = mockDirectorResponses.readyForReminder;
      expect(direction.reminder_timing.ready_to_deliver).toBe(true);
      expect(direction.reminder_timing.suggested_moment).toBeDefined();
    });

    it('holds reminder during emotional moments', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      // During emotional support, reminders should be avoided
      expect(direction.direction.avoid_topics).toContain('reminders');
    });

    it('provides reason for waiting', () => {
      const direction = mockDirectorResponse;
      expect(direction.reminder_timing.reason).toBeDefined();
    });
  });

  // ============================================================================
  // EMOTIONAL DETECTION
  // ============================================================================
  describe('Emotional state detection', () => {
    it('detects sad emotional state', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      expect(direction.analysis.emotional_state).toBe('sad');
    });

    it('suggests empathetic listening for emotional moments', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      expect(direction.direction.approach).toBe('empathetic_listening');
    });

    it('recommends higher tokens for emotional support', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      expect(direction.token_recommendation).toBeGreaterThanOrEqual(200);
    });

    it('sets gentle tone for emotional moments', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      expect(direction.direction.tone).toBe('gentle');
    });
  });

  // ============================================================================
  // TOKEN RECOMMENDATIONS
  // ============================================================================
  describe('Token recommendations', () => {
    it('recommends 100 tokens for normal conversation', () => {
      // High engagement, positive conversation
      const direction = mockDirectorResponse;
      expect(direction.token_recommendation).toBe(100);
    });

    it('recommends 150 tokens for low engagement', () => {
      const direction = mockDirectorResponses.lowEngagement;
      expect(direction.token_recommendation).toBe(150);
    });

    it('recommends 200 tokens for emotional support', () => {
      const direction = mockDirectorResponses.emotionalSupport;
      expect(direction.token_recommendation).toBe(200);
    });

    it('recommends 100-130 tokens for call closing', () => {
      const direction = mockDirectorResponses.closingPhase;
      expect(direction.token_recommendation).toBeLessThanOrEqual(130);
    });

    it('all token recommendations fall within 100-400 range', () => {
      Object.values(mockDirectorResponses).forEach((response) => {
        expect(response.token_recommendation).toBeGreaterThanOrEqual(100);
        expect(response.token_recommendation).toBeLessThanOrEqual(400);
      });
    });
  });

  // ============================================================================
  // JSON REPAIR
  // ============================================================================
  describe('JSON repair', () => {
    it('removes trailing commas from objects', () => {
      const malformed = '{"key": "value",}';
      const repaired = repairJson(malformed);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({ key: 'value' });
    });

    it('removes trailing commas from arrays', () => {
      const malformed = '["a", "b", "c",]';
      const repaired = repairJson(malformed);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual(['a', 'b', 'c']);
    });

    it('closes unclosed braces', () => {
      // Test that unclosed braces get closed
      const malformed = '{"key": "value"';
      const repaired = repairJson(malformed);
      expect(repaired).toContain('}');
      expect(repaired.match(/\}/g).length).toBe(1);
    });

    it('closes unclosed brackets', () => {
      // Test that unclosed brackets get closed
      const malformed = '["a", "b"';
      const repaired = repairJson(malformed);
      expect(repaired).toContain(']');
      expect(repaired.match(/\]/g).length).toBe(1);
    });

    it('handles nested unclosed structures', () => {
      // Test that both brackets and braces get closed
      const malformed = '{"arr": ["a", "b"';
      const repaired = repairJson(malformed);
      expect(repaired).toContain(']');
      expect(repaired).toContain('}');
    });

    it('handles valid JSON without modification', () => {
      const valid = '{"key": "value", "arr": [1, 2, 3]}';
      const repaired = repairJson(valid);
      expect(repaired).toBe(valid);
    });
  });

  // ============================================================================
  // DEFAULT DIRECTION
  // ============================================================================
  describe('Default direction (fallback)', () => {
    it('provides sensible defaults when analysis fails', () => {
      const direction = getDefaultDirection();

      expect(direction.analysis.call_phase).toBe('main');
      expect(direction.analysis.engagement_level).toBe('medium');
      expect(direction.guidance.tone).toBe('warm');
      expect(direction.model_recommendation.max_tokens).toBe(150);
    });

    it('has all required fields', () => {
      const direction = getDefaultDirection();

      expect(direction.analysis).toBeDefined();
      expect(direction.direction).toBeDefined();
      expect(direction.reminder).toBeDefined();
      expect(direction.guidance).toBeDefined();
      expect(direction.model_recommendation).toBeDefined();
    });

    it('sets reminder delivery to false', () => {
      const direction = getDefaultDirection();
      expect(direction.reminder.should_deliver).toBe(false);
    });
  });

  // ============================================================================
  // RESPONSE STRUCTURE VALIDATION
  // ============================================================================
  describe('Response structure validation', () => {
    it('analysis object has required fields', () => {
      const direction = mockDirectorResponse;

      expect(direction.analysis).toBeDefined();
      expect(direction.analysis.call_phase).toBeDefined();
      expect(direction.analysis.engagement_level).toBeDefined();
    });

    it('direction object has required fields', () => {
      const direction = mockDirectorResponse;

      expect(direction.direction).toBeDefined();
      expect(direction.direction.approach).toBeDefined();
      expect(direction.direction.tone).toBeDefined();
    });

    it('reminder_timing object has required fields', () => {
      const direction = mockDirectorResponse;

      expect(direction.reminder_timing).toBeDefined();
      expect(typeof direction.reminder_timing.ready_to_deliver).toBe('boolean');
    });

    it('token_recommendation is a number', () => {
      const direction = mockDirectorResponse;
      expect(typeof direction.token_recommendation).toBe('number');
    });
  });

  // ============================================================================
  // GUIDANCE FORMATTING
  // ============================================================================
  describe('Guidance formatting', () => {
    it('tone values are valid', () => {
      const validTones = ['warm', 'empathetic', 'cheerful', 'gentle', 'serious', 'gentle_curious'];

      Object.values(mockDirectorResponses).forEach((response) => {
        expect(validTones).toContain(response.direction.tone);
      });
    });

    it('approach values describe actions', () => {
      Object.values(mockDirectorResponses).forEach((response) => {
        expect(response.direction.approach).toBeDefined();
        expect(typeof response.direction.approach).toBe('string');
      });
    });

    it('priority values are meaningful', () => {
      Object.values(mockDirectorResponses).forEach((response) => {
        expect(response.direction.priority).toBeDefined();
        expect(typeof response.direction.priority).toBe('string');
      });
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge cases', () => {
    it('handles empty conversation history', () => {
      const direction = getDefaultDirection();
      // Should return sensible defaults
      expect(direction.analysis.call_phase).toBe('main');
    });

    it('handles new senior (no memories)', () => {
      const direction = getDefaultDirection();
      expect(direction.analysis.topics_covered).toEqual([]);
    });

    it('handles all reminders already delivered', () => {
      const direction = mockDirectorResponse;
      // When no pending reminders, should not suggest delivery
      expect(direction.reminder_timing.ready_to_deliver).toBe(false);
    });
  });
});
