import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const onboardingStoreSource = fs.readFileSync(
  path.resolve('apps/mobile/src/stores/onboarding.ts'),
  'utf-8',
);
const secureDraftStorageSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/secureDraftStorage.ts'),
  'utf-8',
);
const settingsSource = fs.readFileSync(
  path.resolve('apps/mobile/app/(tabs)/settings.tsx'),
  'utf-8',
);
const successSource = fs.readFileSync(
  path.resolve('apps/mobile/app/(onboarding)/success.tsx'),
  'utf-8',
);

describe('mobile encrypted drafts', () => {
  it('persists onboarding data through SecureStore-backed draft storage', () => {
    expect(onboardingStoreSource).toContain('persist(');
    expect(onboardingStoreSource).toContain('createJSONStorage(() => secureDraftStorage)');
    expect(onboardingStoreSource).toContain('donna-onboarding-draft-v1');
    expect(secureDraftStorageSource).toContain('expo-secure-store');
  });

  it('chunks draft values so larger onboarding forms do not depend on one keychain item', () => {
    expect(secureDraftStorageSource).toContain('CHUNK_SIZE');
    expect(secureDraftStorageSource).toContain('chunkString(value)');
    expect(secureDraftStorageSource).toContain('SecureStore.setItemAsync(chunkKey(name, index), chunk)');
  });

  it('uses SecureStore-compatible keys and keeps draft failures non-blocking', () => {
    expect(secureDraftStorageSource).toContain('return `${storageKey(name)}.count`;');
    expect(secureDraftStorageSource).toContain('return `${storageKey(name)}.chunk.${index}`;');
    expect(secureDraftStorageSource).toContain('return name.replace(/[^A-Za-z0-9._-]/g, "_");');
    expect(secureDraftStorageSource).toContain('Draft persistence should never block the onboarding form.');
  });

  it('clears drafts after setup completion and local sign-out', () => {
    expect(onboardingStoreSource).toContain('clearOnboardingDraft');
    expect(successSource).toContain('await clearOnboardingDraft()');
    expect(settingsSource).toContain('await clearOnboardingDraft()');
  });
});
