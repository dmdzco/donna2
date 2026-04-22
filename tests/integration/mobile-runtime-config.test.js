import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const runtimeConfigSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/runtimeConfig.ts'),
  'utf-8',
);
const appConfigSource = fs.readFileSync(
  path.resolve('apps/mobile/app.config.js'),
  'utf-8',
);
const apiSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/api.ts'),
  'utf-8',
);
const layoutSource = fs.readFileSync(
  path.resolve('apps/mobile/app/_layout.tsx'),
  'utf-8',
);
const notificationsSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/notifications.ts'),
  'utf-8',
);

describe('mobile runtime config wiring', () => {
  it('publishes required public config through Expo extra', () => {
    expect(appConfigSource).toContain('apiUrl: trimmed("EXPO_PUBLIC_API_URL")');
    expect(appConfigSource).toContain('clerkPublishableKey: trimmed("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY")');
    expect(appConfigSource).toContain('sentryDsn: trimmed("EXPO_PUBLIC_SENTRY_DSN")');
  });

  it('reads runtime config from Expo extra with process.env fallback', () => {
    expect(runtimeConfigSource).toContain('Constants.expoConfig?.extra');
    expect(runtimeConfigSource).toContain('process.env[envKey]');
    expect(runtimeConfigSource).toContain('EXPO_PUBLIC_API_URL');
    expect(runtimeConfigSource).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(runtimeConfigSource).toContain('EXPO_PUBLIC_SENTRY_DSN');
  });

  it('uses the shared runtime config helper across mobile boot paths', () => {
    expect(apiSource).toContain('getApiUrl');
    expect(layoutSource).toContain('getClerkPublishableKey');
    expect(notificationsSource).toContain('getEasProjectId');
  });
});
