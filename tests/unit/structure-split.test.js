import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStructuredSteps } from '../../src/planner/structure.js';

test('section splitter preserves S hierarchy with punctuation variants', () => {
  const items = splitStructuredSteps(`测试步骤：
S1、登陆物理机器
继续说明
S1.1 切换用户
S1/2: 执行命令
S2：检查结果
Ｓ２．１ 全角编号`);
  assert.deepEqual(items.map((item) => item.label), ['S1', 'S1.1', 'S1.2', 'S2', 'S2.1']);
  assert.deepEqual(items.map((item) => item.depth), [1, 2, 2, 1, 2]);
  assert.equal(items[0].sourceText, '登陆物理机器\n继续说明');
  assert(items.every((item) => item.type === 'step'));
});

test('section splitter falls back to one step when no explicit S label exists', () => {
  const items = splitStructuredSteps('执行一次人工操作并观察结果');
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'S1');
  assert.equal(items[0].sourceText, '执行一次人工操作并观察结果');
});

test('section splitter attaches E labels as expected text for matching S labels only', () => {
  const items = splitStructuredSteps(`S1 执行主步骤
补充命令说明
E1 回显包含 ready
继续判断说明
S1.1 子步骤
E1.1 子步骤输出 ok
E2 没有对应步骤不应创建行`);

  assert.deepEqual(items.map((item) => item.label), ['S1', 'S1.1']);
  assert.equal(items[0].sourceText, '执行主步骤\n补充命令说明');
  assert.equal(items[0].expected, '回显包含 ready\n继续判断说明');
  assert.equal(items[0].validationDraft.required, true);
  assert.equal(items[1].expected, '子步骤输出 ok');
  assert.equal(items[1].validationDraft.required, true);
});

test('section splitter keeps validation optional when no matching E label exists', () => {
  const items = splitStructuredSteps(`S1 执行但没有预期段
S1/2 子步骤也没有预期段`);
  assert.deepEqual(items.map((item) => item.label), ['S1', 'S1.2']);
  assert(items.every((item) => item.expected === ''));
  assert(items.every((item) => item.validationDraft.required === false));
});

test('section splitter tolerates common wrong hierarchy separators for S and E labels', () => {
  const items = splitStructuredSteps(`S1 父步骤
S1、1 中文顿号子步骤
E1、1 子步骤预期
S1，2 中文逗号子步骤
E1，2 第二个预期
S1-3 连字符子步骤
E1—3 长横线预期
S1＿4 全角下划线子步骤
E1｜4 竖线预期`);

  assert.deepEqual(items.map((item) => item.label), ['S1', 'S1.1', 'S1.2', 'S1.3', 'S1.4']);
  assert.equal(items[1].expected, '子步骤预期');
  assert.equal(items[2].expected, '第二个预期');
  assert.equal(items[3].expected, '长横线预期');
  assert.equal(items[4].expected, '竖线预期');
  assert(items.slice(1).every((item) => item.validationDraft.required === true));
});

test('section splitter still treats punctuation after single label as text separator when no following number exists', () => {
  const items = splitStructuredSteps(`S1、root用户登陆物理机器
E1：回显登录成功`);
  assert.deepEqual(items.map((item) => item.label), ['S1']);
  assert.equal(items[0].sourceText, 'root用户登陆物理机器');
  assert.equal(items[0].expected, '回显登录成功');
});
