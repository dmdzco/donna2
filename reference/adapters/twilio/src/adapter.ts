import twilio from 'twilio';
import type {
  ITwilioAdapter,
  TwilioCallStatus,
  TwilioCallDetails,
} from '@donna/shared/interfaces';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export class TwilioAdapter implements ITwilioAdapter {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.fromNumber = config.phoneNumber;
  }

  async initiateCall(to: string, from: string, webhookUrl: string): Promise<string> {
    try {
      const call = await this.client.calls.create({
        to,
        from: from || this.fromNumber,
        url: webhookUrl,
        statusCallback: `${webhookUrl}/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: `${webhookUrl}/recording`,
      });

      return call.sid;
    } catch (error: any) {
      const serviceError = new Error(
        `External service Twilio error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async endCall(callSid: string): Promise<void> {
    try {
      await this.client.calls(callSid).update({ status: 'completed' });
    } catch (error: any) {
      const serviceError = new Error(
        `External service Twilio error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async getCallStatus(callSid: string): Promise<TwilioCallStatus> {
    try {
      const call = await this.client.calls(callSid).fetch();

      return {
        status: call.status as any,
        duration: call.duration ? parseInt(call.duration) : undefined,
        startTime: call.startTime ? new Date(call.startTime) : undefined,
        endTime: call.endTime ? new Date(call.endTime) : undefined,
      };
    } catch (error: any) {
      const serviceError = new Error(
        `External service Twilio error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async getCallDetails(callSid: string): Promise<TwilioCallDetails> {
    try {
      const call = await this.client.calls(callSid).fetch();

      return {
        status: call.status as any,
        duration: call.duration ? parseInt(call.duration) : undefined,
        startTime: call.startTime ? new Date(call.startTime) : undefined,
        endTime: call.endTime ? new Date(call.endTime) : undefined,
        to: call.to,
        from: call.from,
        price: call.price || undefined,
        recordingUrl: undefined, // Fetched separately via recording callback
      };
    } catch (error: any) {
      const serviceError = new Error(
        `External service Twilio error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }
}
