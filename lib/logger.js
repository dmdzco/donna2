import { maskPhone, maskName, truncate } from './sanitize.js';

/**
 * Structured logger that sanitizes PII automatically.
 * Wraps console.log/error/warn with tag-based formatting.
 *
 * Usage:
 *   import { createLogger } from '../lib/logger.js';
 *   const log = createLogger('Memory');
 *   log.info('Stored memory', { seniorId: '...', content: 'long text...' });
 */
export function createLogger(tag) {
  const prefix = `[${tag}]`;

  return {
    info(message, meta = {}) {
      console.log(prefix, message, sanitizeMeta(meta));
    },
    warn(message, meta = {}) {
      console.warn(prefix, message, sanitizeMeta(meta));
    },
    error(message, meta = {}) {
      console.error(prefix, message, sanitizeMeta(meta));
    },
  };
}

/**
 * Auto-sanitize known PII fields in metadata objects.
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const safe = { ...meta };

  if (safe.phone) safe.phone = maskPhone(safe.phone);
  if (safe.seniorPhone) safe.seniorPhone = maskPhone(safe.seniorPhone);
  if (safe.fromPhone) safe.fromPhone = maskPhone(safe.fromPhone);
  if (safe.name) safe.name = maskName(safe.name);
  if (safe.seniorName) safe.seniorName = maskName(safe.seniorName);
  if (safe.content) safe.content = truncate(safe.content, 50);

  return safe;
}
