import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../../src/security/redact.js';

test('redactSecrets removes API keys and passwords recursively', () => {
  const redacted = redactSecrets({ apiKey: 'sk-test', nested: { password: 'pw', ok: true }, list: [{ authorization: 'Bearer token' }] });
  assert.equal(redacted.apiKey, '[REDACTED]');
  assert.equal(redacted.nested.password, '[REDACTED]');
  assert.equal(redacted.nested.ok, true);
  assert.equal(redacted.list[0].authorization, '[REDACTED]');
  assert(!JSON.stringify(redacted).includes('sk-test'));
  assert(!JSON.stringify(redacted).includes('pw'));
});
