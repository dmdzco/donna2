import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const routeSource = fs.readFileSync(
  path.resolve('routes/conversations.js'),
  'utf-8',
);

function routeSection(method, route) {
  const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = routeSource.match(
    new RegExp(`router\\.${method}\\('${escapedRoute}'[\\s\\S]*?(?=router\\.(get|patch|post|delete|put)\\(|export)`)
  );
  expect(section).not.toBeNull();
  return section[0];
}

describe('caregiver conversation summary access', () => {
  it('exposes a summary-only calls route with auth and per-senior authorization', () => {
    const section = routeSection('get', '/api/seniors/:id/calls');

    expect(section).toContain('requireAuth');
    expect(section).toContain('validateParams(seniorIdParamSchema)');
    expect(section).toContain('canAccessSenior');
    expect(section).toContain('getCallSummariesForSenior');
    expect(section).toContain('view: \'call_summaries\'');
    expect(section).not.toContain('getForSenior');
    expect(section).not.toContain('transcript');
  });

  it('keeps senior-specific full conversations admin-only', () => {
    const section = routeSection('get', '/api/seniors/:id/conversations');

    expect(section).toContain('canAccessSenior');
    expect(section).toContain('req.auth.isAdmin');
    expect(section).toContain('getForSenior');
    expect(section).toContain('getCallSummariesForSenior');
  });

  it('uses summary-only conversation lists for non-admin users', () => {
    const section = routeSection('get', '/api/conversations');

    expect(section).toContain('req.auth.isAdmin');
    expect(section).toContain('getRecent(50)');
    expect(section).toContain('getAccessibleSeniorIds');
    expect(section).toContain('getRecentCallSummariesForSeniors(accessibleIds, 50)');
    expect(section.indexOf('getAccessibleSeniorIds')).toBeLessThan(section.indexOf('getRecentCallSummariesForSeniors'));
  });
});
