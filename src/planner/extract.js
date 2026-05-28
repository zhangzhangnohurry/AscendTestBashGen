import { COMMAND_PROVENANCE, ITEM_TYPE, TARGET } from '../domain/types.js';
import { createCommandDraft, createValidationDraft, normalizeItem } from '../domain/state.js';
import { ConfigurableAdapter } from '../llm/adapter.js';
import { retrieveKnowledge } from '../knowledge/retrieve.js';

/**
 * Full one-shot compatibility API: decompose the document, then generate every
 * item. The UI now calls the two stages separately, but tests and integrations
 * can still use this helper when they do not need progressive rendering.
 */
export async function parseTestCase(rawText, { skills = [], adapter = new ConfigurableAdapter() } = {}) {
  const decomposed = await decomposeTestCase(rawText, { adapter });
  const generated = [];
  for (const item of decomposed.items) {
    generated.push(await generateItemDraft(item, { skills, adapter }));
  }
  return {
    rawText: String(rawText || ''),
    items: generated,
    worklog: buildWorklog(generated, decomposed.extraction)
  };
}

/**
 * Stage 1: ask the configured model to preserve the document structure as
 * ordered items. No command execution happens here, and no local keyword or
 * regex logic tries to reinterpret the user source.
 */
export async function decomposeTestCase(rawText, { adapter = new ConfigurableAdapter() } = {}) {
  const knowledge = await retrieveKnowledge({ phase: 'decompose', text: String(rawText || ''), adapter });
  const extraction = await adapter.extractTestCase(String(rawText || ''), { knowledge: knowledge.selected });
  const sourceItems = Array.isArray(extraction?.items) ? extraction.items : [];
  const normalized = [];

  for (const [index, source] of sourceItems.entries()) {
    normalized.push(createBaseItem(source, index));
  }

  const ordered = orderItems(normalized);
  return {
    rawText: String(rawText || ''),
    items: ordered,
    extraction,
    worklog: buildDecomposeWorklog(ordered, extraction)
  };
}

/**
 * Stage 2: enrich one already-decomposed item with a command and validation
 * draft. This one-item-at-a-time boundary makes UI progress visible and keeps
 * failures isolated to the item currently being generated.
 */
export async function generateItemDraft(item, { skills = [], adapter = new ConfigurableAdapter() } = {}) {
  const normalized = normalizeItem(item, item.index ?? 0);
  const commandDraft = normalized.commandDraft || createCommandDraft('', COMMAND_PROVENANCE.INFERRED);
  const validationDraft = normalized.validationDraft || createValidationDraft('', Boolean(normalized.expected));
  const canGenerateCommand = commandDraft.originalProvenance === COMMAND_PROVENANCE.INFERRED &&
    !commandDraft.confirmed &&
    commandDraft.inferenceAllowed !== false;
  const skill = canGenerateCommand
    ? await adapterMatchSkill(adapter, {
      sourceText: normalized.sourceText,
      intent: normalized.intent || normalized.sourceText,
      expected: normalized.expected,
      target: normalized.target
    }, skills)
    : null;

  let nextCommandDraft = commandDraft;
  if (skill?.command) {
    nextCommandDraft = createCommandDraft(skill.command, COMMAND_PROVENANCE.SKILL_REUSE);
  } else if (canGenerateCommand && !text(commandDraft.value)) {
    const commandKnowledge = await retrieveKnowledge({ phase: 'generate', isDeviceShell: normalized.target === TARGET.DEVICE, text: normalized.sourceText || normalized.intent, item: normalized, adapter });
    const inferredCommand = await adapter.inferCommand(normalized.intent || normalized.sourceText, {
      sourceText: normalized.sourceText,
      expected: normalized.expected,
      item: normalized,
      knowledge: commandKnowledge.selected
    });
    if (text(inferredCommand)) {
      nextCommandDraft = createCommandDraft(inferredCommand, COMMAND_PROVENANCE.INFERRED, { inferenceAllowed: true });
    }
  }

  let nextValidationDraft = validationDraft;
  const needsValidation = Boolean(normalized.expected);
  const canGenerateValidation = needsValidation &&
    !text(validationDraft.value) &&
    (skill?.validation || typeof adapter.inferValidation === 'function');
  if (skill?.validation) {
    nextValidationDraft = createValidationDraft(skill.validation, needsValidation, 'skill_reuse');
  } else if (canGenerateValidation) {
    const validationKnowledge = await retrieveKnowledge({ phase: 'validate', isDeviceShell: normalized.target === TARGET.DEVICE, text: normalized.sourceText || normalized.expected, item: normalized, adapter });
    const inferredValidation = await adapter.inferValidation(normalized.expected, {
      sourceText: normalized.sourceText,
      intent: normalized.intent,
      item: normalized,
      knowledge: validationKnowledge.selected
    });
    if (text(inferredValidation)) {
      nextValidationDraft = createValidationDraft(inferredValidation, needsValidation, 'inferred_validation');
    }
  }

  return normalizeItem({
    ...normalized,
    target: skill?.target || normalized.target,
    commandDraft: nextCommandDraft,
    validationDraft: nextValidationDraft,
    persistence: { state: nextCommandDraft.provenance === COMMAND_PROVENANCE.INFERRED ? 'suggested' : 'not_suggested' }
  }, normalized.index);
}

/** Normalizes a raw adapter item into the reviewable domain draft shape. */
function createBaseItem(source, index) {
  const intent = text(source.intent ?? source.sourceText ?? source.description);
  const sourceText = text(source.sourceText ?? source.description ?? intent);
  const originalCommand = text(source.command);
  const commandEvidence = evidence(source.commandEvidence ?? source.commandProvenance);
  const explicitCommand = originalCommand && commandEvidence === 'explicit';
  const inferredCommand = originalCommand && commandEvidence === 'inferred';
  const expected = text(source.expected);
  const target = normalizeTarget(source.target);
  const commandValue = explicitCommand || inferredCommand ? originalCommand : '';
  const provenance = explicitCommand ? COMMAND_PROVENANCE.ORIGINAL : COMMAND_PROVENANCE.INFERRED;
  const validationValue = text(source.validation);
  const validationProvenance = validationValue
    ? (evidence(source.validationEvidence ?? source.validationProvenance) === 'explicit' ? 'original_expected' : 'inferred_validation')
    : 'blank';

  return normalizeItem({
    id: text(source.id) || `item-${index}`,
    index,
    type: normalizeType(source.type),
    sourceText,
    intent: intent || sourceText,
    expected,
    target,
    commandDraft: createCommandDraft(commandValue, provenance, { inferenceAllowed: commandEvidence !== 'none' }),
    validationDraft: createValidationDraft(validationValue, Boolean(expected), validationProvenance),
    persistence: { state: provenance === COMMAND_PROVENANCE.INFERRED ? 'suggested' : 'not_suggested' }
  }, index);
}

function buildDecomposeWorklog(items, extraction) {
  const messages = [];
  if (!extraction?.configured) {
    messages.push('No extraction adapter configured; input was not parsed. Configure CLI/HTTP extraction or enter structured data through a future editor flow.');
  } else {
    messages.push(`文档拆解完成：得到 ${items.length} 个原文条目。`);
  }
  return messages;
}

function buildWorklog(items, extraction) {
  const messages = buildDecomposeWorklog(items, extraction);
  if (extraction?.configured) messages.push(`脚本生成完成：已逐项回填 ${items.length} 个草稿。`);
  for (const entry of items) {
    if (entry.commandDraft.provenance === COMMAND_PROVENANCE.INFERRED && !entry.commandDraft.value.trim()) {
      messages.push(`Item ${entry.index}: no source command, no skill match, and no configured inference result.`);
    } else if (entry.commandDraft.provenance === COMMAND_PROVENANCE.INFERRED) {
      messages.push(`Item ${entry.index}: command has no explicit source evidence and requires review.`);
    }
    if ((entry.validationDraft.originalProvenance || entry.validationDraft.provenance) === 'inferred_validation' && entry.validationDraft.value.trim()) {
      messages.push(`Item ${entry.index}: validation is inferred and must be reviewed before execution/export.`);
    }
  }
  return messages;
}

function normalizeType(value) {
  return value === ITEM_TYPE.PRECONDITION ? ITEM_TYPE.PRECONDITION : ITEM_TYPE.STEP;
}

function normalizeTarget(value) {
  return [TARGET.LOCAL, TARGET.HOST, TARGET.DEVICE].includes(value) ? value : TARGET.LOCAL;
}

function text(value) {
  return String(value ?? '').trim();
}

function evidence(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function adapterMatchSkill(adapter, item, skills) {
  if (!skills?.length || typeof adapter.matchSkill !== 'function') return null;
  const match = await adapter.matchSkill(item, skills);
  if (match?.action !== 'reuse' || !match.skillId) return null;
  return skills.find((skill) => skill.id === match.skillId) || null;
}

/** Preserve the source grouping order while showing setup/precondition items first. */
function orderItems(items) {
  return [...items]
    .sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.index - b.index)
    .map((item, index) => ({ ...item, index, id: item.id || `item-${index}` }));
}

function typeRank(type) {
  return type === ITEM_TYPE.PRECONDITION ? 0 : 1;
}
