import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function seedKnowledge() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-knowledge-planner-'));
  process.env.WORKBENCH_DIR = dir;
  const knowledgeDir = path.join(dir, 'knowledge');
  await mkdir(path.join(knowledgeDir, 'items'), { recursive: true });
  await writeFile(path.join(knowledgeDir, 'items', 'experience.md'), '# Experience\n\nPrefer explicit context switching when needed.');
  await writeFile(path.join(knowledgeDir, 'index.json'), JSON.stringify({
    version: 1,
    items: [{ id: 'experience', title: 'Experience', summary: 'Relevant generation experience.', path: 'items/experience.md', enabled: true, phases: ['generate'], isDeviceShell: false, strength: 'must' }]
  }));
}

test('planner skips knowledge during decompose and injects selected markdown during generation', async () => {
  await seedKnowledge();
  const { decomposeTestCase, generateItemDraft } = await import(`../../src/planner/extract.js?case=${Date.now()}`);
  const seen = [];
  const adapter = {
    async selectKnowledge(request) {
      seen.push({ task: 'selectKnowledge', phase: request.phase, candidates: request.candidates.map((item) => item.id) });
      return { configured: true, ids: ['experience'] };
    },
    async extractTestCase(text, context) {
      seen.push({ task: 'extractTestCase', knowledge: context.knowledge.map((item) => item.id), content: context.knowledge[0]?.content });
      return { configured: true, items: [{ type: 'step', sourceText: 'S1', intent: 'do S1', expected: 'ok', target: 'host' }] };
    },
    async matchSkill() { return { action: 'no_match' }; },
    async inferCommand(intent, context) {
      seen.push({ task: 'inferCommand', knowledge: context.knowledge.map((item) => item.id), content: context.knowledge[0]?.content });
      return 'echo from-knowledge-context';
    },
    async inferValidation() { return ''; }
  };

  const decomposed = await decomposeTestCase('raw input', { adapter });
  const generated = await generateItemDraft(decomposed.items[0], { adapter });

  assert.equal(generated.commandDraft.value, 'echo from-knowledge-context');
  assert.deepEqual(seen.filter((entry) => entry.task === 'selectKnowledge').map((entry) => entry.phase), ['generate']);
  assert.equal(seen.find((entry) => entry.task === 'extractTestCase').knowledge.length, 0);
  assert.match(seen.find((entry) => entry.task === 'inferCommand').content, /explicit context switching/);
});

test('SSH login experience is persisted as generation knowledge and receives remote context', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-ssh-knowledge-'));
  process.env.WORKBENCH_DIR = dir;
  const knowledgeDir = path.join(dir, 'knowledge');
  await mkdir(path.join(knowledgeDir, 'items'), { recursive: true });
  await writeFile(path.join(knowledgeDir, 'items', 'ssh-login.md'), '# SSH login\n\nWhen source says root user logs in to the physical host, generate `ssh root@$remote_host` using `execution.remote.host`.');
  await writeFile(path.join(knowledgeDir, 'index.json'), JSON.stringify({
    version: 1,
    items: [{
      id: 'ssh-login',
      title: '样例：登录物理机使用 SSH',
      summary: 'root 用户登录物理机器时生成 ssh root@execution.remote.host',
      path: 'items/ssh-login.md',
      enabled: true,
      phases: ['generate'],
      isDeviceShell: false,
      strength: 'must'
    }]
  }));

  const { generateItemDraft } = await import(`../../src/planner/extract.js?case=${Date.now()}-ssh`);
  const seen = [];
  const adapter = {
    async selectKnowledge(request) {
      seen.push({ task: 'selectKnowledge', candidates: request.candidates.map((item) => item.id) });
      return { configured: true, ids: ['ssh-login'] };
    },
    async matchSkill() { return { action: 'no_match' }; },
    async inferCommand(_intent, context) {
      seen.push({ task: 'inferCommand', knowledge: context.knowledge[0]?.content, remote: context.execution.remote });
      return `ssh root@${context.execution.remote.host}`;
    }
  };

  const generated = await generateItemDraft({
    index: 0,
    type: 'step',
    sourceText: 'root用户登陆物理机器',
    intent: 'root用户登陆物理机器',
    target: 'host'
  }, {
    adapter,
    config: { remote: { host: '192.0.2.88', username: 'admin', password: 'pw' } }
  });

  assert.deepEqual(seen.find((entry) => entry.task === 'selectKnowledge').candidates, ['ssh-login']);
  assert.match(seen.find((entry) => entry.task === 'inferCommand').knowledge, /ssh root@\$remote_host/);
  assert.equal(seen.find((entry) => entry.task === 'inferCommand').remote.host, '192.0.2.88');
  assert.equal(generated.commandDraft.value, 'ssh root@192.0.2.88');
});
