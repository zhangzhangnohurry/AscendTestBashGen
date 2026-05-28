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
    { type: 'precondition', sourceText: 'setup', intent: 'setup', command: 'echo setup', commandEvidence: 'explicit', expected: 'setup' },
    { type: 'step', sourceText: 'run', intent: 'run', command: 'echo run', commandEvidence: 'explicit', expected: 'run' }
  ]) });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].commandDraft.value, 'echo setup');
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
  assert.equal(parsed.items[1].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
});

test('adapter command without explicit evidence is treated as unconfirmed inference', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'precondition', sourceText: 'P1 确认环境满足要求', intent: 'check environment requirement', command: 'vendor-tool inspect requirement', commandEvidence: 'inferred', expected: 'requirement met' }
  ]) });
  assert.equal(parsed.items[0].commandDraft.value, 'vendor-tool inspect requirement');
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.INFERRED);
  assert.equal(parsed.items[0].commandDraft.confirmed, false);
  assert(parsed.worklog.some((line) => line.includes('requires review')));
});

test('decompose is structure-only and generate item fills drafts one at a time', async () => {
  const adapter = new CountingAdapter([
    { type: 'precondition', sourceText: 'P1', intent: 'check prerequisite', expected: 'ok', target: 'host' },
    { type: 'step', sourceText: 'S1', intent: 'run action', command: 'echo action', commandEvidence: 'explicit', target: 'host' }
  ]);
  const decomposed = await decomposeTestCase('raw text ignored by test adapter', { adapter });
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


test('adapter items are ordered as preconditions first and steps second while preserving group order', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'step', sourceText: 'S1', intent: 'S1', command: 'echo s1', commandEvidence: 'explicit' },
    { type: 'precondition', sourceText: 'P1', intent: 'P1', command: 'echo p1', commandEvidence: 'explicit' },
    { type: 'step', sourceText: 'S2', intent: 'S2', command: 'echo s2', commandEvidence: 'explicit' },
    { type: 'precondition', sourceText: 'P2', intent: 'P2', command: 'echo p2', commandEvidence: 'explicit' }
  ]) });
  assert.deepEqual(parsed.items.map((item) => item.sourceText), ['P1', 'P2', 'S1', 'S2']);
  assert.deepEqual(parsed.items.map((item) => item.index), [0, 1, 2, 3]);
});

test('manual conditional actions from adapter remain as blocking blank-command items', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    { type: 'precondition', sourceText: '若检查结果不满足要求，则执行外部手工恢复动作', intent: 'perform external manual recovery when prerequisite fails', commandEvidence: 'none', target: 'host' },
    { type: 'precondition', sourceText: '执行 vendor-tool clear-state', intent: 'clear state', command: 'vendor-tool clear-state', commandEvidence: 'explicit', target: 'host' }
  ]) });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].commandDraft.value, '');
  assert.equal(parsed.items[0].sourceText.includes('外部手工恢复动作'), true);
  assert.equal(parsed.items[1].commandDraft.provenance, COMMAND_PROVENANCE.ORIGINAL);
});

test('commands without evidence, natural validation, and manual actions stay behind generic review gates', async () => {
  const parsed = await parseTestCase('raw text ignored by test adapter', { adapter: new Adapter([
    {
      type: 'precondition',
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
      type: 'precondition',
      sourceText: '若检查结果不满足预置条件，则执行外部系统上下电',
      intent: 'perform external power cycle when prerequisite fails',
      commandEvidence: 'none',
      target: 'host'
    },
    {
      type: 'precondition',
      sourceText: '执行 vendor-tool clear-state 清除状态',
      intent: 'clear device state',
      command: 'vendor-tool clear-state',
      commandEvidence: 'explicit',
      target: 'host'
    }
  ]) });
  assert.equal(parsed.items[0].commandDraft.provenance, COMMAND_PROVENANCE.INFERRED);
  assert.equal(parsed.items[0].commandDraft.confirmed, false);
  assert.equal(parsed.items[0].validationDraft.confirmed, false);
  assert.equal(parsed.items[1].commandDraft.value, '');

  const readiness = exportReadiness(parsed.items, { remote: { host: '1.2.3.4', username: 'root', password: 'pw' } });
  assert(readiness.gaps.some((gap) => gap.code === 'unconfirmed_inferred_command'));
  assert(readiness.gaps.some((gap) => gap.code === 'unconfirmed_inferred_validation'));
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
