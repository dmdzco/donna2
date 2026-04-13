/**
 * Schedule Route Authorization Tests
 *
 * Verifies that GET/PATCH /api/seniors/:id/schedule endpoints
 * properly check canAccessSenior() authorization (Bug #4 fix).
 *
 * These tests validate the route logic by examining the route handler
 * code structure, since we can't easily mount the full Express app
 * with all its middleware in unit tests.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the actual route source to verify authorization is present
const routeSource = fs.readFileSync(
  path.resolve('routes/seniors.js'),
  'utf-8',
);

describe('Schedule Route Authorization (Bug #4)', () => {
  describe('GET /api/seniors/:id/schedule', () => {
    it('includes canAccessSenior check', () => {
      // Find the GET schedule handler and verify it calls canAccessSenior
      const getScheduleSection = routeSource.match(
        /router\.get\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
      );
      expect(getScheduleSection).not.toBeNull();
      expect(getScheduleSection[0]).toContain('canAccessSenior');
    });

    it('returns 403 when access denied', () => {
      const getScheduleSection = routeSource.match(
        /router\.get\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
      );
      expect(getScheduleSection[0]).toContain("403");
      expect(getScheduleSection[0]).toContain("Access denied");
    });

    it('uses requireAuth middleware', () => {
      expect(routeSource).toMatch(
        /router\.get\('\/api\/seniors\/:id\/schedule',\s*requireAuth/,
      );
    });

    it('uses validateParams middleware', () => {
      expect(routeSource).toMatch(
        /router\.get\('\/api\/seniors\/:id\/schedule'.*validateParams\(seniorIdParamSchema\)/,
      );
    });
  });

  describe('PATCH /api/seniors/:id/schedule', () => {
    it('includes canAccessSenior check', () => {
      // Find the PATCH schedule handler
      const patchScheduleSection = routeSource.match(
        /router\.patch\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
      );
      expect(patchScheduleSection).not.toBeNull();
      expect(patchScheduleSection[0]).toContain('canAccessSenior');
    });

    it('returns 403 when access denied', () => {
      const patchScheduleSection = routeSource.match(
        /router\.patch\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
      );
      expect(patchScheduleSection[0]).toContain("403");
      expect(patchScheduleSection[0]).toContain("Access denied");
    });

    it('uses requireAuth middleware', () => {
      expect(routeSource).toMatch(
        /router\.patch\('\/api\/seniors\/:id\/schedule'.*requireAuth/,
      );
    });

    it('uses writeLimiter middleware', () => {
      expect(routeSource).toMatch(
        /router\.patch\('\/api\/seniors\/:id\/schedule'.*writeLimiter/,
      );
    });

    it('uses validateBody with updateScheduleSchema', () => {
      expect(routeSource).toMatch(
        /router\.patch\('\/api\/seniors\/:id\/schedule'.*validateBody\(updateScheduleSchema\)/,
      );
    });

    it('uses validateParams middleware', () => {
      expect(routeSource).toMatch(
        /router\.patch\('\/api\/seniors\/:id\/schedule'.*validateParams\(seniorIdParamSchema\)/,
      );
    });
  });

  describe('Authorization consistency with other senior routes', () => {
    it('GET /api/seniors/:id also uses canAccessSenior', () => {
      const getSeniorSection = routeSource.match(
        /router\.get\('\/api\/seniors\/:id'(?!\/schedule)[\s\S]*?(?=router\.(get|patch|post|delete|put)\()/,
      );
      expect(getSeniorSection).not.toBeNull();
      expect(getSeniorSection[0]).toContain('canAccessSenior');
    });

    it('PATCH /api/seniors/:id also uses canAccessSenior', () => {
      const patchSeniorSection = routeSource.match(
        /router\.patch\('\/api\/seniors\/:id'(?!\/schedule)[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
      );
      expect(patchSeniorSection).not.toBeNull();
      expect(patchSeniorSection[0]).toContain('canAccessSenior');
    });
  });
});

describe('Schedule Route uses topicsToAvoid (Bug #9)', () => {
  it('GET handler returns topicsToAvoid, not updateTopics', () => {
    const getHandler = routeSource.match(
      /router\.get\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
    );
    expect(getHandler[0]).toContain('topicsToAvoid');
    expect(getHandler[0]).not.toContain('updateTopics');
  });

  it('PATCH handler uses topicsToAvoid, not updateTopics', () => {
    const patchHandler = routeSource.match(
      /router\.patch\('\/api\/seniors\/:id\/schedule'[\s\S]*?(?=router\.(get|patch|post|delete|put)\(|export)/,
    );
    expect(patchHandler[0]).toContain('topicsToAvoid');
    expect(patchHandler[0]).not.toContain('updateTopics');
  });
});
