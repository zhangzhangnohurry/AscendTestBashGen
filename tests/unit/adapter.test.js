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
    const adapter = new ConfigurableAdapter({ provider: 'llm-api', url: `http://127.0.0.1:${server.address().port}`, apiKey: 'test-key', model: 'test-model', timeoutMs: 5000 });
    const extracted = await adapter.extractTestCase('anything');
    assert.equal(extracted.items.length, 1);
    assert.equal(extracted.items[0].sourceText, 'api item');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
