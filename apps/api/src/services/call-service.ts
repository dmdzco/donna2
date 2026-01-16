import twilio from 'twilio';
import { db } from '../db/client.js';

// Validate required environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const API_URL = process.env.API_URL;

if (!TWILIO_ACCOUNT_SID) {
  throw new Error('Missing required environment variable: TWILIO_ACCOUNT_SID');
}
if (!TWILIO_AUTH_TOKEN) {
  throw new Error('Missing required environment variable: TWILIO_AUTH_TOKEN');
}
if (!TWILIO_PHONE_NUMBER) {
  throw new Error('Missing required environment variable: TWILIO_PHONE_NUMBER');
}
if (!API_URL) {
  throw new Error('Missing required environment variable: API_URL');
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

interface Senior {
  id: string;
  name: string;
  phone: string;
  timezone: string;
  interests: string[];
}

interface Reminder {
  id: string;
  type: string;
  title: string;
  description?: string;
}

export const callService = {
  async initiateCall(senior: Senior, reminders: Reminder[]) {
    // Create conversation record
    const conversationResult = await db.query(
      `INSERT INTO conversations (senior_id, started_at, status, initiated_by, metadata)
       VALUES ($1, NOW(), 'in_progress', 'manual', $2)
       RETURNING id`,
      [senior.id, JSON.stringify({ reminders: reminders.map(r => r.id) })]
    );

    const conversationId = conversationResult.rows[0].id;

    // Initiate Twilio call
    const call = await twilioClient.calls.create({
      to: senior.phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${API_URL}/api/voice/connect`,
      statusCallback: `${API_URL}/api/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${API_URL}/api/voice/recording`,
    });

    // Update conversation with call SID
    await db.query(
      `UPDATE conversations SET call_sid = $1 WHERE id = $2`,
      [call.sid, conversationId]
    );

    return call;
  },

  async endCall(callSid: string) {
    return await twilioClient.calls(callSid).update({ status: 'completed' });
  },
};
