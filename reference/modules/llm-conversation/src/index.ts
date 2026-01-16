/**
 * LLM Conversation Engine Module
 *
 * Pure response generation module with no side effects.
 * Only responsibility: Generate Donna's responses given context.
 *
 * Can be easily swapped with a different LLM provider or approach.
 */

export { LLMConversationService } from './service';

export type {
  IConversationEngine,
  ConversationRequest,
} from '@donna/shared/interfaces';
