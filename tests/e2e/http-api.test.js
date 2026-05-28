import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/server/index.js';

test('HTTP API supports parse, export refusal, confirm and export', async () => {
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const parsed = await post(`${base}/api/parse`, { text: 'free-form text without configured adapter' });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].type, 'step');
    const items = [{
      index: 0,
      id: 'manual-0',
      type: 'step',
      sourceText: 'manual item',
      expected: '',
      target: 'local',
      commandDraft: { value: 'pwd', provenance: 'user_edited', originalProvenance: 'inferred', confirmed: true, editState: 'dirty', rejected: false },
      validationDraft: { value: '', required: false, provenance: 'blank' }
    }];
    const refused = await post(`${base}/api/export`, { items: parsed.items }, false);
    assert.equal(refused.status, 422);
    assert(refused.json.gaps.some((gap) => gap.code === 'blank_command'));
    parsed.items = items;
    const exported = await fetch(`${base}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: parsed.items }) });
    assert.equal(exported.status, 200);
    assert.match(await exported.text(), /用例执行完成: PASS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('HTTP API accepts per-request CLI adapter config for extraction', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-http-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'extractTestCase') console.log(JSON.stringify({ok:true,items:[{type:'step',sourceText:'from adapter',intent:'from adapter',command:'pwd'}]}));
  else console.log(JSON.stringify({ok:true}));
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const parsed = await post(`${base}/api/parse`, { text: 'anything', adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 } });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].sourceText, 'from adapter');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP API supports staged decompose then per-item generation', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-staged-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'extractTestCase') console.log(JSON.stringify({ok:true,items:[{type:'step',label:'S1',sourceText:'S1 original',intent:'check step',expected:'ready'}]}));
  else if (req.task === 'inferCommand') console.log(JSON.stringify({ok:true,command:'echo ready'}));
  else if (req.task === 'inferValidation') console.log(JSON.stringify({ok:true,validation:'grep -q ready <<< "$COMMAND_OUTPUT"'}));
  else console.log(JSON.stringify({ok:true}));
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const adapterConfig = { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 };
    const decomposed = await post(`${base}/api/decompose`, { text: 'S1 original\nE1 ready', adapterConfig });
    assert.equal(decomposed.items.length, 1);
    assert.equal(decomposed.items[0].sourceText, 'S1 original');
    assert.equal(decomposed.items[0].commandDraft.value, '');
    assert(decomposed.interactionLog.some((entry) => entry.task === 'extractTestCase'));

    const generated = await post(`${base}/api/generate-item`, { item: decomposed.items[0], adapterConfig });
    assert.equal(generated.item.commandDraft.value, 'echo ready');
    assert.equal(generated.item.validationDraft.value, 'grep -q ready <<< "$COMMAND_OUTPUT"');
    assert(generated.interactionLog.some((entry) => entry.task === 'inferCommand'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP API forces model adapter timeout to the unified 10 minute value', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-timeout-override-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  setTimeout(() => {
    console.log(JSON.stringify({ok:true,items:[{type:'step',sourceText:'timeout override worked',intent:'timeout override worked'}]}));
  }, 80);
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await post(`${base}/api/decompose`, {
      text: 'anything',
      adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 1 }
    });
    assert.equal(result.items[0].sourceText, 'timeout override worked');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('HTTP API adapter health supports per-request config', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-health-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'health') console.log(JSON.stringify({ok:true,provider:'health-test',message:'ready'}));
  else console.log(JSON.stringify({ok:true}));
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await post(`${base}/api/adapter/health`, { adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 } });
    assert.equal(health.ok, true);
    assert.equal(health.provider, 'health-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('HTTP API redacts adapter secrets before returning logs', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-secret-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  console.log(JSON.stringify({ok:true,apiKey:'sk-should-not-return',nested:{password:'ssh-should-not-return'}}));
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await post(`${base}/api/adapter/health`, { adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 5000, apiKey: 'sk-request-secret' } });
    const serialized = JSON.stringify(result);
    assert(!serialized.includes('sk-should-not-return'));
    assert(!serialized.includes('ssh-should-not-return'));
    assert(!serialized.includes('sk-request-secret'));
    assert(serialized.includes('[REDACTED]'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('HTTP API returns adapter interaction logs on model failure', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-failing-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  console.error('simulated failure for ' + req.task);
  process.exit(2);
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await post(`${base}/api/decompose`, { text: 'anything', adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 } }, false);
    assert.equal(result.status, 502);
    assert.match(result.json.error, /exited 2/);
    assert.equal(result.json.interactionLog.length, 1);
    assert.equal(result.json.interactionLog[0].task, 'extractTestCase');
    assert.equal(result.json.interactionLog[0].status, 'error');
    assert.deepEqual(result.json.interactionLog[0].conversation.map((turn) => turn.role), ['stdin', 'stderr']);
    assert.match(result.json.interactionLog[0].conversation[0].content, /extractTestCase/);
    assert.match(result.json.interactionLog[0].conversation[1].content, /simulated failure/);
    const recent = await fetch(`${base}/api/interactions/recent`);
    assert.equal(recent.status, 200);
    const recentJson = await recent.json();
    const matching = recentJson.interactions.find((entry) => entry.id === result.json.interactionLog[0].id);
    assert.equal(matching.route, '/api/decompose');
    assert.equal(matching.task, 'extractTestCase');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP API exposes in-flight adapter interactions by trace id', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-live-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  setTimeout(() => {
    console.log(JSON.stringify({ok:true,items:[{type:'step',sourceText:'live',intent:'live'}]}));
  }, 250);
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const traceId = `test-trace-${Date.now()}`;
    const inFlight = fetch(`${base}/api/decompose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'anything', traceId, adapterConfig: { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 } })
    });
    const pending = await waitForJson(async () => {
      const response = await fetch(`${base}/api/interactions/recent?traceId=${encodeURIComponent(traceId)}`);
      const json = await response.json();
      return json.interactions.find((entry) => entry.status === 'pending' && entry.task === 'extractTestCase');
    });
    assert.equal(pending.route, '/api/decompose');
    assert.equal(pending.traceId, traceId);

    const completed = await inFlight;
    assert.equal(completed.status, 200);
    const finalRecent = await (await fetch(`${base}/api/interactions/recent?traceId=${encodeURIComponent(traceId)}`)).json();
    assert(finalRecent.interactions.some((entry) => entry.status === 'ok' && entry.task === 'extractTestCase'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP API exposes separate remote config confirmation and live SSH test', async () => {
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const confirmed = await post(`${base}/api/remote/health`, { config: { remote: { host: '10.0.0.1', username: 'root', password: 'secret' } }, live: false });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.config.auth, 'password');
    assert(!JSON.stringify(confirmed).includes('secret'));

    const missing = await post(`${base}/api/remote/health`, { config: { remote: { host: '10.0.0.1' } }, live: false });
    assert.equal(missing.ok, false);
    assert(missing.gaps.includes('remote_username_missing'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function post(url, body, expectOk = true) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  if (expectOk) assert.equal(response.ok, true, JSON.stringify(json));
  return expectOk ? json : { status: response.status, json };
}

async function waitForJson(factory, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await factory();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('expected JSON value was not available before timeout');
}

test('HTTP generate-item forwards remote host context to command adapter', async () => {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-remote-context-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw='';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'inferCommand') console.log(JSON.stringify({ok:true,command:'ssh root@' + req.context.execution.remote.host}));
  else console.log(JSON.stringify({ok:true,action:'no_match',ids:[]}));
});
`);
  await chmod(script, 0o755);
  const server = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const adapterConfig = { provider: 'cli', command: `node ${script}` };
    const result = await post(`${base}/api/generate-item`, {
      adapterConfig,
      config: { remote: { host: '192.0.2.55', username: 'admin', password: 'pw' } },
      item: { index: 0, type: 'step', sourceText: 'root用户登陆物理机器', intent: 'root用户登陆物理机器', target: 'host' }
    });
    assert.equal(result.item.commandDraft.value, 'ssh root@192.0.2.55');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
