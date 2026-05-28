import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandDraft, createValidationDraft, exportReadiness, validateExecutionSlice } from '../../src/domain/state.js';
import { COMMAND_PROVENANCE } from '../../src/domain/types.js';
import { buildExecutionScript } from '../../src/executor/session.js';
import { generateStandaloneScript } from '../../src/script/generator.js';

function item(command, validation) {
  return {
    index: 0,
    id: 'i0',
    type: 'step',
    sourceText: 'source',
    expected: 'contains expected token',
    commandDraft: createCommandDraft(command, COMMAND_PROVENANCE.ORIGINAL),
    validationDraft: createValidationDraft(validation, true)
  };
}

test('validation that repeats primary command is blocked for execution and export', () => {
  const repeated = item('npu-smi info -t ecc -i x -c 0', 'if npu-smi info -t ecc -i x -c 0; then true; fi');
  assert(validateExecutionSlice([repeated], 0).gaps.some((gap) => gap.code === 'validation_repeats_command'));
  assert(exportReadiness([repeated]).gaps.some((gap) => gap.code === 'validation_repeats_command'));
});

test('execution and exported script expose COMMAND_OUTPUT for validation instead of rerunning command', () => {
  const safe = item('printf "expected-token\\n"', 'grep -q "expected-token" <<< "$COMMAND_OUTPUT"');
  const executionScript = buildExecutionScript([safe]);
  assert.match(executionScript, /COMMAND_OUTPUT=/);
  assert.match(executionScript, /export COMMAND_OUTPUT COMMAND_STATUS/);
  assert.equal((executionScript.match(/printf "expected-token/g) || []).length, 1);

  const generated = generateStandaloneScript([safe]);
  assert.equal(generated.ok, true);
  assert.match(generated.script, /COMMAND_OUTPUT=/);
  assert.equal((generated.script.match(/printf "expected-token/g) || []).length, 1);
});

test('non-empty validation must reference command result variables', () => {
  const unsafe = item('printf "ok\\n"', 'true');
  assert(exportReadiness([unsafe]).gaps.some((gap) => gap.code === 'validation_missing_command_output'));
  assert(validateExecutionSlice([unsafe], 0).gaps.some((gap) => gap.code === 'validation_missing_command_output'));
});
