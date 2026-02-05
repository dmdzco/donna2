/**
 * PII sanitization utilities.
 * Masks phone numbers, limits content previews, redacts sensitive fields.
 */

/**
 * Mask a phone number: "5551234567" -> "***4567"
 */
export function maskPhone(phone) {
  if (!phone) return '[no-phone]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '***' + digits.slice(-4);
}

/**
 * Truncate content for safe logging: "long string..." -> "long str..."
 */
export function truncate(str, maxLen = 30) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * Mask a senior name for logs: "David Zuluaga" -> "David Z."
 */
export function maskName(name) {
  if (!name) return '[unknown]';
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}
