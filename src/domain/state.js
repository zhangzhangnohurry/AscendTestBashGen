import { COMMAND_PROVENANCE, TARGET } from './types.js';

/**
 * A command draft keeps both current and original provenance so the UI can tell
 * whether a value came from source text, model inference, a saved skill, or user
 * editing before allowing execution/export.
 */
export function createCommandDraft(value = '', provenance = COMMAND_PROVENANCE.INFERRED, options = {}) {
  return {
    value: String(value ?? ''),
    provenance,
    originalProvenance: options.originalProvenance || provenance,
    confirmed: Boolean(options.confirmed || provenance === COMMAND_PROVENANCE.ORIGINAL || provenance === COMMAND_PROVENANCE.SKILL_REUSE),
    editState: options.editState || 'clean',
    rejected: Boolean(options.rejected),
    inferenceAllowed: options.inferenceAllowed !== false
  };
}

export function createValidationDraft(value = '', required = false, provenance = 'blank', options = {}) {
  const draft = {
    value: String(value ?? ''),
    required: Boolean(required),
    provenance,
    originalProvenance: options.originalProvenance || provenance,
    confirmed: Boolean(options.confirmed || provenance === 'original_expected' || provenance === 'skill_reuse' || provenance === 'user_edited')
  };
  return { ...draft, ...validationReadiness(draft) };
}

export function confirmCommandDraft(draft) {
  return { ...draft, confirmed: true, rejected: false };
}

export function editCommandDraft(draft, value) {
  return {
    ...draft,
    value: String(value ?? ''),
    provenance: COMMAND_PROVENANCE.USER_EDITED,
    originalProvenance: draft.originalProvenance || draft.provenance,
    editState: 'dirty'
  };
}

export function editValidationDraft(draft, value) {
  const next = { ...draft, value: String(value ?? ''), provenance: 'user_edited', confirmed: true };
  return { ...next, ...validationReadiness(next) };
}

export function commandReadiness(draft) {
  const gaps = [];
  if (!draft || !String(draft.value ?? '').trim()) gaps.push('blank_command');
  if (draft?.rejected) gaps.push('rejected_command');
  const originalProvenance = draft?.originalProvenance || draft?.provenance;
  if (originalProvenance === COMMAND_PROVENANCE.INFERRED && !draft.confirmed) {
    gaps.push('unconfirmed_inferred_command');
  }
  return { ready: gaps.length === 0, gaps };
}

export function validationReadiness(draft) {
  const value = String(draft?.value ?? '').trim();
  const required = Boolean(draft?.required);
  if (!value && required) return { readiness: 'required_missing', ready: false, gaps: ['required_validation_missing'] };
  if (!value && !required) return { readiness: 'optional_empty', ready: true, gaps: [] };
  if (looksMalformedValidation(value)) return { readiness: 'malformed', ready: false, gaps: ['malformed_validation'] };
  if (!validationUsesCommandResult(value)) return { readiness: 'missing_command_output', ready: false, gaps: ['validation_missing_command_output'] };
  if ((draft?.originalProvenance || draft?.provenance) === 'inferred_validation' && !draft.confirmed) {
    return { readiness: 'unconfirmed_inferred', ready: false, gaps: ['unconfirmed_inferred_validation'] };
  }
  return { readiness: 'required_ready', ready: true, gaps: [] };
}

export function looksMalformedValidation(value) {
  const text = String(value ?? '');
  if (/\bSYNTAX_ERROR\b|\bMALFORMED\b/.test(text)) return true;
  const single = (text.match(/'/g) || []).length;
  const double = (text.match(/"/g) || []).length;
  return single % 2 === 1 || double % 2 === 1;
}

export function normalizeItem(item, index = item.index ?? 0) {
  const expected = String(item.expected ?? '').trim();
  const commandDraft = item.commandDraft || createCommandDraft(item.command || '', item.commandProvenance || COMMAND_PROVENANCE.INFERRED);
  const validationDraft = item.validationDraft || createValidationDraft(item.validation || '', Boolean(expected), item.validation ? 'original_expected' : 'blank');
  return {
    id: item.id || `item-${index}`,
    index,
    type: item.type || 'step',
    intent: String(item.intent ?? item.sourceText ?? '').trim(),
    sourceText: String(item.sourceText ?? item.intent ?? '').trim(),
    expected,
    target: item.target || TARGET.LOCAL,
    commandDraft,
    validationDraft: { ...validationDraft, ...validationReadiness(validationDraft) },
    persistence: item.persistence || { state: 'not_suggested' }
  };
}

export function validateExecutionSlice(items, selectedIndex) {
  const gaps = [];
  if (!Array.isArray(items) || items.length === 0) gaps.push({ code: 'empty_items', message: 'No commands to execute.' });
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= items.length) {
    gaps.push({ code: 'selected_index_out_of_range', index: selectedIndex, message: 'Selected index is out of range.' });
    return { ok: false, gaps, slice: [] };
  }
  const slice = items.slice(0, selectedIndex + 1).map((item, i) => normalizeItem(item, i));
  for (const item of slice) {
    for (const code of commandReadiness(item.commandDraft).gaps) {
      gaps.push({ code, index: item.index, itemId: item.id, message: explainGap(code, item.index) });
    }
    for (const code of validationReadiness(item.validationDraft).gaps) {
      gaps.push({ code, index: item.index, itemId: item.id, message: explainGap(code, item.index) });
    }
    if (validationRepeatsCommand(item.commandDraft?.value, item.validationDraft?.value)) {
      gaps.push({ code: 'validation_repeats_command', index: item.index, itemId: item.id, message: explainGap('validation_repeats_command', item.index) });
    }
  }
  return { ok: gaps.length === 0, gaps, slice };
}

/** Validates whether an item list can be exported without running anything. */
export function exportReadiness(items, config = {}) {
  const normalized = (items || []).map((item, i) => normalizeItem(item, i));
  const gaps = [];
  if (normalized.length === 0) {
    gaps.push({ code: 'empty_items', message: 'No items are available for export.' });
  }
  for (const item of normalized) {
    for (const code of commandReadiness(item.commandDraft).gaps) {
      gaps.push({ code, index: item.index, itemId: item.id, message: explainGap(code, item.index) });
    }
    for (const code of validationReadiness(item.validationDraft).gaps) {
      gaps.push({ code, index: item.index, itemId: item.id, message: explainGap(code, item.index) });
    }
    if (validationRepeatsCommand(item.commandDraft?.value, item.validationDraft?.value)) {
      gaps.push({ code: 'validation_repeats_command', index: item.index, itemId: item.id, message: explainGap('validation_repeats_command', item.index) });
    }
    if (![TARGET.LOCAL, TARGET.HOST, TARGET.DEVICE].includes(item.target)) {
      gaps.push({ code: 'unsupported_target', index: item.index, itemId: item.id, message: `Step ${item.index} has unsupported target ${item.target}.` });
    }
  }

  const usesRemote = normalized.some((item) => item.target === TARGET.HOST || item.target === TARGET.DEVICE);
  if (usesRemote) {
    if (!config.remote?.host || !config.remote?.username) {
      gaps.push({ code: 'unresolved_remote_config', message: 'Remote host and username are required for SSH host/device commands.' });
    }
    if (!config.remote?.password && !config.remote?.privateKeyPath) {
      gaps.push({ code: 'remote_password_missing', message: 'SSH password is required by default unless a key path is explicitly configured.' });
    }
    if (config.remote?.rootMode && !config.remote?.rootWarningAcknowledged) {
      gaps.push({ code: 'root_warning_not_acknowledged', message: 'Root mode requires explicit warning acknowledgement.' });
    }
  }

  return {
    exportable: gaps.length === 0,
    status: gaps.length === 0 ? 'exportable' : 'refused',
    gaps,
    items: normalized
  };
}

export function explainGap(code, index = undefined) {
  const prefix = Number.isInteger(index) ? `Step ${index}: ` : '';
  const messages = {
    blank_command: 'command is blank',
    rejected_command: 'command is rejected/blocked',
    unconfirmed_inferred_command: 'inferred command must be explicitly confirmed before execution/export',
    required_validation_missing: 'required validation is missing',
    malformed_validation: 'validation script/check is malformed',
    unconfirmed_inferred_validation: 'inferred validation must be reviewed or edited before execution/export',
    validation_repeats_command: 'validation repeats the primary command; validate $COMMAND_OUTPUT instead of running the command again',
    validation_missing_command_output: 'validation must check $COMMAND_OUTPUT or $COMMAND_STATUS instead of running or assuming another command',
    selected_index_out_of_range: 'selected execute-to-here index is out of range',
    empty_items: 'no items are available'
  };
  return `${prefix}${messages[code] || code}`;
}

export function validationRepeatsCommand(command, validation) {
  const commandText = String(command ?? '').trim();
  const validationText = String(validation ?? '').trim();
  if (!commandText || !validationText) return false;
  const normalizedCommand = normalizeShell(commandText);
  const normalizedValidation = normalizeShell(validationText);
  if (!normalizedCommand || !normalizedValidation) return false;
  return normalizedValidation === normalizedCommand ||
    normalizedValidation.startsWith(`if ${normalizedCommand}`) ||
    normalizedValidation.includes(`$(${normalizedCommand})`) ||
    normalizedValidation.includes('`' + normalizedCommand + '`');
}

function normalizeShell(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function validationUsesCommandResult(validation) {
  const text = String(validation ?? '');
  return text.includes('$COMMAND_OUTPUT') || text.includes('${COMMAND_OUTPUT}') || text.includes('$COMMAND_STATUS') || text.includes('${COMMAND_STATUS}');
}
