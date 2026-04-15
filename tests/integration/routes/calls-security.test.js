import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const routePath = path.join(process.cwd(), 'routes', 'calls.js');

describe('call route security structure', () => {
  const source = fs.readFileSync(routePath, 'utf8');

  it('requires seniorId call initiation instead of client supplied phoneNumber', () => {
    expect(source).toContain('const { seniorId } = req.body');
    expect(source).toContain('seniorService.getById(seniorId)');
    expect(source).not.toContain('const { phoneNumber } = req.body');
    expect(source).not.toContain('seniorService.findByPhone(phoneNumber)');
  });

  it('authorizes senior access before using Twilio', () => {
    const accessCheck = source.indexOf('canAccessSenior(req.auth, senior.id)');
    const twilioCall = source.indexOf('twilioClient.calls.create');

    expect(accessCheck).toBeGreaterThan(-1);
    expect(twilioCall).toBeGreaterThan(-1);
    expect(accessCheck).toBeLessThan(twilioCall);
  });

  it('uses the server-resolved senior phone for Twilio calls', () => {
    expect(source).toContain('const callPhone = formatPhoneForCall(senior.phone)');
    expect(source).toContain('to: callPhone');
  });
});
