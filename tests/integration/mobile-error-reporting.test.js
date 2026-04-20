import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const errorReportingSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/errorReporting.ts'),
  'utf-8',
);
const runtimeConfigSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/runtimeConfig.ts'),
  'utf-8',
);
const layoutSource = fs.readFileSync(
  path.resolve('apps/mobile/app/_layout.tsx'),
  'utf-8',
);
const boundarySource = fs.readFileSync(
  path.resolve('apps/mobile/src/components/ErrorBoundary.tsx'),
  'utf-8',
);
const metroSource = fs.readFileSync(
  path.resolve('apps/mobile/metro.config.js'),
  'utf-8',
);

describe('mobile error reporting privacy', () => {
  it('initializes Sentry only when a public DSN is configured', () => {
    expect(errorReportingSource).toContain('getSentryDsn()');
    expect(runtimeConfigSource).toContain('EXPO_PUBLIC_SENTRY_DSN');
    expect(errorReportingSource).toContain('if (isEnabled)');
    expect(layoutSource).toContain('withErrorReporting(RootLayout)');
  });

  it('keeps PHI-heavy Sentry features disabled', () => {
    expect(errorReportingSource).toContain('sendDefaultPii: false');
    expect(errorReportingSource).toContain('tracesSampleRate: 0');
    expect(errorReportingSource).toContain('profilesSampleRate: 0');
    expect(errorReportingSource).toContain('replaysSessionSampleRate: 0');
    expect(errorReportingSource).toContain('replaysOnErrorSampleRate: 0');
    expect(errorReportingSource).toContain('enableLogs: false');
    expect(errorReportingSource).toContain('attachScreenshot: false');
    expect(errorReportingSource).toContain('attachViewHierarchy: false');
  });

  it('scrubs event fields and captures sanitized error-boundary crashes', () => {
    expect(errorReportingSource).toContain('beforeSend: (event) => scrubEvent(event)');
    expect(errorReportingSource).toContain('beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb)');
    expect(errorReportingSource).toContain('delete sanitized.user');
    expect(errorReportingSource).toContain('delete sanitized.request');
    expect(errorReportingSource).toContain('isSensitiveKey');
    expect(boundarySource).toContain('captureBoundaryException(error, errorInfo)');
  });

  it('uses the Sentry Metro config so release bundles get debug IDs', () => {
    expect(metroSource).toContain("getSentryExpoConfig(__dirname)");
    expect(metroSource).toContain('withNativeWind(config');
  });
});
