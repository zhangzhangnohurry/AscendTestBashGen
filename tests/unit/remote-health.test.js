import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteHealth, remoteLiveHealth } from '../../src/executor/remote.js';

test('remote config confirmation validates required SSH fields without live connection', () => {
  const missing = remoteHealth({ remote: { host: '10.0.0.1' } });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.gaps, ['remote_username_missing', 'remote_password_missing']);

  const confirmed = remoteHealth({ remote: { host: '10.0.0.1', username: 'root', password: 'secret' } });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.config.auth, 'password');
  assert.equal(confirmed.config.port, 22);
});

test('password live SSH check explains missing sshpass instead of silently pretending success', async () => {
  const result = await remoteLiveHealth(
    { remote: { host: '10.0.0.1', username: 'root', password: 'secret' } },
    { commandAvailable: async (command) => command === 'ssh' }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps, ['sshpass_missing']);
  assert.match(result.message, /sshpass/);
});

test('key live SSH check reports success from captured SSH output', async () => {
  const calls = [];
  const result = await remoteLiveHealth(
    { remote: { host: '10.0.0.1', username: 'root', privateKeyPath: '/tmp/id_rsa' } },
    {
      commandAvailable: async (command) => command === 'ssh',
      runProcess: async (command, args) => {
        calls.push({ command, args });
        return { code: 0, stdout: 'workbench-ssh-ok', stderr: '' };
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].command, 'ssh');
  assert(calls[0].args.includes('-i'));
  assert(!JSON.stringify(result).includes('secret'));
});
