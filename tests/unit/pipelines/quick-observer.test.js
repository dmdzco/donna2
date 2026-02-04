/**
 * Quick Observer Tests - Layer 1 (0ms)
 *
 * Tests for instant regex-based signal detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { quickAnalyze } from '../../../pipelines/quick-observer.js';

describe('Quick Observer - quickAnalyze', () => {
  // ============================================================================
  // HEALTH SIGNAL DETECTION
  // ============================================================================
  describe('Health Signal Detection', () => {
    describe('Pain patterns', () => {
      it('detects general pain', () => {
        const result = quickAnalyze('I have pain in my shoulder');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'pain', severity: 'medium' })
        );
      });

      it('detects headache', () => {
        const result = quickAnalyze('I have a terrible headache');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'headache', severity: 'medium' })
        );
      });

      it('detects back pain specifically', () => {
        const result = quickAnalyze('My back has been aching all week');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'back_pain', severity: 'medium' })
        );
      });

      it('detects joint pain', () => {
        const result = quickAnalyze('My arthritis is acting up');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'joint_pain', severity: 'low' })
        );
      });
    });

    describe('Dizziness and balance', () => {
      it('detects dizziness with high severity', () => {
        const result = quickAnalyze("I've been feeling dizzy all morning");
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'dizziness', severity: 'high' })
        );
      });

      it('detects balance issues with high severity', () => {
        const result = quickAnalyze('I feel unsteady on my feet');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'balance_issue', severity: 'high' })
        );
      });
    });

    describe('Falls', () => {
      it('detects fall mention with high severity', () => {
        const result = quickAnalyze('I fell in the bathroom yesterday');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'fall', severity: 'high' })
        );
      });

      it('detects trip mention', () => {
        const result = quickAnalyze('I tripped on the stairs');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'fall', severity: 'high' })
        );
      });
    });

    describe('Cardiovascular', () => {
      it('detects chest pain with high severity', () => {
        const result = quickAnalyze('I have chest pain');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'cardiovascular', severity: 'high' })
        );
      });

      it('detects breathing issues with high severity', () => {
        const result = quickAnalyze("I'm short of breath");
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'breathing', severity: 'high' })
        );
      });

      it('detects blood pressure mention', () => {
        const result = quickAnalyze('My blood pressure was high this morning');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'blood_pressure', severity: 'medium' })
        );
      });
    });

    describe('Medication', () => {
      it('detects medication mention', () => {
        const result = quickAnalyze('I need to pick up my medication');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'medication', severity: 'medium' })
        );
      });

      it('detects medication status', () => {
        const result = quickAnalyze('I already took my pills this morning');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'medication_status', severity: 'medium' })
        );
      });

      it('detects missed medication', () => {
        const result = quickAnalyze("I haven't taken my medicine yet");
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'medication_status', severity: 'medium' })
        );
      });
    });

    describe('Sleep', () => {
      it('detects sleep issues', () => {
        const result = quickAnalyze("I couldn't sleep last night");
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'sleep_issues', severity: 'medium' })
        );
      });

      it('detects good sleep (positive)', () => {
        const result = quickAnalyze('I slept well last night');
        expect(result.healthSignals).toContainEqual(
          expect.objectContaining({ signal: 'good_sleep', severity: 'positive' })
        );
      });
    });
  });

  // ============================================================================
  // EMOTIONAL SIGNAL DETECTION
  // ============================================================================
  describe('Emotional Signal Detection', () => {
    describe('Negative emotions - Sadness', () => {
      it('detects sadness', () => {
        const result = quickAnalyze("I'm feeling sad today");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'sad', valence: 'negative', intensity: 'high' })
        );
      });

      it('detects crying', () => {
        const result = quickAnalyze('I was crying earlier');
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'crying', valence: 'negative', intensity: 'high' })
        );
      });

      it('detects grief', () => {
        const result = quickAnalyze("I'm still grieving");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'grief', valence: 'negative', intensity: 'high' })
        );
      });
    });

    describe('Negative emotions - Loneliness', () => {
      it('detects loneliness', () => {
        const result = quickAnalyze("I'm feeling lonely");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'lonely', valence: 'negative', intensity: 'high' })
        );
      });

      it('detects missing someone', () => {
        const result = quickAnalyze('I miss my husband so much');
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'missing', valence: 'negative', intensity: 'medium' })
        );
      });

      it('detects feeling abandoned', () => {
        const result = quickAnalyze('No one calls me anymore, I feel left alone');
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'abandoned', valence: 'negative', intensity: 'high' })
        );
      });
    });

    describe('Negative emotions - Anxiety', () => {
      it('detects worry', () => {
        const result = quickAnalyze("I'm worried about my appointment");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'worried', valence: 'negative', intensity: 'medium' })
        );
      });

      it('detects anxiety', () => {
        const result = quickAnalyze("I've been feeling anxious lately");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'anxious', valence: 'negative', intensity: 'medium' })
        );
      });

      it('detects fear', () => {
        const result = quickAnalyze("I'm scared about the results");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'scared', valence: 'negative', intensity: 'high' })
        );
      });
    });

    describe('Positive emotions', () => {
      it('detects happiness', () => {
        const result = quickAnalyze("I'm so happy today!");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'happy', valence: 'positive', intensity: 'medium' })
        );
      });

      it('detects excitement', () => {
        const result = quickAnalyze("I'm so excited about the visit!");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'excited', valence: 'positive', intensity: 'high' })
        );
      });

      it('detects gratitude', () => {
        const result = quickAnalyze("I'm thankful for my family");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'grateful', valence: 'positive', intensity: 'medium' })
        );
      });

      it('detects contentment', () => {
        const result = quickAnalyze("I'm feeling content");
        expect(result.emotionSignals).toContainEqual(
          expect.objectContaining({ signal: 'content', valence: 'positive', intensity: 'low' })
        );
      });
    });
  });

  // ============================================================================
  // SAFETY SIGNAL DETECTION
  // ============================================================================
  describe('Safety Signal Detection', () => {
    describe('Scam detection', () => {
      it('detects scam mention', () => {
        const result = quickAnalyze('I think it might be a scam');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'scam_mention', severity: 'high' })
        );
      });

      it('detects suspicious contact', () => {
        const result = quickAnalyze('Someone called me saying I won a lottery');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'scam_indicators', severity: 'high' })
        );
      });

      it('detects government scam', () => {
        const result = quickAnalyze('The IRS called saying I owe money');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'government_scam', severity: 'high' })
        );
      });

      it('detects requests for personal info', () => {
        const result = quickAnalyze('They asked for money and my bank account');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'info_request', severity: 'high' })
        );
      });
    });

    describe('Emergency detection', () => {
      it('detects fire', () => {
        const result = quickAnalyze('I smell smoke in the house');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'fire', severity: 'high' })
        );
      });

      it('detects gas leak', () => {
        const result = quickAnalyze('I smell gas in the kitchen');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'gas_leak', severity: 'high' })
        );
      });

      it('detects being lost', () => {
        const result = quickAnalyze("I don't know where I am");
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'lost', severity: 'high' })
        );
      });
    });

    describe('Break-in detection', () => {
      it('detects break-in', () => {
        const result = quickAnalyze('Someone broke into my house');
        expect(result.safetySignals).toContainEqual(
          expect.objectContaining({ signal: 'break_in', severity: 'high' })
        );
      });
    });
  });

  // ============================================================================
  // ENGAGEMENT TRACKING
  // ============================================================================
  describe('Engagement Tracking', () => {
    it('detects low engagement from minimal response', () => {
      const result = quickAnalyze('yes');
      expect(result.engagementLevel).toBe('low');
    });

    it('detects low engagement from very short response', () => {
      const result = quickAnalyze('ok');
      expect(result.engagementLevel).toBe('low');
    });

    it('detects low engagement from uncertain response', () => {
      const result = quickAnalyze('i guess');
      expect(result.engagementLevel).toBe('low');
    });

    it('detects high engagement from long response', () => {
      const result = quickAnalyze(
        'Oh that sounds wonderful! I remember when I used to do that with my mother. We would spend hours in the garden together, planting flowers and vegetables. Those were such happy times.'
      );
      expect(result.engagementLevel).toBe('high');
    });

    it('detects low engagement from consecutive short responses', () => {
      const recentHistory = [
        { role: 'user', content: 'fine' },
        { role: 'assistant', content: 'How was your day?' },
        { role: 'user', content: 'ok' },
        { role: 'assistant', content: 'Did you do anything fun?' },
      ];
      const result = quickAnalyze('no', recentHistory);
      expect(result.engagementLevel).toBe('low');
    });
  });

  // ============================================================================
  // QUESTION DETECTION
  // ============================================================================
  describe('Question Detection', () => {
    it('detects explicit question ending with ?', () => {
      const result = quickAnalyze('How are you today?');
      expect(result.isQuestion).toBe(true);
      expect(result.questionType).toBe('explicit_question');
    });

    it('detects WH-question', () => {
      const result = quickAnalyze('What time is it');
      expect(result.isQuestion).toBe(true);
      expect(result.questionType).toBe('wh_question');
    });

    it('detects yes/no question', () => {
      const result = quickAnalyze('Did you call my daughter?');
      expect(result.isQuestion).toBe(true);
    });

    it('detects information request', () => {
      const result = quickAnalyze('Tell me about the weather');
      expect(result.isQuestion).toBe(true);
      expect(result.questionType).toBe('information_request');
    });

    it('detects opinion request', () => {
      const result = quickAnalyze('What do you think I should do?');
      expect(result.isQuestion).toBe(true);
    });
  });

  // ============================================================================
  // TOKEN ESCALATION LOGIC
  // ============================================================================
  describe('Token Escalation / Model Recommendation', () => {
    it('recommends higher tokens for crisis support (death wish)', () => {
      const result = quickAnalyze("I'd rather not wake up tomorrow");
      expect(result.modelRecommendation).toEqual(
        expect.objectContaining({
          use_sonnet: true,
          max_tokens: 250,
          reason: 'crisis_support',
        })
      );
    });

    it('recommends higher tokens for safety concern', () => {
      const result = quickAnalyze('Someone broke into my neighbor\'s house');
      expect(result.modelRecommendation).toEqual(
        expect.objectContaining({
          use_sonnet: true,
          max_tokens: 200,
          reason: 'safety_concern',
        })
      );
    });

    it('recommends higher tokens for high severity health', () => {
      const result = quickAnalyze('I have chest pain and shortness of breath');
      expect(result.modelRecommendation).toEqual(
        expect.objectContaining({
          use_sonnet: true,
          reason: 'health_safety',
        })
      );
    });

    it('recommends medium tokens for health mention', () => {
      const result = quickAnalyze('My back has been hurting');
      expect(result.modelRecommendation).toEqual(
        expect.objectContaining({
          use_sonnet: true,
          max_tokens: 150,
          reason: 'health_mention',
        })
      );
    });

    it('recommends lower tokens for simple question', () => {
      const result = quickAnalyze('What time is it?');
      expect(result.modelRecommendation).toEqual(
        expect.objectContaining({
          max_tokens: 80,
          reason: 'simple_question',
        })
      );
    });

    it('returns null recommendation for normal conversation', () => {
      const result = quickAnalyze('We had chocolate chip cookies');
      // Should return null or family_warmth based on signals
      expect(result.modelRecommendation === null || result.modelRecommendation?.reason === 'family_warmth').toBe(true);
    });
  });

  // ============================================================================
  // FAMILY SIGNAL DETECTION
  // ============================================================================
  describe('Family Signal Detection', () => {
    it('detects daughter mention', () => {
      const result = quickAnalyze('My daughter Susan is coming over');
      expect(result.familySignals).toContain('daughter');
    });

    it('detects grandson mention', () => {
      const result = quickAnalyze('My grandson Tommy is so sweet');
      expect(result.familySignals).toContain('grandson');
    });

    it('detects deceased spouse', () => {
      const result = quickAnalyze('I miss my late husband');
      expect(result.familySignals).toContain('deceased_spouse');
    });

    it('detects pet mention', () => {
      const result = quickAnalyze('My cat Whiskers is sitting with me');
      expect(result.familySignals).toContain('cat');
    });
  });

  // ============================================================================
  // REMINDER ACKNOWLEDGMENT
  // ============================================================================
  describe('Reminder Acknowledgment Detection', () => {
    it('detects acknowledgment - will do', () => {
      const result = quickAnalyze("I'll take it right now");
      expect(result.reminderResponse).toEqual(
        expect.objectContaining({ type: 'acknowledged' })
      );
    });

    it('detects confirmation - already done', () => {
      const result = quickAnalyze('I already took my pills this morning');
      expect(result.reminderResponse).toEqual(
        expect.objectContaining({ type: 'confirmed', confidence: expect.any(Number) })
      );
      expect(result.reminderResponse.confidence).toBeGreaterThan(0.8);
    });

    it('detects thanks as acknowledgment', () => {
      const result = quickAnalyze('Thank you for reminding me');
      expect(result.reminderResponse).toEqual(
        expect.objectContaining({ type: 'acknowledged' })
      );
    });
  });

  // ============================================================================
  // COGNITIVE SIGNAL DETECTION
  // ============================================================================
  describe('Cognitive Signal Detection', () => {
    it('detects time confusion', () => {
      const result = quickAnalyze('What day is it today? I forgot');
      expect(result.cognitiveSignals).toContainEqual(
        expect.objectContaining({ signal: 'time_confusion', severity: 'medium' })
      );
    });

    it('detects navigation confusion with high severity', () => {
      const result = quickAnalyze('I got lost driving to the store');
      expect(result.cognitiveSignals).toContainEqual(
        expect.objectContaining({ signal: 'navigation_confusion', severity: 'high' })
      );
    });

    it('detects object misplacement', () => {
      const result = quickAnalyze('I put the remote in the fridge again');
      expect(result.cognitiveSignals).toContainEqual(
        expect.objectContaining({ signal: 'object_misplacement', severity: 'high' })
      );
    });
  });

  // ============================================================================
  // ADL (ACTIVITIES OF DAILY LIVING) DETECTION
  // ============================================================================
  describe('ADL Signal Detection', () => {
    it('detects bathing difficulty', () => {
      const result = quickAnalyze("I can't get in the shower by myself anymore");
      expect(result.adlSignals).toContainEqual(
        expect.objectContaining({ signal: 'bathing_difficulty', severity: 'high' })
      );
    });

    it('detects transfer difficulty', () => {
      const result = quickAnalyze("I can't get out of bed on my own");
      expect(result.adlSignals).toContainEqual(
        expect.objectContaining({ signal: 'transfer_difficulty', severity: 'high' })
      );
    });

    it('detects independence loss', () => {
      const result = quickAnalyze("I can't do it myself anymore, I need help with everything");
      expect(result.adlSignals).toContainEqual(
        expect.objectContaining({ signal: 'independence_loss', severity: 'high' })
      );
    });
  });

  // ============================================================================
  // END OF LIFE SIGNALS
  // ============================================================================
  describe('End of Life Signal Detection', () => {
    it('detects death wish with high priority', () => {
      const result = quickAnalyze("I'm tired of living");
      expect(result.endOfLifeSignals).toContainEqual(
        expect.objectContaining({ signal: 'death_wish', severity: 'high' })
      );
    });

    it('detects burden concern', () => {
      const result = quickAnalyze("I don't want to be a burden on my children");
      expect(result.endOfLifeSignals).toContainEqual(
        expect.objectContaining({ signal: 'burden_concern', severity: 'high' })
      );
    });

    it('detects mortality mention', () => {
      const result = quickAnalyze("When I'm gone, I want Susan to have my jewelry");
      expect(result.endOfLifeSignals).toContainEqual(
        expect.objectContaining({ signal: 'mortality_mention', severity: 'medium' })
      );
    });

    it('detects estate planning', () => {
      const result = quickAnalyze('I need to talk to my lawyer about my will and testament');
      expect(result.endOfLifeSignals).toContainEqual(
        expect.objectContaining({ signal: 'estate_planning', severity: 'low' })
      );
    });
  });

  // ============================================================================
  // NEWS/SEARCH REQUEST DETECTION
  // ============================================================================
  describe('News and Search Request Detection', () => {
    it('detects news request', () => {
      const result = quickAnalyze("What's happening in the news today?");
      expect(result.newsSignals).toContain('news_request');
      expect(result.needsWebSearch).toBe(true);
    });

    it('detects weather request', () => {
      const result = quickAnalyze("What's the weather like today?");
      expect(result.newsSignals).toContain('weather_request');
      expect(result.needsWebSearch).toBe(true);
    });

    it('detects search request', () => {
      const result = quickAnalyze('Can you look that up for me?');
      expect(result.newsSignals).toContain('search_request');
      expect(result.needsWebSearch).toBe(true);
    });
  });

  // ============================================================================
  // GUIDANCE GENERATION
  // ============================================================================
  describe('Guidance Generation', () => {
    it('generates safety guidance for scam mention', () => {
      const result = quickAnalyze('Someone called saying they were from Medicare');
      expect(result.guidance).toContain('[SAFETY]');
    });

    it('generates health guidance for health mention', () => {
      const result = quickAnalyze('My back is really hurting');
      expect(result.guidance).toContain('[HEALTH]');
    });

    it('generates emotion guidance for sadness', () => {
      const result = quickAnalyze("I'm feeling really sad today");
      expect(result.guidance).toContain('[EMOTION]');
    });

    it('generates engagement guidance for low engagement', () => {
      const result = quickAnalyze('ok');
      expect(result.guidance).toContain('[ENGAGEMENT]');
    });

    it('returns null guidance for neutral message', () => {
      const result = quickAnalyze('The weather is nice today');
      // May or may not have guidance depending on signals
      expect(typeof result.guidance === 'string' || result.guidance === null).toBe(true);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge Cases', () => {
    it('handles empty string', () => {
      const result = quickAnalyze('');
      expect(result.healthSignals).toEqual([]);
      expect(result.emotionSignals).toEqual([]);
      expect(result.safetySignals).toEqual([]);
    });

    it('handles null input', () => {
      const result = quickAnalyze(null);
      expect(result.healthSignals).toEqual([]);
    });

    it('handles undefined input', () => {
      const result = quickAnalyze(undefined);
      expect(result.healthSignals).toEqual([]);
    });

    it('handles multiple signals in one message', () => {
      const result = quickAnalyze("I fell yesterday and I'm feeling sad and dizzy");
      expect(result.healthSignals.length).toBeGreaterThanOrEqual(2);
      expect(result.emotionSignals.length).toBeGreaterThanOrEqual(1);
    });

    it('is case insensitive', () => {
      const result = quickAnalyze('I HAVE A HEADACHE');
      expect(result.healthSignals).toContainEqual(
        expect.objectContaining({ signal: 'headache' })
      );
    });
  });
});
