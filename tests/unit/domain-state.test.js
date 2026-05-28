import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_PROVENANCE } from '../../src/domain/types.js';
import { commandReadiness, confirmCommandDraft, createCommandDraft, createValidationDraft, exportReadiness, validationReadiness } from '../../src/domain/state.js';

test('original and skill_reuse commands are ready; inferred starts blocked until confirmed', () => {
  assert.equal(commandReadiness(createCommandDraft('echo ok', COMMAND_PROVENANCE.ORIGINAL)).ready, true);
  assert.equal(commandReadiness(createCommandDraft('echo ok', COMMAND_PROVENANCE.SKILL_REUSE)).ready, true);
  const inferred = createCommandDraft('echo maybe', COMMAND_PROVENANCE.INFERRED);
  assert.deepEqual(commandReadiness(inferred).gaps, ['unconfirmed_inferred_command']);
  assert.equal(commandReadiness(confirmCommandDraft(inferred)).ready, true);
});

test('blank command and malformed/missing validation block export', () => {
  const item = {
    sourceText: 'step',
    expected: 'ok',
    commandDraft: createCommandDraft('', COMMAND_PROVENANCE.ORIGINAL),
    validationDraft: createValidationDraft('', true)
  };
  const readiness = exportReadiness([item]);
  assert.equal(readiness.exportable, false);
  assert(readiness.gaps.some((gap) => gap.code === 'blank_command'));
  assert(readiness.gaps.some((gap) => gap.code === 'required_validation_missing'));
  assert.equal(validationReadiness({ value: 'echo "unterminated', required: true }).readiness, 'malformed');
});

test('inferred validation is blocked until explicitly reviewed', () => {
  const draft = createValidationDraft('grep -q ok <<< "$COMMAND_OUTPUT"', true, 'inferred_validation');
  assert.equal(validationReadiness(draft).ready, false);
  assert.deepEqual(validationReadiness(draft).gaps, ['unconfirmed_inferred_validation']);
  const reviewed = { ...draft, confirmed: true };
  assert.equal(validationReadiness(reviewed).ready, true);
});

test('remote export requires host/user and root acknowledgement', () => {
  const item = {
    target: 'host',
    sourceText: 'remote step',
    commandDraft: createCommandDraft('hostname', COMMAND_PROVENANCE.ORIGINAL),
    validationDraft: createValidationDraft('', false)
  };
  assert(exportReadiness([item], {}).gaps.some((gap) => gap.code === 'unresolved_remote_config'));
  const missingPassword = exportReadiness([item], { remote: { host: '1.2.3.4', username: 'root', rootMode: true } });
  assert(missingPassword.gaps.some((gap) => gap.code === 'remote_password_missing'));
  assert(missingPassword.gaps.some((gap) => gap.code === 'root_warning_not_acknowledged'));
  assert.equal(exportReadiness([item], { remote: { host: '1.2.3.4', username: 'root', password: 'pw', rootMode: true, rootWarningAcknowledged: true } }).exportable, true);
});
