/**
 * Dependency Injection Container
 *
 * This file wires up all modules and adapters.
 * It's the ONLY place where concrete implementations are created.
 *
 * Benefits:
 * - Single source of truth for all dependencies
 * - Easy to swap implementations (just change one line)
 * - Easy to mock for testing
 * - Clear visualization of architecture
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Adapters
import { AnthropicAdapter } from '@donna/anthropic-adapter';
import { DeepgramAdapter } from '@donna/deepgram-adapter';
import { ElevenLabsAdapter } from '@donna/elevenlabs-adapter';
import { TwilioAdapter } from '@donna/twilio-adapter';
import { VercelBlobAdapter } from '@donna/vercel-blob';
import { OpenAIEmbeddingAdapter } from '@donna/openai-adapter';

// Modules
import { SeniorProfilesService, SeniorRepository } from '@donna/senior-profiles';
import { LLMConversationService } from '@donna/llm-conversation';
import {
  SkillsSystemService,
  NewsSearchSkill,
  CompanionshipSkill,
} from '@donna/skills-system';
import { VoicePipelineService } from '@donna/voice-pipeline';
import {
  ConversationManagerService,
  ConversationRepository,
} from '@donna/conversation-manager';
import { CallOrchestratorService } from '@donna/call-orchestrator';
import {
  ReminderManagementService,
  ReminderRepository,
} from '@donna/reminder-management';
import {
  SchedulerService,
  ScheduledCallRepository,
} from '@donna/scheduler-service';
import { ObserverAgentService } from '@donna/observer-agent';
import {
  MemoryContextService,
  MemoryRepository,
} from '@donna/memory-context';
import {
  AnalyticsEngineService,
  AnalyticsRepository,
} from '@donna/analytics-engine';

// Interfaces
import {
  ISeniorProfiles,
  IConversationEngine,
  ISkillsSystem,
  IAnthropicAdapter,
  IDeepgramAdapter,
  IElevenLabsAdapter,
  ITwilioAdapter,
  IVoicePipeline,
  IConversationManager,
  ICallOrchestrator,
  IReminderManagement,
  ISchedulerService,
  IStorageAdapter,
  IEmbeddingAdapter,
  IObserverAgent,
  IMemoryContext,
  IAnalyticsEngine,
} from '@donna/shared/interfaces';

/**
 * Container class for managing dependencies
 */
export class DonnaContainer {
  private static instance: DonnaContainer | null = null;
  private instances: Map<string, any> = new Map();

  constructor(private config: DonnaConfig) {
    this.initializeAdapters();
    this.initializeModules();
    DonnaContainer.instance = this;
  }

  /**
   * Get the singleton instance (if created)
   */
  static getInstance(): DonnaContainer | null {
    return DonnaContainer.instance;
  }

  /**
   * Initialize all external service adapters
   */
  private initializeAdapters(): void {
    console.log('📦 Initializing adapters...');

    // Anthropic Adapter (for LLM)
    const anthropicAdapter = new AnthropicAdapter({
      apiKey: this.config.anthropic.apiKey,
      defaultModel: this.config.anthropic.defaultModel,
    });
    this.set('AnthropicAdapter', anthropicAdapter);
    console.log('  ✓ Anthropic adapter initialized');

    // Deepgram Adapter (for Speech-to-Text)
    if (this.config.deepgram?.apiKey) {
      const deepgramAdapter = new DeepgramAdapter({
        apiKey: this.config.deepgram.apiKey,
      });
      this.set('DeepgramAdapter', deepgramAdapter);
      console.log('  ✓ Deepgram adapter initialized');
    }

    // ElevenLabs Adapter (for Text-to-Speech)
    if (this.config.elevenlabs?.apiKey) {
      const elevenLabsAdapter = new ElevenLabsAdapter({
        apiKey: this.config.elevenlabs.apiKey,
        defaultVoiceId: this.config.elevenlabs.defaultVoiceId,
      });
      this.set('ElevenLabsAdapter', elevenLabsAdapter);
      console.log('  ✓ ElevenLabs adapter initialized');
    }

    // Twilio Adapter (for Phone Calls)
    if (this.config.twilio) {
      const twilioAdapter = new TwilioAdapter({
        accountSid: this.config.twilio.accountSid,
        authToken: this.config.twilio.authToken,
        phoneNumber: this.config.twilio.phoneNumber,
      });
      this.set('TwilioAdapter', twilioAdapter);
      console.log('  ✓ Twilio adapter initialized');
    }

    // Vercel Blob Adapter (for Storage)
    if (this.config.vercelBlob?.token) {
      const vercelBlobAdapter = new VercelBlobAdapter({
        token: this.config.vercelBlob.token,
      });
      this.set('StorageAdapter', vercelBlobAdapter);
      console.log('  ✓ Vercel Blob adapter initialized');
    }

    // OpenAI Embedding Adapter (for Semantic Search)
    if (this.config.openai?.apiKey) {
      const openaiAdapter = new OpenAIEmbeddingAdapter({
        apiKey: this.config.openai.apiKey,
      });
      this.set('EmbeddingAdapter', openaiAdapter);
      console.log('  ✓ OpenAI Embedding adapter initialized');
    }
  }

  /**
   * Initialize all business modules
   */
  private initializeModules(): void {
    console.log('📦 Initializing modules...');

    // Database connection (shared) - Using Neon + Drizzle
    const sql = neon(this.config.database.url);
    const db = drizzle(sql);
    this.set('Database', db);
    console.log('  ✓ Neon database connected with Drizzle ORM');

    // ========================================
    // Module: Senior Profiles
    // ========================================
    const seniorRepository = new SeniorRepository(db);
    const seniorProfiles = new SeniorProfilesService(seniorRepository);
    this.set('SeniorProfiles', seniorProfiles);
    console.log('  ✓ Senior Profiles module initialized');

    // ========================================
    // Module: LLM Conversation Engine
    // ========================================
    const llmConversation = new LLMConversationService(
      this.get<IAnthropicAdapter>('AnthropicAdapter')
    );
    this.set('LLMConversation', llmConversation);
    console.log('  ✓ LLM Conversation module initialized');

    // ========================================
    // Module: Skills System
    // ========================================
    const skillsSystem = new SkillsSystemService();

    // Register built-in skills
    skillsSystem.register(
      new NewsSearchSkill(this.get<IAnthropicAdapter>('AnthropicAdapter'))
    );
    skillsSystem.register(new CompanionshipSkill());

    this.set('SkillsSystem', skillsSystem);
    console.log('  ✓ Skills System module initialized');
    console.log('    - News Search skill registered');
    console.log('    - Companionship skill registered');

    // ========================================
    // Module: Voice Pipeline
    // ========================================
    if (this.has('DeepgramAdapter') && this.has('ElevenLabsAdapter')) {
      const voicePipeline = new VoicePipelineService(
        this.get<IDeepgramAdapter>('DeepgramAdapter'),
        this.get<IElevenLabsAdapter>('ElevenLabsAdapter')
      );
      this.set('VoicePipeline', voicePipeline);
      console.log('  ✓ Voice Pipeline module initialized');
    }

    // ========================================
    // Module: Conversation Manager
    // ========================================
    const conversationRepository = new ConversationRepository(db);
    const conversationManager = new ConversationManagerService(conversationRepository);
    this.set('ConversationManager', conversationManager);
    console.log('  ✓ Conversation Manager module initialized');

    // ========================================
    // Module: Call Orchestrator
    // ========================================
    if (this.has('TwilioAdapter') && this.has('ConversationManager') && this.has('SeniorProfiles')) {
      const callOrchestrator = new CallOrchestratorService(
        this.get<ITwilioAdapter>('TwilioAdapter'),
        this.get<IConversationManager>('ConversationManager'),
        this.get<ISeniorProfiles>('SeniorProfiles'),
        this.config.api.url
      );
      this.set('CallOrchestrator', callOrchestrator);
      console.log('  ✓ Call Orchestrator module initialized');
    }

    // ========================================
    // Module: Reminder Management (Phase 2B)
    // ========================================
    const reminderRepository = new ReminderRepository(db);
    const reminderManagement = new ReminderManagementService(
      reminderRepository,
      seniorProfiles
    );
    this.set('ReminderManagement', reminderManagement);
    console.log('  ✓ Reminder Management module initialized');

    // ========================================
    // Module: Scheduler Service (Phase 2B)
    // ========================================
    if (this.config.redis && this.has('CallOrchestrator')) {
      const scheduledCallRepository = new ScheduledCallRepository(db);
      const scheduler = new SchedulerService(
        scheduledCallRepository,
        this.get<ICallOrchestrator>('CallOrchestrator'),
        this.config.redis
      );
      this.set('Scheduler', scheduler);
      console.log('  ✓ Scheduler Service module initialized');
    }

    // ========================================
    // Module: Observer Agent (Phase 3)
    // ========================================
    const observerAgent = new ObserverAgentService(
      this.get<IAnthropicAdapter>('AnthropicAdapter')
    );
    this.set('ObserverAgent', observerAgent);
    console.log('  ✓ Observer Agent module initialized');

    // ========================================
    // Module: Memory & Context (Phase 3)
    // ========================================
    const memoryRepository = new MemoryRepository(db);
    const memoryContext = new MemoryContextService(
      memoryRepository,
      this.get<IConversationManager>('ConversationManager'),
      this.get<ISeniorProfiles>('SeniorProfiles'),
      this.get<IEmbeddingAdapter>('EmbeddingAdapter')
    );
    this.set('MemoryContext', memoryContext);
    console.log('  ✓ Memory & Context module initialized');

    // ========================================
    // Module: Analytics Engine (Phase 3)
    // ========================================
    const analyticsRepository = new AnalyticsRepository(db);
    const analyticsEngine = new AnalyticsEngineService(
      analyticsRepository,
      this.get<ISeniorProfiles>('SeniorProfiles'),
      this.get<IConversationManager>('ConversationManager'),
      this.get<IReminderManagement>('ReminderManagement')
    );
    this.set('AnalyticsEngine', analyticsEngine);
    console.log('  ✓ Analytics Engine module initialized');
  }

  /**
   * Get a registered instance
   */
  get<T>(name: string): T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`No instance registered for '${name}'`);
    }
    return instance as T;
  }

  /**
   * Set a registered instance
   */
  set(name: string, instance: any): void {
    this.instances.set(name, instance);
  }

  /**
   * Check if an instance exists
   */
  has(name: string): boolean {
    return this.instances.has(name);
  }

  /**
   * Get all module instances for inspection
   */
  getAll(): Map<string, any> {
    return new Map(this.instances);
  }

  /**
   * Cleanup and close all connections
   */
  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down container...');

    // Neon HTTP connections don't need explicit closing
    // They are stateless HTTP-based connections
    console.log('  ✓ Neon database connections cleaned up');

    console.log('✓ Container shutdown complete');
  }
}

/**
 * Configuration interface
 */
export interface DonnaConfig {
  database: {
    url: string;
  };
  anthropic: {
    apiKey: string;
    defaultModel?: string;
  };
  deepgram?: {
    apiKey: string;
  };
  elevenlabs?: {
    apiKey: string;
    defaultVoiceId?: string;
  };
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  vercelBlob?: {
    token: string;
  };
  openai?: {
    apiKey: string;
  };
  redis?: {
    host: string;
    port: number;
  } | {
    url: string;
    token: string;
  };
  api: {
    url: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

/**
 * Create and initialize the container
 */
export function createContainer(config: DonnaConfig): DonnaContainer {
  console.log('🚀 Creating Donna container...');
  const container = new DonnaContainer(config);
  console.log('✓ Container ready!\n');
  return container;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): DonnaConfig {
  const requiredEnvVars = [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'API_URL',
    'JWT_SECRET',
  ];

  // Check required vars
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    database: {
      url: process.env.DATABASE_URL!,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    },
    deepgram: process.env.DEEPGRAM_API_KEY
      ? {
          apiKey: process.env.DEEPGRAM_API_KEY,
        }
      : undefined,
    elevenlabs: process.env.ELEVENLABS_API_KEY
      ? {
          apiKey: process.env.ELEVENLABS_API_KEY,
          defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || 'rachel',
        }
      : undefined,
    twilio: process.env.TWILIO_ACCOUNT_SID
      ? {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN!,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
        }
      : undefined,
    vercelBlob: process.env.BLOB_READ_WRITE_TOKEN
      ? {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        }
      : undefined,
    redis: process.env.UPSTASH_REDIS_REST_URL
      ? {
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        }
      : process.env.REDIS_HOST
      ? {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        }
      : undefined,
    api: {
      url: process.env.API_URL!,
      port: parseInt(process.env.PORT || '3000', 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET!,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    openai: process.env.OPENAI_API_KEY
      ? {
          apiKey: process.env.OPENAI_API_KEY,
        }
      : undefined,
  };
}
