/**
 * GrowthBook feature flag integration for Node.js.
 *
 * Shared client that initializes once at startup. Resolves flags per
 * scheduler cycle using user attributes. Falls back gracefully when
 * GrowthBook is unavailable — all flags return their defaults.
 *
 * Usage:
 *   import { initGrowthBook, closeGrowthBook, resolveFlags, isOn, getValue } from './lib/growthbook.js';
 *
 *   // At startup (index.js)
 *   await initGrowthBook();
 *
 *   // Per scheduler cycle
 *   const flags = await resolveFlags({ id: seniorId, timezone });
 *   const stagger = getValue('scheduler_call_stagger_ms', flags, 5000);
 */

import { GrowthBook } from '@growthbook/growthbook';
import { createLogger } from './logger.js';

const log = createLogger('GrowthBook');

let client = null;
let initialized = false;

const DEFAULTS = {
  director_enabled: true,
  news_search_enabled: true,
  memory_search_enabled: true,
  tts_fallback: false,
  context_cache_enabled: true,
  post_call_analysis_enabled: true,
  scheduler_call_stagger_ms: 5000,
};

export async function initGrowthBook() {
  const apiHost = process.env.GROWTHBOOK_API_HOST;
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;

  if (!apiHost || !clientKey) {
    log.info('GrowthBook not configured (no GROWTHBOOK_API_HOST/CLIENT_KEY)');
    return false;
  }

  try {
    client = new GrowthBook({
      apiHost,
      clientKey,
      enableDevMode: process.env.NODE_ENV !== 'production',
    });
    await client.loadFeatures({ timeout: 5000 });
    initialized = true;
    log.info('GrowthBook initialized');
    return true;
  } catch (err) {
    log.warn('GrowthBook init failed — using defaults', { error: err.message });
    return false;
  }
}

export function closeGrowthBook() {
  if (client) {
    client.destroy();
    client = null;
    initialized = false;
  }
}

export async function resolveFlags(attributes = {}) {
  if (!initialized || !client) {
    return { ...DEFAULTS };
  }

  try {
    client.setAttributes(attributes);
    const resolved = {};
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      if (typeof defaultVal === 'boolean') {
        resolved[key] = client.isOn(key);
      } else {
        resolved[key] = client.getFeatureValue(key, defaultVal);
      }
    }
    return resolved;
  } catch (err) {
    log.warn('GrowthBook flag resolution failed — using defaults', { error: err.message });
    return { ...DEFAULTS };
  }
}

export function isOn(flag, flags, defaultVal = true) {
  if (!flags) return defaultVal;
  return flags[flag] ?? defaultVal;
}

export function getValue(flag, flags, defaultVal = null) {
  if (!flags) return defaultVal;
  return flags[flag] ?? defaultVal;
}
