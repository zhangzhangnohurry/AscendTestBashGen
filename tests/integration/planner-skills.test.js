import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decomposeTestCase, generateItemDraft, parseTestCase } from '../../src/planner/extract.js';
import { COMMAND_PROVENANCE } from '../../src/domain/types.js';
import { exportReadiness } from '../../src/domain/state.js';

class Adapter {
  constructor(items) { this.items = items; }
  async extractTestCase() { return { configured: true, items: this.items }; }
  async matchSkill(item, skills) {
    const match = skills.find((skill) => skill.intent === item.intent);
    return match ? { action: 'reuse', skillId: match.id } : { action: 'no_match' };
  }
  async inferCommand(intent) { return `echo inferred:${intent.slice(0, 5)}`; }
  async inferValidation() { return 'true'; }
}

class CountingAdapter extends Adapter {
  constructor(items) {
    super(items);
    this.inferCommandCalls = 0;
    this.inferValidationCalls = 0;
  }
  async inferCommand(intent) {
    this.inferCommandCalls += 1;
    return super.inferCommand(intent);
  }
  async inferValidation(expected) {
    this.inferValidationCalls += 1;
    return `grep -q ${JSON.stringify(expected)} <<< "$COMMAND_OUTPUT"`;
  }
}

test('explicit-command extraction preserves order and original provenance', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'step', sourceText: 'setup', intent: 'setup', command: 'echo setup', commandEvidence: 'explicit', expected: 'setup' },
    { type: 'step', sourceText: 'run', intent: 'run', command: 'echo run', commandEvidence: 'explicit', expected: 'run' }
  ]) });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].commandDraft.value, 'echo setup');
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
  assert.equal(parsed.items[1].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
});

test('adapter command without explicit evidence is treated as unconfirmed inference', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'step', sourceText: 'P1 确认环境满足要求', intent: 'check environment requirement', command: 'vendor-tool inspect requirement', commandEvidence: 'inferred', expected: 'requirement met' }
  ]) });
  assert.equal(parsed.items[0].commandDraft.value, 'vendor-tool inspect requirement');
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.INFERRED);
  assert.equal(parsed.items[0].commandDraft.confirmed, false);
  assert(parsed.worklog.some((line) => line.includes('requires review')));
});

test('decompose is structure-only and generate item fills drafts one at a time', async () => {
  const adapter = new CountingAdapter([
    { type: 'step', label: 'S1', sourceText: 'S1', intent: 'check prerequisite', target: 'host' },
    { type: 'step', label: 'S2', sourceText: 'S2', intent: 'run action', command: 'echo action', commandEvidence: 'explicit', target: 'host' }
  ]);
  const decomposed = await decomposeTestCase('S1 检查前置条件\nE1 ok\nS2 执行动作', { adapter });
  assert.equal(decomposed.items.length, 2);
  assert.equal(decomposed.items[0].commandDraft.value, '');
  assert.equal(adapter.inferCommandCalls, 0);
  assert.equal(adapter.inferValidationCalls, 0);

  const first = await generateItemDraft(decomposed.items[0], { adapter });
  assert.equal(first.commandDraft.value, 'echo inferred:check');
  assert.equal(first.validationDraft.value, 'grep -q "ok" <<< "$COMMAND_OUTPUT"');
  assert.equal(adapter.inferCommandCalls, 1);
  assert.equal(adapter.inferValidationCalls, 1);
});

test('adapter-selected skill reuse auto-populates editable command without reuse confirmation', async () => {
  const skills = [{ id: 's1', intent: 'check network connectivity', command: 'ping -c 1 127.0.0.1', validation: 'grep -q . <<< "$COMMAND_OUTPUT"', target: 'local' }];
  const parsed = await parseTestCase('raw text ignored by test adapter', { skills, adapter: new Adapter([{ type: 'step', sourceText: 'check network connectivity', intent: 'check network connectivity' }]) });
  assert.equal(parsed.items[0].commandDraft.value, 'ping -c 1 127.0.0.1');
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.SKILL_REUSE);
  assert.equal(parsed.items[0].commandDraft.confirmed, true);
});


test('adapter items preserve source order without regrouping', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'step', sourceText: 'S1', intent: 'S1', command: 'echo s1', commandEvidence: 'explicit' },
    { type: 'step', sourceText: 'P1', intent: 'P1', command: 'echo p1', commandEvidence: 'explicit' },
    { type: 'step', sourceText: 'S2', intent: 'S2', command: 'echo s2', commandEvidence: 'explicit' },
    { type: 'step', sourceText: 'P2', intent: 'P2', command: 'echo p2', commandEvidence: 'explicit' }
  ]) });
  assert.deepEqual(parsed.items.map((item) => item.sourceText), ['S1', 'P1', 'S2', 'P2']);
  assert.deepEqual(parsed.items.map((item) => item.index), [0, 1, 2, 3]);
});

test('manual conditional actions from adapter remain as blocking blank-command items', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'step', sourceText: '若检查结果不满足要求，则执行外部手工恢复动作', intent: 'perform external manual recovery when prerequisite fails', commandEvidence: 'none', target: 'host' },
    { type: 'step', sourceText: '执行 vendor-tool clear-state', intent: 'clear state', command: 'vendor-tool clear-state', commandEvidence: 'explicit', target: 'host' }
  ]) });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].commandDraft.value, '');
  assert.equal(parsed.items[0].sourceText.includes('外部手工恢复动作'), true);
  assert.equal(parsed.items[1].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
});

test('adapter-provided expected and validation are ignored unless sourced from E sections', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    {
      type: 'step',
      sourceText: 'P1、确认使用指定产品型号',
      intent: 'check product model',
      command: 'vendor-tool inspect product',
      commandEvidence: 'inferred',
      expected: 'specified product model',
      validation: '检查$COMMAND_OUTPUT中产品型号符合预期',
      validationEvidence: 'inferred',
      target: 'host'
    },
    {
      type: 'step',
      sourceText: '若检查结果不满足预置条件，则执行外部系统上下电',
      intent: 'perform external power cycle when prerequisite fails',
      commandEvidence: 'none',
      target: 'host'
    },
    {
      type: 'step',
      sourceText: '执行 vendor-tool clear-state 清除状态',
      intent: 'clear device state',
      command: 'vendor-tool clear-state',
      commandEvidence: 'explicit',
      target: 'host'
    }
  ]) });
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.INFERRED);
  assert.equal(parsed.items[0].commandDraft.confirmed, false);
  assert.equal(parsed.items[0].expected, '');
  assert.equal(parsed.items[0].validationDraft.required, false);
  assert.equal(parsed.items[1].commandDraft.value, '');

  const readiness = exportReadiness(parsed.items, { remote: { host: '1.2.3.4', username: 'root', password: 'pw' } });
  assert(readiness.gaps.some((gap) => gap.code === 'unconfirmed_inferred_command'));
  assert.equal(readiness.gaps.some((gap) => gap.code === 'unconfirmed_inferred_validation'), false);
  assert(readiness.gaps.some((gap) => gap.code === 'blank_command'));
});

test('skill store writes only with explicit confirmation', async () => {
  process.env.WORKBENCH_DIR = await mkdtemp(path.join(tmpdir(), 'cw-skills-'));
  const mod = await import(`../../src/skills/store.js?case=${Date.now()}`);
  const blocked = await mod.persistSkill({ intent: 'x', command: 'echo x', confirmed: false });
  assert.equal(blocked.persisted, false);
  assert.equal((await mod.listSkills()).length, 0);
  const saved = await mod.persistSkill({ intent: 'x', command: 'echo x', confirmed: true });
  assert.equal(saved.persisted, true);
  assert.equal((await mod.listSkills()).length, 1);
});

test('remote login source receives SSH host context during command generation', async () => {
  const seen = [];
  const adapter = {
    async extractTestCase() { return { configured: false, items: [] }; },
    async matchSkill() { return { action: 'no_match' }; },
    async inferCommand(intent, context) {
      seen.push(context.execution.remote);
      return `ssh root@${context.execution.remote.host}`;
    }
  };

  const item = {
    index: 0,
    type: 'step',
    label: 'S1',
    sourceText: 'root用户登陆物理机器，登陆device侧，并切换device侧root用户',
    intent: 'root用户登陆物理机器，登陆device侧，并切换device侧root用户',
    expected: '',
    target: 'host'
  };
  const generated = await generateItemDraft(item, {
    adapter,
    config: { remote: { host: '192.0.2.10', username: 'admin', password: 'secret' } }
  });

  assert.equal(generated.commandDraft.value, 'ssh root@192.0.2.10');
  assert.deepEqual(seen[0], { host: '192.0.2.10', username: 'admin', port: 22, authMode: 'password', rootMode: false });
});
