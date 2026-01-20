/**
 * Module Interfaces for Donna Architecture V2
 *
 * These interfaces define the boundaries between all modules.
 * NO module should import from another module's implementation.
 * ALL communication happens through these interfaces.
 */

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Senior {
  id: string;
  caregiverId: string;
  name: string;
  phone: string;
  dateOfBirth?: Date;
  timezone: string;
  locationCity?: string;
  locationState?: string;
  interests: string[];
  familyInfo?: Record<string, any>;
  medicalNotes?: string;
  preferredCallTimes?: Record<string, any>;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  seniorId: string;
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  scheduleCron?: string;
  scheduledTime?: Date;
  isRecurring: boolean;
  isActive: boolean;
  lastDeliveredAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  seniorId: string;
  callSid?: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  status: 'in_progress' | 'completed' | 'no_answer' | 'failed';
  initiatedBy: 'scheduled' | 'manual' | 'senior_callback';
  audioUrl?: string;
  summary?: string;
  sentiment?: string;
  concerns: string[];
  remindersDelivered: string[];
  metadata?: Record<string, any>;
}

export interface Turn {
  speaker: 'donna' | 'senior';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

// ============================================================================
// MODULE 1: USER MANAGEMENT
// ============================================================================

export interface IUserManagement {
  register(data: RegisterData): Promise<User>;
  login(email: string, password: string): Promise<AuthToken>;
  validateToken(token: string): Promise<User | null>;
  updateProfile(userId: string, data: Partial<ProfileData>): Promise<User>;
  resetPassword(email: string): Promise<void>;
  deleteAccount(userId: string): Promise<void>;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface ProfileData {
  name?: string;
  phone?: string;
  email?: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: User;
}

// ============================================================================
// MODULE 2: SENIOR PROFILES
// ============================================================================

export interface ISeniorProfiles {
  create(caregiverId: string, data: SeniorData): Promise<Senior>;
  getById(seniorId: string): Promise<Senior>;
  list(caregiverId: string, filters?: SeniorFilters): Promise<Senior[]>;
  getAll(): Promise<Senior[]>;
  update(seniorId: string, data: Partial<SeniorData>): Promise<Senior>;
  delete(seniorId: string): Promise<void>;
  getPreferences(seniorId: string): Promise<SeniorPreferences>;
  updatePreferences(seniorId: string, prefs: Partial<SeniorPreferences>): Promise<void>;
}

export interface SeniorData {
  name: string;
  phone: string;
  dateOfBirth?: Date;
  timezone?: string;
  locationCity?: string;
  locationState?: string;
  interests?: string[];
  familyInfo?: Record<string, any>;
  medicalNotes?: string;
  preferredCallTimes?: Record<string, any>;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface SeniorFilters {
  isActive?: boolean;
  search?: string;
}

export interface SeniorPreferences {
  voiceSpeed?: 'slow' | 'normal' | 'fast';
  callFrequency?: 'daily' | 'weekly' | 'custom';
  topics?: string[];
  doNotDisturb?: boolean;
}

// ============================================================================
// MODULE 3: REMINDER MANAGEMENT
// ============================================================================

export interface IReminderManagement {
  create(seniorId: string, data: ReminderData): Promise<Reminder>;
  list(seniorId: string, filters?: ReminderFilters): Promise<Reminder[]>;
  update(reminderId: string, data: Partial<ReminderData>): Promise<Reminder>;
  delete(reminderId: string): Promise<void>;
  getPendingForSenior(seniorId: string): Promise<Reminder[]>;
  markDelivered(reminderId: string, conversationId: string): Promise<void>;
  getDeliveryHistory(reminderId: string): Promise<DeliveryRecord[]>;
}

export interface ReminderData {
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  scheduleCron?: string;
  scheduledTime?: Date;
  isRecurring?: boolean;
  metadata?: Record<string, any>;
}

export interface ReminderFilters {
  type?: 'medication' | 'appointment' | 'custom';
  isActive?: boolean;
  isRecurring?: boolean;
}

export interface DeliveryRecord {
  reminderId: string;
  conversationId: string;
  deliveredAt: Date;
  acknowledged: boolean;
}

// ============================================================================
// MODULE 4: SCHEDULER SERVICE
// ============================================================================

export interface ISchedulerService {
  scheduleCall(schedule: CallSchedule): Promise<ScheduledCall>;
  cancelScheduledCall(scheduleId: string): Promise<void>;
  getUpcomingCalls(seniorId?: string, limit?: number): Promise<ScheduledCall[]>;
  processSchedule(): Promise<void>; // Called by cron
  retryFailedCall(scheduleId: string): Promise<void>;
  updateSchedule(scheduleId: string, updates: Partial<CallSchedule>): Promise<ScheduledCall>;
}

export interface CallSchedule {
  seniorId: string;
  type: 'check_in' | 'reminder' | 'custom';
  scheduledTime: Date;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    days?: number[]; // Day of week (0-6) or day of month (1-31)
    time?: string; // HH:MM format
  };
  reminderIds?: string[];
  maxRetries?: number;
}

export interface ScheduledCall {
  id: string;
  seniorId: string;
  type: 'check_in' | 'reminder' | 'custom';
  scheduledTime: Date;
  reminderIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  retryCount: number;
  maxRetries: number;
  conversationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// MODULE 5: CALL ORCHESTRATOR
// ============================================================================

export interface ICallOrchestrator {
  initiateCall(request: CallRequest): Promise<Call>;
  getCallStatus(callId: string): Promise<CallStatus>;
  endCall(callId: string, reason?: string): Promise<void>;
  handleCallEvent(event: CallEvent): Promise<void>;

  // Event subscriptions
  onCallAnswered(callId: string, handler: CallEventHandler): void;
  onCallEnded(callId: string, handler: CallEventHandler): void;
  onCallFailed(callId: string, handler: CallEventHandler): void;
}

export interface CallRequest {
  seniorId: string;
  type: 'scheduled' | 'manual';
  reminderIds?: string[];
  scheduledCallId?: string;
}

export interface Call {
  id: string;
  seniorId: string;
  callSid: string;
  status: CallStatus;
  startedAt: Date;
  type: 'scheduled' | 'manual';
}

export type CallStatus =
  | 'initiating'
  | 'ringing'
  | 'answered'
  | 'in_progress'
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'cancelled';

export interface CallEvent {
  callId: string;
  callSid: string;
  type: 'answered' | 'ended' | 'failed' | 'no_answer';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type CallEventHandler = (call: Call) => void | Promise<void>;

// ============================================================================
// MODULE 6: CONVERSATION MANAGER
// ============================================================================

export interface IConversationManager {
  create(data: ConversationData): Promise<Conversation>;
  addTurn(conversationId: string, turn: TurnData): Promise<void>;
  getHistory(seniorId: string, limit?: number): Promise<Conversation[]>;
  getById(conversationId: string): Promise<ConversationWithTurns>;
  getTurns(conversationId: string): Promise<Turn[]>;
  updateSummary(conversationId: string, summary: string, sentiment?: string): Promise<void>;
  flagConcern(conversationId: string, concern: string): Promise<void>;
  markReminderDelivered(conversationId: string, reminderId: string): Promise<void>;
  getRecentContext(seniorId: string, limit?: number): Promise<ConversationContext>;

  /**
   * Get conversation continuity - last N turns across all calls for a senior.
   * This persists across call endings/drops and provides context for the next call.
   * @param seniorId - The senior to get continuity for
   * @param limit - Number of recent turns to retrieve (default 10)
   */
  getContinuity(seniorId: string, limit?: number): Promise<ConversationContinuity>;
}

export interface ConversationData {
  seniorId: string;
  callSid?: string;
  type: 'scheduled' | 'manual';
  reminderIds?: string[];
}

export interface TurnData {
  speaker: 'donna' | 'senior';
  content: string;
  timestamp?: Date;
  audioUrl?: string;
  observerSignals?: ObserverSignal;
}

export interface ConversationWithTurns extends Conversation {
  turns: Turn[];
}

export interface ConversationContext {
  // Memory context properties (optional for basic usage)
  recentSummaries?: string[];
  importantMemories?: Memory[];
  recentTopics?: string[];
  preferences?: SeniorPreferences;
  lastCallDate?: Date;
  // Properties for LLM conversation generation
  pendingReminders?: Reminder[];
  recentNews?: NewsItem[];
  observerSignals?: ObserverSignal;
  currentTime?: Date;
  // Conversation continuity (persists across calls)
  continuity?: ConversationContinuity;
}

/**
 * Conversation continuity - tracks recent turns across phone calls.
 * This persists even when calls end or drop, providing context for the next call.
 */
export interface ConversationContinuity {
  /** Last 10 turns across all recent calls for this senior */
  recentTurns: TurnWithMeta[];
  /** The senior's most recent message - what they last said/wanted */
  lastSeniorTurn?: TurnWithMeta;
  /** Was the last call dropped unexpectedly? */
  lastCallDropped: boolean;
  /** When was the last interaction? */
  lastInteractionAt?: Date;
}

/**
 * A turn with metadata about which conversation it came from
 */
export interface TurnWithMeta extends Turn {
  /** The conversation this turn belongs to */
  conversationId: string;
  /** When the conversation started */
  conversationStartedAt: Date;
  /** Observer signals at this turn (if available) */
  observerSignals?: ObserverSignal;
}

// ============================================================================
// MODULE 7: VOICE PIPELINE
// ============================================================================

export interface IVoicePipeline {
  // Speech to Text
  transcribeStream(audioStream: AudioStream): AsyncIterable<Transcript>;
  transcribeBuffer(audioBuffer: Buffer): Promise<string>;

  // Text to Speech
  synthesize(text: string, config?: VoiceConfig): Promise<AudioBuffer>;
  synthesizeStream(text: string, config?: VoiceConfig): AsyncIterable<AudioChunk>;
}

export interface AudioStream {
  data: Buffer | ReadableStream;
  format: AudioFormat;
}

export interface AudioFormat {
  encoding: 'linear16' | 'mulaw' | 'opus';
  sampleRate: number;
  channels: number;
}

export interface Transcript {
  text: string;
  isFinal: boolean;
  confidence: number;
  words?: Word[];
}

export interface Word {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface VoiceConfig {
  voiceId?: string;
  speed?: number; // 0.5 - 2.0
  stability?: number; // 0.0 - 1.0
  pitch?: number;
}

export interface AudioChunk {
  data: Buffer;
  isLast: boolean;
}

export type AudioBuffer = Buffer;

// ============================================================================
// MODULE 8: LLM CONVERSATION ENGINE
// ============================================================================

export interface IConversationEngine {
  generateResponse(request: ConversationRequest): Promise<string>;
  generateResponseStream(request: ConversationRequest): AsyncIterable<string>;
  buildSystemPrompt(senior: Senior, context: ConversationContext): string;
}

export interface ConversationRequest {
  senior: Senior;
  userMessage: string;
  conversationHistory: Turn[];
  context: {
    pendingReminders?: Reminder[];
    recentNews?: NewsItem[];
    observerSignals?: ObserverSignal;
    currentTime?: Date;
  };
}

export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  relevance: string;
  url?: string;
  publishedAt?: Date;
}

// ============================================================================
// MODULE 9: OBSERVER AGENT
// ============================================================================

export interface IObserverAgent {
  analyze(request: ObserverAnalysisRequest): Promise<ObserverSignal>;
}

export interface ObserverAnalysisRequest {
  senior: Senior;
  conversationHistory: Turn[];
  pendingReminders: Reminder[];
  currentTopic?: string;
  callDuration?: number;
}

export interface ObserverSignal {
  engagementLevel: 'high' | 'medium' | 'low';
  emotionalState: 'positive' | 'neutral' | 'negative' | 'confused' | 'distressed';
  shouldDeliverReminder: boolean;
  reminderToDeliver?: string;
  suggestedTransition?: string;
  shouldEndCall: boolean;
  endCallReason?: string;
  concerns: string[];
  confidenceScore: number; // 0.0 - 1.0
  timestamp: Date;
}

// ============================================================================
// MODULE 10: MEMORY & CONTEXT
// ============================================================================

export interface IMemoryContext {
  // Memory storage
  storeMemory(seniorId: string, memory: MemoryData): Promise<Memory>;
  getMemories(seniorId: string, filters?: MemoryFilters): Promise<Memory[]>;
  searchMemories(seniorId: string, query: string, limit?: number): Promise<Memory[]>;
  deleteMemory(memoryId: string): Promise<void>;

  // Context building
  buildContext(seniorId: string, scope?: ContextScope): Promise<ConversationContext>;
  summarizeConversation(conversationId: string): Promise<string>;

  // Topic tracking
  getRecentTopics(seniorId: string, days: number): Promise<string[]>;
  trackTopic(seniorId: string, topic: string, conversationId: string): Promise<void>;
}

export interface Memory {
  id: string;
  seniorId: string;
  type: 'fact' | 'preference' | 'event' | 'concern';
  content: string;
  source: string; // conversationId or 'manual'
  timestamp: Date;
  importance: number; // 0.0 - 1.0
  embedding?: number[]; // For semantic search
  metadata?: Record<string, any>;
}

export interface MemoryData {
  type: 'fact' | 'preference' | 'event' | 'concern';
  content: string;
  source: string;
  importance?: number;
  metadata?: Record<string, any>;
}

export interface MemoryFilters {
  type?: 'fact' | 'preference' | 'event' | 'concern';
  minImportance?: number;
  since?: Date;
  limit?: number;
}

export interface ContextScope {
  includeSummaries?: boolean;
  includeMemories?: boolean;
  includeTopics?: boolean;
  daysBack?: number;
  currentTopic?: string; // Optional topic for semantic memory search
}

// ============================================================================
// MODULE 11: SKILLS SYSTEM
// ============================================================================

export interface ISkillsSystem {
  register(skill: Skill): void;
  unregister(skillName: string): void;
  execute(skillName: string, params: SkillParams): Promise<SkillResult>;
  listAvailable(): SkillInfo[];
  getSkill(skillName: string): Skill | undefined;
}

export interface Skill {
  name: string;
  description: string;
  version: string;
  parameters?: SkillParameterDefinition[];
  execute(params: SkillParams): Promise<SkillResult>;
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  parameters?: SkillParameterDefinition[];
}

export interface SkillParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
  description: string;
}

export interface SkillParams {
  senior: Senior;
  context?: any;
  [key: string]: any;
}

export interface SkillResult {
  success: boolean;
  data: any;
  error?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// MODULE 12: ANALYTICS ENGINE
// ============================================================================

export interface IAnalyticsEngine {
  trackEvent(event: AnalyticsEvent): Promise<void>;
  getSeniorInsights(seniorId: string, period: TimePeriod): Promise<SeniorInsights>;
  getCaregiverDashboard(caregiverId: string): Promise<CaregiverDashboard>;
  generateReport(reportType: ReportType, params: ReportParams): Promise<Report>;
  getSystemMetrics(): Promise<SystemMetrics>;
}

export interface AnalyticsEvent {
  type: 'call_started' | 'call_completed' | 'call_failed' | 'reminder_delivered' | 'concern_flagged';
  seniorId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface TimePeriod {
  start: Date;
  end: Date;
}

export interface SeniorInsights {
  callFrequency: number; // calls per week
  averageDuration: number; // seconds
  sentimentTrend: 'improving' | 'stable' | 'declining';
  engagementScore: number; // 0-100
  topTopics: string[];
  concernCount: number;
  reminderCompletionRate: number; // percentage
  lastCallDate?: Date;
}

export interface CaregiverDashboard {
  totalSeniors: number;
  activeSeniors: number;
  totalCallsThisWeek: number;
  pendingConcerns: number;
  upcomingReminders: Reminder[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  type: 'call' | 'concern' | 'reminder';
  seniorId: string;
  seniorName: string;
  description: string;
  timestamp: Date;
}

export type ReportType = 'weekly_summary' | 'monthly_summary' | 'senior_detailed' | 'system_health';

export interface ReportParams {
  seniorId?: string;
  caregiverId?: string;
  period: TimePeriod;
  format?: 'json' | 'pdf' | 'html';
}

export interface Report {
  type: ReportType;
  generatedAt: Date;
  data: any;
  format: 'json' | 'pdf' | 'html';
}

export interface SystemMetrics {
  totalCalls: number;
  successRate: number;
  averageLatency: number;
  activeUsers: number;
  errorRate: number;
}

// ============================================================================
// INTEGRATION ADAPTERS
// ============================================================================

export interface ITwilioAdapter {
  initiateCall(to: string, from: string, webhookUrl: string): Promise<string>; // Returns callSid
  endCall(callSid: string): Promise<void>;
  getCallStatus(callSid: string): Promise<TwilioCallStatus>;
  getCallDetails(callSid: string): Promise<TwilioCallDetails>;
}

export interface TwilioCallStatus {
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
  duration?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface TwilioCallDetails extends TwilioCallStatus {
  to: string;
  from: string;
  price?: string;
  recordingUrl?: string;
}

export interface IAnthropicAdapter {
  chat(messages: LLMMessage[], system?: string, options?: LLMOptions): Promise<string>;
  chatStream(messages: LLMMessage[], system?: string, options?: LLMOptions): AsyncIterable<string>;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface IDeepgramAdapter {
  transcribeStream(audioStream: AudioStream, options?: STTOptions): AsyncIterable<Transcript>;
  transcribeBuffer(audioBuffer: Buffer, options?: STTOptions): Promise<string>;
}

export interface STTOptions {
  model?: string;
  language?: string;
  punctuate?: boolean;
  diarize?: boolean;
}

export interface IElevenLabsAdapter {
  synthesize(text: string, voiceId: string, options?: TTSOptions): Promise<AudioBuffer>;
  synthesizeStream(text: string, voiceId: string, options?: TTSOptions): AsyncIterable<AudioChunk>;
  listVoices(): Promise<Voice[]>;
}

export interface TTSOptions {
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface Voice {
  voiceId: string;
  name: string;
  category: string;
}

// ============================================================================
// ADAPTER: STORAGE (Vercel Blob)
// ============================================================================

export interface IStorageAdapter {
  /**
   * Upload an audio file to storage
   * @param conversationId - ID of the conversation
   * @param audioBuffer - Audio data as Buffer
   * @param contentType - MIME type (e.g., 'audio/mpeg')
   * @returns Public URL to the uploaded file
   */
  uploadAudio(conversationId: string, audioBuffer: Buffer, contentType: string): Promise<string>;

  /**
   * Get a signed/public URL for accessing a file
   * @param url - The storage URL
   * @param expiresIn - Expiration time in seconds (optional)
   * @returns Accessible URL (signed or public)
   */
  getSignedUrl(url: string, expiresIn?: number): Promise<string>;

  /**
   * Delete an audio file from storage
   * @param url - The storage URL to delete
   */
  deleteAudio(url: string): Promise<void>;
}

// ============================================================================
// ADAPTER: EMBEDDINGS (OpenAI)
// ============================================================================

export interface IEmbeddingAdapter {
  /**
   * Generate an embedding vector for a text string
   * @param text - The text to generate an embedding for
   * @returns Embedding vector (1536 dimensions for text-embedding-3-small)
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in a batch
   * @param texts - Array of texts to generate embeddings for
   * @returns Array of embedding vectors
   */
  generateEmbeddingsBatch(texts: string[]): Promise<number[][]>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class DonnaError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'DonnaError';
  }
}

export class NotFoundError extends DonnaError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends DonnaError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ValidationError extends DonnaError {
  constructor(message: string, public errors?: any[]) {
    super(message, 'VALIDATION_ERROR', 400, { errors });
  }
}

export class ExternalServiceError extends DonnaError {
  constructor(service: string, message: string, originalError?: Error) {
    super(
      `External service ${service} error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { service, originalError: originalError?.message }
    );
  }
}
