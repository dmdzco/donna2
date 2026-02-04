/**
 * Mock for Google Gemini API
 *
 * Used for Conversation Director (fast-observer) and Call Analysis
 */

import { vi } from 'vitest';

// Mock Director response (Gemini Flash)
export const mockDirectorResponse = {
  analysis: {
    call_phase: 'main',
    engagement_level: 'high',
    emotional_state: 'content',
    topic_momentum: 'good',
    topics_discussed: ['family', 'baking', 'grandchildren'],
  },
  direction: {
    approach: 'maintain_warmth',
    suggested_topics: ['gardening', 'church'],
    avoid_topics: [],
    tone: 'cheerful',
    priority: 'connection',
  },
  reminder_timing: {
    ready_to_deliver: false,
    suggested_moment: null,
    reason: 'Senior is engaged in pleasant conversation',
  },
  token_recommendation: 100,
  reasoning: 'Senior is highly engaged, discussing family. No immediate concerns.',
};

// Mock Call Analysis response
export const mockCallAnalysisResponse = {
  summary: 'Dorothy had a warm conversation about baking cookies with her grandson Tommy. She mentioned her daughter Susan visited recently. No health concerns were raised.',
  topics: ['family', 'baking', 'grandchildren'],
  engagement_score: 8,
  sentiment: 'positive',
  concerns: [],
  follow_ups: [],
  reminders_delivered: [],
  reminders_acknowledged: [],
};

// Mock responses for different scenarios
export const mockDirectorResponses = {
  openingPhase: {
    ...mockDirectorResponse,
    analysis: {
      ...mockDirectorResponse.analysis,
      call_phase: 'opening',
      engagement_level: 'medium',
    },
    direction: {
      ...mockDirectorResponse.direction,
      approach: 'warm_greeting',
      priority: 'establish_connection',
    },
    token_recommendation: 120,
  },

  lowEngagement: {
    ...mockDirectorResponse,
    analysis: {
      ...mockDirectorResponse.analysis,
      call_phase: 'main',
      engagement_level: 'low',
      topic_momentum: 'stalled',
    },
    direction: {
      approach: 're_engage',
      suggested_topics: ['favorite_memories', 'interests'],
      tone: 'gentle_curious',
      priority: 'boost_engagement',
    },
    token_recommendation: 150,
  },

  emotionalSupport: {
    ...mockDirectorResponse,
    analysis: {
      ...mockDirectorResponse.analysis,
      emotional_state: 'sad',
      engagement_level: 'medium',
    },
    direction: {
      approach: 'empathetic_listening',
      suggested_topics: [],
      avoid_topics: ['reminders', 'transitions'],
      tone: 'gentle',
      priority: 'emotional_support',
    },
    token_recommendation: 200,
  },

  readyForReminder: {
    ...mockDirectorResponse,
    reminder_timing: {
      ready_to_deliver: true,
      suggested_moment: 'after_current_topic',
      reason: 'Natural pause in conversation, good mood',
    },
    token_recommendation: 130,
  },

  closingPhase: {
    ...mockDirectorResponse,
    analysis: {
      ...mockDirectorResponse.analysis,
      call_phase: 'closing',
    },
    direction: {
      approach: 'warm_closing',
      suggested_topics: [],
      tone: 'warm',
      priority: 'graceful_ending',
    },
    token_recommendation: 100,
  },
};

export const mockCallAnalysisResponses = {
  healthConcern: {
    summary: 'Dorothy mentioned back pain that started after a fall last week. She also reported feeling dizzy. She has not informed her daughter Susan or her doctor.',
    topics: ['health', 'fall', 'pain'],
    engagement_score: 7,
    sentiment: 'concerned',
    concerns: [
      {
        type: 'health',
        severity: 'medium',
        description: 'Back pain following a fall, accompanied by dizziness',
        recommendation: 'Suggest medical evaluation',
      },
    ],
    follow_ups: ['Follow up on doctor appointment', 'Check if Susan was informed'],
  },

  cognitiveDecline: {
    summary: 'Harold reported getting lost while driving and finding his keys in the refrigerator. He mentioned these episodes are occurring more frequently.',
    topics: ['cognitive', 'driving', 'safety'],
    engagement_score: 6,
    sentiment: 'worried',
    concerns: [
      {
        type: 'cognitive',
        severity: 'high',
        description: 'Episodes of disorientation while driving and object misplacement',
        recommendation: 'Alert caregiver, suggest cognitive assessment',
      },
      {
        type: 'safety',
        severity: 'medium',
        description: 'Driving safety concern',
        recommendation: 'Discuss driving safety with family',
      },
    ],
    follow_ups: ['Alert family about cognitive concerns', 'Follow up on driving situation'],
  },

  emotionalDistress: {
    summary: "Harold expressed deep loneliness on his wedding anniversary. He mentioned feeling like he doesn't want to go on, which is concerning.",
    topics: ['grief', 'loneliness', 'anniversary'],
    engagement_score: 5,
    sentiment: 'distressed',
    concerns: [
      {
        type: 'emotional',
        severity: 'high',
        description: 'Expressed hopelessness and feeling like a burden on wedding anniversary',
        recommendation: 'Alert caregiver immediately, consider wellness check',
      },
    ],
    follow_ups: ['Urgent caregiver notification', 'Schedule follow-up call tomorrow'],
  },
};

// Create mock Gemini client
export const createMockGeminiClient = (responseOverride = null) => {
  const mockClient = {
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockImplementation(async () => ({
        response: {
          text: () => JSON.stringify(responseOverride || mockDirectorResponse),
        },
      })),
      generateContentStream: vi.fn().mockImplementation(async function* () {
        const text = JSON.stringify(responseOverride || mockDirectorResponse);
        yield { text: () => text };
      }),
    }),
  };

  return mockClient;
};

export default {
  createMockGeminiClient,
  mockDirectorResponse,
  mockDirectorResponses,
  mockCallAnalysisResponse,
  mockCallAnalysisResponses,
};
