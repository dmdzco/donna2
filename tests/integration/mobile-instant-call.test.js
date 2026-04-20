import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

const dashboardSource = read('apps', 'mobile', 'app', '(tabs)', 'index.tsx');
const mobilePackageSource = read('apps', 'mobile', 'package.json');
const instantCallFlowSource = read('apps', 'mobile', '.maestro', 'manual', 'instant_call.yaml');

describe('mobile instant-call regression coverage', () => {
  it('exposes stable selectors and safe call error rendering on the dashboard', () => {
    expect(dashboardSource).toContain('testID="instant-call-open"');
    expect(dashboardSource).toContain('testID="instant-call-submit"');
    expect(dashboardSource).toContain('testID="instant-call-error"');
    expect(dashboardSource).toContain('"call",');
  });

  it('ships a dedicated Maestro flow for the live instant-call path', () => {
    expect(mobilePackageSource).toContain('"test:e2e:instant-call": "maestro test .maestro/manual/instant_call.yaml"');
    expect(instantCallFlowSource).toContain('id: "instant-call-open"');
    expect(instantCallFlowSource).toContain('id: "instant-call-submit"');
    expect(instantCallFlowSource).toContain('notVisible: "Instant Call"');
  });
});
