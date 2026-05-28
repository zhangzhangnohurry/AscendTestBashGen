/**
 * Secret redaction is a log-safety layer, not semantic input analysis. The
 * pattern only checks object key names / JSON-like key labels so API keys and
 * SSH passwords do not echo back through server responses or UI logs.
 */
const SENSITIVE_KEY_PATTERN = /(?:password|apiKey|authorization|token|secret)/i;

export function redactSecrets(value) {
  return redact(value, new WeakSet());
}

function redact(value, seen) {
  if (typeof value === 'string') return redactSecretText(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(entry, seen);
  }
  seen.delete(value);
  return output;
}

function redactSecretText(text) {
  return String(text).replace(/(\"?(?:password|apiKey|authorization|token|secret)\"?\s*[:=]\s*)\"?[^\",}\s]+\"?/gi, '$1[REDACTED]');
}
