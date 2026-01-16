import { describe, it, expect } from 'vitest';
import { TwilioAdapter } from './adapter';

/**
 * Unit tests for TwilioAdapter
 *
 * Note: Full integration tests require real TWILIO_* credentials.
 */
describe('TwilioAdapter', () => {
  // Use valid format for accountSid (must start with AC)
  const testConfig = {
    accountSid: 'AC00000000000000000000000000000000',
    authToken: 'test-token-12345678901234567890',
    phoneNumber: '+15555555555',
  };

  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new TwilioAdapter(testConfig);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(TwilioAdapter);
    });
  });

  describe('interface compliance', () => {
    it('should implement ITwilioAdapter interface', () => {
      const adapter = new TwilioAdapter(testConfig);

      expect(typeof adapter.initiateCall).toBe('function');
      expect(typeof adapter.endCall).toBe('function');
      expect(typeof adapter.getCallStatus).toBe('function');
      expect(typeof adapter.getCallDetails).toBe('function');
    });
  });
});
