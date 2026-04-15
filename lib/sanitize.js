/**
 * PII sanitization utilities.
 * Masks phone numbers, limits content previews, redacts sensitive fields.
 */

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

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
  const value = String(str);
  if (value.length <= maxLen) return value;
  return value.substring(0, maxLen) + '...';
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

/**
 * Mask phone-looking substrings inside free-form error messages.
 */
export function maskPhonesInText(text) {
  if (text == null) return text;
  return String(text).replace(PHONE_PATTERN, match => maskPhone(match));
}

/**
 * Return a safe, non-PHI error summary for structured logs.
 */
export function sanitizeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    code: error.code,
    message: truncate(maskPhonesInText(error.message || String(error)), 160),
  };
}
