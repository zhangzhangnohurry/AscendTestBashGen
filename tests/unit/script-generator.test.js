import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCommandDraft, createValidationDraft } from '../../src/domain/state.js';
import { COMMAND_PROVENANCE } from '../../src/domain/types.js';
import { generateStandaloneScript } from '../../src/script/generator.js';

function item(index, type, command, validation = ': # validation uses $COMMAND_OUTPUT') {
  return { index, id: `i${index}`, type, sourceText: command, expected: 'success', commandDraft: createCommandDraft(command, COMMAND_PROVENANCE.ORIGINAL), validationDraft: createValidationDraft(validation, true) };
}

test('standalone script preserves fixed PASS/NO PASS output and exit codes', async () => {
  const generated = generateStandaloneScript([item(0, 'step', 'true'), item(1, 'step', 'echo ok')]);
  assert.equal(generated.ok, true);
  assert.match(generated.script, /用例执行完成: PASS/);
  assert.match(generated.script, /用例执行完成: PASS/);
  assert.match(generated.script, /用例执行完成: NO PASS/);
  assert.match(generated.script, /错误样本/);
  assert.match(generated.script, /期望样本/);
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-script-'));
  const file = path.join(dir, 'case.sh');
  await writeFile(file, generated.script);
  await chmod(file, 0o755);
  const result = spawnSync(file, { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS\s*$/);
});

test('script generation refuses unsafe gaps', () => {
  const generated = generateStandaloneScript([{ sourceText: 'inferred', commandDraft: createCommandDraft('echo maybe', COMMAND_PROVENANCE.INFERRED), validationDraft: createValidationDraft('', false) }]);
  assert.equal(generated.ok, false);
  assert(generated.gaps.some((gap) => gap.code === 'unconfirmed_inferred_command'));
});
