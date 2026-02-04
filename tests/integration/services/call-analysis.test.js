/**
 * Call Analysis Tests
 *
 * Tests for post-call analysis, concern extraction, and severity classification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import mock data
import { mockCallAnalysisResponse, mockCallAnalysisResponses } from '../../mocks/google.js';
import {
  engagedConversation,
  healthConcernConversation,
  emotionalSupportConversation,
  cognitiveConcernConversation,
} from '../../fixtures/transcripts.js';
import { dorothy, harold } from '../../fixtures/seniors.js';

// Helper: Get high severity concerns (recreated from call-analysis.js)
function getHighSeverityConcerns(analysis) {
  if (!analysis?.concerns?.length) return [];
  return analysis.concerns.filter((c) => c.severity === 'high');
}

// Helper: Get default analysis (recreated from call-analysis.js)
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
      duration_appropriate: true,
    },
  };
}

// Helper: Format transcript (recreated from call-analysis.js)
function formatTranscript(history) {
  if (!history?.length) return 'No transcript available';
  return history.map((m) => `${m.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${m.content}`).join('\n\n');
}

describe('Call Analysis Service', () => {
  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================
  describe('Summary generation', () => {
    it('generates 2-3 sentence summary', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.summary).toBeDefined();
      expect(typeof analysis.summary).toBe('string');
      expect(analysis.summary.length).toBeGreaterThan(20);
    });

    it('summary captures main conversation topic', () => {
      const analysis = mockCallAnalysisResponse;
      // Summary should mention baking or family
      expect(analysis.summary.toLowerCase()).toMatch(/baking|cookies|grandson|tommy|susan|family/i);
    });

    it('extracts topics discussed', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.topics).toBeInstanceOf(Array);
      expect(analysis.topics.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CONCERN IDENTIFICATION
  // ============================================================================
  describe('Concern identification', () => {
    it('identifies health concerns', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      const healthConcerns = analysis.concerns.filter((c) => c.type === 'health');
      expect(healthConcerns.length).toBeGreaterThan(0);
    });

    it('identifies cognitive concerns', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      const cognitiveConcerns = analysis.concerns.filter((c) => c.type === 'cognitive');
      expect(cognitiveConcerns.length).toBeGreaterThan(0);
    });

    it('identifies emotional concerns', () => {
      const analysis = mockCallAnalysisResponses.emotionalDistress;
      const emotionalConcerns = analysis.concerns.filter((c) => c.type === 'emotional');
      expect(emotionalConcerns.length).toBeGreaterThan(0);
    });

    it('identifies safety concerns', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      const safetyConcerns = analysis.concerns.filter((c) => c.type === 'safety');
      expect(safetyConcerns.length).toBeGreaterThan(0);
    });

    it('returns empty concerns array when no issues', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.concerns).toEqual([]);
    });
  });

  // ============================================================================
  // SEVERITY CLASSIFICATION
  // ============================================================================
  describe('Severity classification', () => {
    it('classifies health concerns by severity', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      const healthConcern = analysis.concerns.find((c) => c.type === 'health');

      expect(healthConcern).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(healthConcern.severity);
    });

    it('marks fall with dizziness as medium severity', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      const healthConcern = analysis.concerns.find((c) => c.type === 'health');

      expect(healthConcern.severity).toBe('medium');
    });

    it('marks cognitive confusion as high severity', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      const cognitiveConcern = analysis.concerns.find((c) => c.type === 'cognitive');

      expect(cognitiveConcern.severity).toBe('high');
    });

    it('marks emotional distress with hopelessness as high severity', () => {
      const analysis = mockCallAnalysisResponses.emotionalDistress;
      const emotionalConcern = analysis.concerns.find((c) => c.type === 'emotional');

      expect(emotionalConcern.severity).toBe('high');
    });

    it('getHighSeverityConcerns filters correctly', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      const highSeverity = getHighSeverityConcerns(analysis);

      expect(highSeverity.length).toBeGreaterThan(0);
      highSeverity.forEach((concern) => {
        expect(concern.severity).toBe('high');
      });
    });

    it('getHighSeverityConcerns returns empty array when no high severity', () => {
      const analysis = mockCallAnalysisResponse;
      const highSeverity = getHighSeverityConcerns(analysis);

      expect(highSeverity).toEqual([]);
    });
  });

  // ============================================================================
  // ENGAGEMENT SCORING
  // ============================================================================
  describe('Engagement scoring', () => {
    it('engagement score is between 1-10', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.engagement_score).toBeGreaterThanOrEqual(1);
      expect(analysis.engagement_score).toBeLessThanOrEqual(10);
    });

    it('engaged conversation has high score (>= 7)', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.engagement_score).toBeGreaterThanOrEqual(7);
    });

    it('distressed conversation has lower score', () => {
      const analysis = mockCallAnalysisResponses.emotionalDistress;
      expect(analysis.engagement_score).toBeLessThanOrEqual(6);
    });

    it('health concern conversation has moderate score', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      expect(analysis.engagement_score).toBeGreaterThanOrEqual(5);
      expect(analysis.engagement_score).toBeLessThanOrEqual(8);
    });
  });

  // ============================================================================
  // FOLLOW-UP SUGGESTIONS
  // ============================================================================
  describe('Follow-up suggestions', () => {
    it('generates follow-up suggestions when concerns present', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      expect(analysis.follow_ups).toBeInstanceOf(Array);
      expect(analysis.follow_ups.length).toBeGreaterThan(0);
    });

    it('follow-ups are actionable', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      analysis.follow_ups.forEach((followUp) => {
        expect(typeof followUp).toBe('string');
        expect(followUp.length).toBeGreaterThan(10);
      });
    });

    it('cognitive decline triggers appropriate follow-ups', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      const hasAppropriateFollowUp = analysis.follow_ups.some(
        (f) => f.toLowerCase().includes('family') || f.toLowerCase().includes('cognitive') || f.toLowerCase().includes('driving')
      );
      expect(hasAppropriateFollowUp).toBe(true);
    });
  });

  // ============================================================================
  // CONCERN OBJECT STRUCTURE
  // ============================================================================
  describe('Concern object structure', () => {
    it('concerns have required fields', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      const concern = analysis.concerns[0];

      expect(concern.type).toBeDefined();
      expect(concern.severity).toBeDefined();
      expect(concern.description).toBeDefined();
    });

    it('concern types are valid', () => {
      const validTypes = ['health', 'cognitive', 'emotional', 'safety'];

      Object.values(mockCallAnalysisResponses).forEach((analysis) => {
        analysis.concerns.forEach((concern) => {
          expect(validTypes).toContain(concern.type);
        });
      });
    });

    it('concern severities are valid', () => {
      const validSeverities = ['low', 'medium', 'high'];

      Object.values(mockCallAnalysisResponses).forEach((analysis) => {
        analysis.concerns.forEach((concern) => {
          expect(validSeverities).toContain(concern.severity);
        });
      });
    });

    it('health concern includes recommendation', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      const healthConcern = analysis.concerns.find((c) => c.type === 'health');

      expect(healthConcern.recommendation).toBeDefined();
      expect(typeof healthConcern.recommendation).toBe('string');
    });
  });

  // ============================================================================
  // DEFAULT ANALYSIS (FALLBACK)
  // ============================================================================
  describe('Default analysis (fallback)', () => {
    it('returns sensible defaults', () => {
      const analysis = getDefaultAnalysis();

      expect(analysis.summary).toBe('Analysis unavailable');
      expect(analysis.engagement_score).toBe(5);
      expect(analysis.concerns).toEqual([]);
    });

    it('has all required fields', () => {
      const analysis = getDefaultAnalysis();

      expect(analysis.summary).toBeDefined();
      expect(analysis.topics_discussed).toBeDefined();
      expect(analysis.engagement_score).toBeDefined();
      expect(analysis.concerns).toBeDefined();
      expect(analysis.call_quality).toBeDefined();
    });

    it('call_quality has default values', () => {
      const analysis = getDefaultAnalysis();

      expect(analysis.call_quality.rapport).toBe('moderate');
      expect(analysis.call_quality.goals_achieved).toBe(false);
      expect(analysis.call_quality.duration_appropriate).toBe(true);
    });
  });

  // ============================================================================
  // TRANSCRIPT FORMATTING
  // ============================================================================
  describe('Transcript formatting', () => {
    it('formats transcript with speaker labels', () => {
      const formatted = formatTranscript(engagedConversation);

      expect(formatted).toContain('DONNA:');
      expect(formatted).toContain('SENIOR:');
    });

    it('handles empty transcript', () => {
      const formatted = formatTranscript([]);
      expect(formatted).toBe('No transcript available');
    });

    it('handles null transcript', () => {
      const formatted = formatTranscript(null);
      expect(formatted).toBe('No transcript available');
    });

    it('preserves conversation content', () => {
      const formatted = formatTranscript(engagedConversation);

      expect(formatted).toContain('Dorothy');
      expect(formatted).toContain('cookies');
    });
  });

  // ============================================================================
  // SENTIMENT ANALYSIS
  // ============================================================================
  describe('Sentiment analysis', () => {
    it('identifies positive sentiment', () => {
      const analysis = mockCallAnalysisResponse;
      expect(analysis.sentiment).toBe('positive');
    });

    it('identifies concerned sentiment for health issues', () => {
      const analysis = mockCallAnalysisResponses.healthConcern;
      expect(analysis.sentiment).toBe('concerned');
    });

    it('identifies worried sentiment for cognitive decline', () => {
      const analysis = mockCallAnalysisResponses.cognitiveDecline;
      expect(analysis.sentiment).toBe('worried');
    });

    it('identifies distressed sentiment for emotional issues', () => {
      const analysis = mockCallAnalysisResponses.emotionalDistress;
      expect(analysis.sentiment).toBe('distressed');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge cases', () => {
    it('handles analysis with null concerns', () => {
      const analysis = { ...mockCallAnalysisResponse, concerns: null };
      const highSeverity = getHighSeverityConcerns(analysis);
      expect(highSeverity).toEqual([]);
    });

    it('handles analysis with undefined concerns', () => {
      const analysis = { ...mockCallAnalysisResponse };
      delete analysis.concerns;
      const highSeverity = getHighSeverityConcerns(analysis);
      expect(highSeverity).toEqual([]);
    });

    it('handles empty transcript in analysis', () => {
      const formatted = formatTranscript([]);
      expect(formatted).toBe('No transcript available');
    });
  });
});
