import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigurableAdapter } from '../../src/llm/adapter.js';

test('disabled adapter reports unconfigured and returns no inferred text', async () => {
  const adapter = new ConfigurableAdapter({ provider: 'disabled', timeoutMs: 1000 });
  const health = await adapter.health();
  assert.equal(health.ok, false);
  assert.equal(health.configured, false);
  assert.equal(await adapter.inferCommand('do something'), '');
});

test('CLI adapter uses JSON stdin/stdout contract', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-adapter-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw = '';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'health') console.log(JSON.stringify({ok:true,message:'ready'}));
  if (req.task === 'extractTestCase') console.log(JSON.stringify({ok:true,items:[{type:'step',sourceText:'adapter item',intent:'adapter item',command:'echo configured'}]}));
  if (req.task === 'matchSkill') console.log(JSON.stringify({ok:true,action:'reuse',skillId:req.skills[0].id}));
  if (req.task === 'inferCommand') console.log(JSON.stringify({ok:true,command:'echo configured'}));
  if (req.task === 'inferValidation') console.log(JSON.stringify({ok:true,validation:'true'}));
  if (req.task === 'selectKnowledge') console.log(JSON.stringify({ok:true,ids:[req.candidates[0].id]}));
});
`);
  await chmod(script, 0o755);
  const adapter = new ConfigurableAdapter({ provider: 'cli', command: `node ${script}`, timeoutMs: 5000 });
  assert.equal((await adapter.health()).ok, true);
  assert.equal((await adapter.extractTestCase('anything')).items.length, 1);
  assert.deepEqual(await adapter.matchSkill({ intent: 'x' }, [{ id: 's1', intent: 'x', command: 'hidden command' }]), { action: 'reuse', skillId: 's1' });
  assert.equal(await adapter.inferCommand('anything'), 'echo configured');
  assert.equal(await adapter.inferValidation('ok'), 'true');
  assert.deepEqual((await adapter.selectKnowledge({ phase: 'generate', candidates: [{ id: 'k1', title: 'K', summary: 'S' }] })).ids, ['k1']);
});

test('CLI adapter trace includes stdin/stdout conversation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-adapter-trace-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw = '';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  console.log(JSON.stringify({ok:true,command:'echo ' + req.intent}));
});
`);
  await chmod(script, 0o755);
  const trace = [];
  const adapter = new ConfigurableAdapter({ provider: 'cli', command: `node ${script}`, timeoutMs: 5000 }, { trace });
  assert.equal(await adapter.inferCommand('ready'), 'echo ready');
  assert.equal(trace.length, 1);
  assert.deepEqual(trace[0].conversation.map((turn) => turn.role), ['stdin', 'stdout']);
  assert.match(trace[0].conversation[0].content, /"task": "inferCommand"/);
  assert.match(trace[0].conversation[1].content, /echo ready/);
});

test('CLI adapter emits a pending trace update before command completes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-adapter-live-trace-'));
  const script = path.join(dir, 'adapter.cjs');
  await writeFile(script, `
process.stdin.setEncoding('utf8');
let raw = '';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  setTimeout(() => console.log(JSON.stringify({ok:true,command:'echo ' + req.intent})), 120);
});
`);
  await chmod(script, 0o755);
  const updates = [];
  const adapter = new ConfigurableAdapter(
    { provider: 'cli', command: `node ${script}`, timeoutMs: 5000 },
    { onTraceUpdate: (entry) => updates.push(entry) }
  );
  const pending = adapter.inferCommand('live');
  await waitFor(() => updates.some((entry) => entry.status === 'pending'));
  assert.equal(updates[0].status, 'pending');
  assert.deepEqual(updates[0].conversation.map((turn) => turn.role), ['stdin']);
  assert.equal(await pending, 'echo live');
  assert.equal(updates.at(-1).status, 'ok');
  assert.deepEqual(updates.at(-1).conversation.map((turn) => turn.role), ['stdin', 'stdout']);
});

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('condition was not met before timeout');
}

test('local Claude/Codex providers perform local command health checks without adapter JSON', async () => {
  const adapter = new ConfigurableAdapter({ provider: 'local-claude', command: 'node', timeoutMs: 1000 });
  const health = await adapter.health();
  assert.equal(health.ok, true);
  assert.equal(health.provider, 'local-claude');
});

test('LLM API provider requires only url, key, and model and parses chat-completions JSON content', async () => {
  const http = await import('node:http');
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-key');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.model, 'test-model');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true, items: [{ type: 'step', sourceText: 'api item', intent: 'api item', command: 'pwd' }] }) } }] }));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const trace = [];
    const adapter = new ConfigurableAdapter({ provider: 'llm-api', url: `http://127.0.0.1:${server.address().port}`, apiKey: 'test-key', model: 'test-model', timeoutMs: 5000 }, { trace });
    const extracted = await adapter.extractTestCase('anything');
    assert.equal(extracted.items.length, 1);
    assert.equal(extracted.items[0].sourceText, 'api item');
    assert.deepEqual(trace[0].conversation.map((turn) => turn.role), ['system', 'user', 'assistant']);
    assert.match(trace[0].conversation[1].content, /anything/);
    assert.match(trace[0].conversation[2].content, /api item/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
