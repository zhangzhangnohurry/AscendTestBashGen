import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCommandDraft, createValidationDraft } from '../../src/domain/state.js';
import { COMMAND_PROVENANCE } from '../../src/domain/types.js';
import { executeToHere } from '../../src/executor/session.js';

function item(index, command, provenance = COMMAND_PROVENANCE.ORIGINAL) {
  return { index, id: `i${index}`, type: 'step', sourceText: command, commandDraft: createCommandDraft(command, provenance), validationDraft: createValidationDraft('', false) };
}

test('execute-to-here runs exactly 0..N and never future command', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-runner-'));
  const items = [item(0, 'echo first > first.txt'), item(1, 'echo second > second.txt'), item(2, 'echo future > future.txt')];
  const result = await executeToHere(items, 1, { cwd: dir });
  assert.equal(result.ok, true);
  await access(path.join(dir, 'first.txt'), constants.F_OK);
  await access(path.join(dir, 'second.txt'), constants.F_OK);
  await assert.rejects(access(path.join(dir, 'future.txt'), constants.F_OK));
  items[0].commandDraft.value = 'echo mutated > mutated.txt';
  assert.equal(result.snapshot[0].commandDraft.value, 'echo first > first.txt');
});

test('execute-to-here blocks unconfirmed inferred command and out-of-range index', async () => {
  const blocked = await executeToHere([item(0, 'echo maybe', COMMAND_PROVENANCE.INFERRED)], 0, {});
  assert.equal(blocked.status, 'blocked');
  assert(blocked.gaps.some((gap) => gap.code === 'unconfirmed_inferred_command'));
  const out = await executeToHere([item(0, 'echo ok')], 2, {});
  assert.equal(out.status, 'blocked');
  assert(out.gaps.some((gap) => gap.code === 'selected_index_out_of_range'));
});
