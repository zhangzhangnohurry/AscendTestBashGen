import { COMMAND_PROVENANCE, TARGET } from '../domain/types.js';
import { createCommandDraft, createValidationDraft, normalizeItem } from '../domain/state.js';
import { ConfigurableAdapter } from '../llm/adapter.js';
import { retrieveKnowledge } from '../knowledge/retrieve.js';
import { splitStructuredSteps } from './structure.js';

/**
 * Full one-shot compatibility API: decompose the document, then generate every
 * item. The UI now calls the two stages separately, but tests and integrations
 * can still use this helper when they do not need progressive rendering.
 */
export async function parseTestCase(rawText, { skills = [], adapter = new ConfigurableAdapter(), config = {} } = {}) {
  const local = splitTestCaseStructure(rawText);
  const decomposed = await decomposeTestCase(rawText, { adapter, items: local.items });
  const generated = [];
  for (const item of decomposed.items) {
    generated.push(await generateItemDraft(item, { skills, adapter, config }));
  }
  return {
    rawText: String(rawText || ''),
    items: generated,
    worklog: buildWorklog(generated, decomposed.extraction)
  };
}

/**
 * Stage 0: split explicit S-numbered source sections locally before any model
 * call. This uses only visible section labels and does not interpret semantics.
 */
export function splitTestCaseStructure(rawText) {
  const items = splitStructuredSteps(rawText);
  return {
    rawText: String(rawText || ''),
    items,
    extraction: { configured: false, source: 'local-section-split' },
    worklog: [`章节拆分完成：得到 ${items.length} 个步骤条目。`]
  };
}

/**
 * Optional model-assisted calibration: the model may adjust boundaries/order
 * from the local section split, but it must still return step-only items.
 */
export async function decomposeTestCase(rawText, { adapter = new ConfigurableAdapter(), items = splitStructuredSteps(rawText) } = {}) {
  const localItems = Array.isArray(items) ? items.map((item, index) => normalizeItem(item, index)) : splitStructuredSteps(rawText);
  const expectedByLabel = new Map(localItems.map((item) => [item.label, text(item.expected)]));
  const extraction = await adapter.extractTestCase(String(rawText || ''), { knowledge: [], structureItems: localItems });
  const sourceItems = Array.isArray(extraction?.items) ? extraction.items : [];
  const normalized = [];

  for (const [index, source] of sourceItems.entries()) {
    const localExpected = expectedByLabel.get(text(source.label)) ?? text(localItems[index]?.expected);
    normalized.push(createBaseItem(source, index, localExpected));
  }

  const ordered = orderItems(normalized.length ? normalized : localItems);
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
export async function generateItemDraft(item, { skills = [], adapter = new ConfigurableAdapter(), config = {} } = {}) {
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
  let commandKnowledge = { selected: [] };
  if (skill?.command) {
    nextCommandDraft = createCommandDraft(skill.command, COMMAND_PROVENANCE.SKILL_REUSE);
  } else if (canGenerateCommand && !text(commandDraft.value)) {
    commandKnowledge = await retrieveKnowledge({ text: normalized.sourceText || normalized.intent, item: normalized, adapter });
    const inferredCommand = await adapter.inferCommand(normalized.intent || normalized.sourceText, {
      sourceText: normalized.sourceText,
      expected: normalized.expected,
      item: normalized,
      knowledge: commandKnowledge.selected,
      execution: buildExecutionContext(config)
    });
    if (text(inferredCommand)) {
      nextCommandDraft = createCommandDraft(inferredCommand, COMMAND_PROVENANCE.INFERRED, { inferenceAllowed: true });
    }
  }

  let nextValidationDraft = validationDraft;
  let validationKnowledge = { selected: [] };
  const needsValidation = Boolean(normalized.expected);
  const canGenerateValidation = needsValidation &&
    !text(validationDraft.value) &&
    (skill?.validation || typeof adapter.inferValidation === 'function');
  if (skill?.validation) {
    nextValidationDraft = createValidationDraft(skill.validation, needsValidation, 'skill_reuse');
  } else if (canGenerateValidation) {
    validationKnowledge = await retrieveKnowledge({ text: normalized.sourceText || normalized.expected, item: normalized, adapter });
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
    knowledgeRefs: knowledgeRefs([...(normalized.knowledgeRefs || []), ...commandKnowledge.selected, ...validationKnowledge.selected]),
    persistence: { state: nextCommandDraft.provenance === COMMAND_PROVENANCE.INFERRED ? 'suggested' : 'not_suggested' }
  }, normalized.index);
}

/**
 * Normalizes a raw adapter item into the reviewable domain draft shape.
 * Expected-result text is deliberately sourced from the local S/E section split
 * only. The model may calibrate boundaries and explicit commands, but it cannot
 * invent an expected result or validation gate during decomposition.
 */
function createBaseItem(source, index, expectedFromLocal = '') {
  const intent = text(source.intent ?? source.sourceText ?? source.description);
  const sourceText = text(source.sourceText ?? source.description ?? intent);
  const originalCommand = text(source.command);
  const commandEvidence = evidence(source.commandEvidence ?? source.commandProvenance);
  const explicitCommand = originalCommand && commandEvidence === 'explicit';
  const inferredCommand = originalCommand && commandEvidence === 'inferred';
  const expected = text(expectedFromLocal);
  const target = normalizeTarget(source.target);
  const commandValue = explicitCommand || inferredCommand ? originalCommand : '';
  const provenance = explicitCommand ? COMMAND_PROVENANCE.ORIGINAL : COMMAND_PROVENANCE.INFERRED;
  const validationValue = '';
  const validationProvenance = 'blank';

  return normalizeItem({
    id: text(source.id) || `item-${index}`,
    index,
    type: 'step',
    label: text(source.label) || `S${index + 1}`,
    depth: Number(source.depth || 1),
    orderPath: Array.isArray(source.orderPath) ? source.orderPath : [index + 1],
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
    messages.push(`LLM 校准完成：得到 ${items.length} 个步骤条目。`);
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

function normalizeTarget(value) {
  return [TARGET.LOCAL, TARGET.HOST, TARGET.DEVICE].includes(value) ? value : TARGET.LOCAL;
}

function text(value) {
  return String(value ?? '').trim();
}

function evidence(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildExecutionContext(config = {}) {
  const remote = config.remote || {};
  return {
    remote: {
      host: text(remote.host),
      username: text(remote.username),
      port: remote.port || 22,
      authMode: remote.privateKeyPath ? 'key' : (remote.password ? 'password' : ''),
      rootMode: Boolean(remote.rootMode)
    }
  };
}

function knowledgeRefs(items = []) {
  const seen = new Set();
  const refs = [];
  for (const item of items) {
    const id = item?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    refs.push({ id, title: item.title || id, strength: item.strength || 'should' });
  }
  return refs;
}

async function adapterMatchSkill(adapter, item, skills) {
  if (!skills?.length || typeof adapter.matchSkill !== 'function') return null;
  const match = await adapter.matchSkill(item, skills);
  if (match?.action !== 'reuse' || !match.skillId) return null;
  return skills.find((skill) => skill.id === match.skillId) || null;
}

/** Preserve source order after optional model calibration. */
function orderItems(items) {
  return [...items]
    .sort((a, b) => a.index - b.index)
    .map((item, index) => ({ ...item, index, type: 'step', id: item.id || `item-${index}` }));
}
