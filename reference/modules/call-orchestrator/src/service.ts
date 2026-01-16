import type {
  ICallOrchestrator,
  ITwilioAdapter,
  IConversationManager,
  ISeniorProfiles,
  CallRequest,
  Call,
  CallStatus,
  CallEvent,
  CallEventHandler,
} from '@donna/shared/interfaces';

export class CallOrchestratorService implements ICallOrchestrator {
  private eventHandlers: Map<string, Map<string, CallEventHandler[]>> = new Map();
  private activeCalls: Map<string, Call> = new Map();

  constructor(
    private twilioAdapter: ITwilioAdapter,
    private conversationManager: IConversationManager,
    private seniorProfiles: ISeniorProfiles,
    private webhookBaseUrl: string
  ) {}

  async initiateCall(request: CallRequest): Promise<Call> {
    // Get senior profile to retrieve phone number
    const senior = await this.seniorProfiles.getById(request.seniorId);

    // Create conversation record
    const conversation = await this.conversationManager.create({
      seniorId: request.seniorId,
      type: request.type,
      reminderIds: request.reminderIds,
    });

    // Build webhook URL for Twilio callbacks
    const webhookUrl = `${this.webhookBaseUrl}/api/voice/connect`;

    // Initiate the Twilio call
    const callSid = await this.twilioAdapter.initiateCall(
      senior.phone,
      '',
      webhookUrl
    );

    // Update conversation with call SID
    await this.conversationManager.updateSummary(
      conversation.id,
      '',
      undefined
    );

    // Create Call object
    const call: Call = {
      id: conversation.id,
      seniorId: request.seniorId,
      callSid,
      status: 'initiating',
      startedAt: conversation.startedAt,
      type: request.type,
    };

    // Store in active calls
    this.activeCalls.set(conversation.id, call);

    return call;
  }

  async getCallStatus(callId: string): Promise<CallStatus> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      // Try to fetch from conversation manager
      const conversation = await this.conversationManager.getById(callId);
      return this.mapConversationStatusToCallStatus(conversation.status);
    }
    return call.status;
  }

  async endCall(callId: string, reason?: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      const error = new Error(`Call with id ${callId} not found`) as any;
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // End the Twilio call
    await this.twilioAdapter.endCall(call.callSid);

    // Get call details to compute duration
    const callDetails = await this.twilioAdapter.getCallDetails(call.callSid);

    // Update conversation as completed
    const conversation = await this.conversationManager.getById(callId);

    // Mark as completed (this would need update method on conversation manager)
    // For now, we'll just update the summary
    await this.conversationManager.updateSummary(
      callId,
      conversation.summary || '',
      conversation.sentiment
    );

    // Update call status
    call.status = 'completed';
    this.activeCalls.set(callId, call);

    // Trigger ended event handlers
    await this.triggerEventHandlers(callId, 'ended', call);

    // Clean up from active calls after a delay
    setTimeout(() => {
      this.activeCalls.delete(callId);
    }, 60000); // Keep for 1 minute for any final queries
  }

  async handleCallEvent(event: CallEvent): Promise<void> {
    const call = this.activeCalls.get(event.callId);
    if (!call) {
      console.warn(`Received event for unknown call: ${event.callId}`);
      return;
    }

    // Update call status based on event type
    switch (event.type) {
      case 'answered':
        call.status = 'answered';
        this.activeCalls.set(event.callId, call);
        await this.triggerEventHandlers(event.callId, 'answered', call);
        break;

      case 'ended':
        call.status = 'completed';
        this.activeCalls.set(event.callId, call);
        await this.triggerEventHandlers(event.callId, 'ended', call);
        break;

      case 'failed':
        call.status = 'failed';
        this.activeCalls.set(event.callId, call);
        await this.triggerEventHandlers(event.callId, 'failed', call);
        break;

      case 'no_answer':
        call.status = 'no_answer';
        this.activeCalls.set(event.callId, call);
        await this.triggerEventHandlers(event.callId, 'failed', call);
        break;
    }
  }

  onCallAnswered(callId: string, handler: CallEventHandler): void {
    this.registerEventHandler(callId, 'answered', handler);
  }

  onCallEnded(callId: string, handler: CallEventHandler): void {
    this.registerEventHandler(callId, 'ended', handler);
  }

  onCallFailed(callId: string, handler: CallEventHandler): void {
    this.registerEventHandler(callId, 'failed', handler);
  }

  private registerEventHandler(
    callId: string,
    eventType: string,
    handler: CallEventHandler
  ): void {
    if (!this.eventHandlers.has(callId)) {
      this.eventHandlers.set(callId, new Map());
    }

    const callHandlers = this.eventHandlers.get(callId)!;
    if (!callHandlers.has(eventType)) {
      callHandlers.set(eventType, []);
    }

    callHandlers.get(eventType)!.push(handler);
  }

  private async triggerEventHandlers(
    callId: string,
    eventType: string,
    call: Call
  ): Promise<void> {
    const callHandlers = this.eventHandlers.get(callId);
    if (!callHandlers) return;

    const handlers = callHandlers.get(eventType);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        await handler(call);
      } catch (error) {
        console.error(`Error in ${eventType} event handler for call ${callId}:`, error);
      }
    }
  }

  private mapConversationStatusToCallStatus(
    status: 'in_progress' | 'completed' | 'no_answer' | 'failed'
  ): CallStatus {
    switch (status) {
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'no_answer':
        return 'no_answer';
      case 'failed':
        return 'failed';
      default:
        return 'failed';
    }
  }
}
