import { COMMAND_PROVENANCE, TARGET } from '../domain/types.js';
import { createCommandDraft, createValidationDraft, normalizeItem } from '../domain/state.js';

/**
 * Deterministic section splitter for explicit source labels such as S1, S1.1,
 * S1/2, S1、2, E1 and E1.1. This is structural parsing only: it uses visible section
 * numbers supplied by the document, never semantic keyword matching.
 *
 * Product boundary:
 * - S labels create executable/reviewable step rows.
 * - E labels attach expected-result text to the matching S row.
 * - If no matching E label exists, expected stays empty and no validation is
 *   required or generated automatically.
 */
export function splitStructuredSteps(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const stepSections = [];
  const expectedByStepLabel = new Map();
  let current = null;
  let preface = [];

  for (const line of lines) {
    const parsed = parseSectionLabel(line);
    if (parsed) {
      flushSection(current, stepSections, expectedByStepLabel);
      current = {
        kind: parsed.kind,
        label: parsed.label,
        stepLabel: parsed.stepLabel,
        depth: parsed.depth,
        orderPath: parsed.orderPath,
        lines: [parsed.rest || parsed.label]
      };
      continue;
    }
    if (current) {
      if (line.trim()) current.lines.push(line.trim());
    } else if (line.trim()) {
      preface.push(line.trim());
    }
  }
  flushSection(current, stepSections, expectedByStepLabel);

  const sourceSections = stepSections.length
    ? stepSections
    : [{ label: 'S1', depth: 1, orderPath: [1], lines: [preface.join('\n') || text.trim()] }];
  return sourceSections.map((section, index) => createStructuredItem(section, index, expectedByStepLabel.get(section.label) || ''));
}

/** Parses both step (S) and expected-result (E) labels with ASCII/full-width variants. */
export function parseSectionLabel(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const match = text.match(/^([sSｅＥeEＳｓ])\s*([0-9０-９]+(?:\s*[.．。\/／、,，;；:：\-－—–_＿~～|｜]\s*[0-9０-９]+)*)(?:\s*[、,，\)）:：.．-])?\s*(.*)$/u);
  if (!match) return null;
  const prefix = normalizePrefix(match[1]);
  if (!prefix) return null;
  const numbers = match[2]
    .split(/[.．。\/／、,，;；:：\-－—–_＿~～|｜]/u)
    .map((part) => Number(toAsciiDigits(part.trim())))
    .filter((number) => Number.isFinite(number) && number > 0);
  if (!numbers.length) return null;
  const normalizedPath = numbers.join('.');
  const label = `${prefix}${normalizedPath}`;
  const stepLabel = `S${normalizedPath}`;
  return { kind: prefix === 'S' ? 'step' : 'expected', label, stepLabel, depth: numbers.length, orderPath: numbers, rest: match[3].trim() };
}

/** Backward-compatible helper for callers/tests that only care about S labels. */
export function parseStepLabel(line) {
  const parsed = parseSectionLabel(line);
  return parsed?.kind === 'step' ? parsed : null;
}

function flushSection(section, stepSections, expectedByStepLabel) {
  if (!section) return;
  const lines = section.lines.map((line) => String(line || '').trim()).filter(Boolean);
  if (section.kind === 'step') {
    stepSections.push({ ...section, lines });
    return;
  }
  if (section.kind === 'expected') {
    const existing = expectedByStepLabel.get(section.stepLabel);
    const value = lines.join('\n').trim();
    expectedByStepLabel.set(section.stepLabel, existing ? `${existing}\n${value}`.trim() : value);
  }
}

function createStructuredItem(section, index, expected = '') {
  const sourceText = section.lines.join('\n').trim() || section.label;
  const expectedText = String(expected || '').trim();
  return normalizeItem({
    id: `item-${index}`,
    index,
    type: 'step',
    label: section.label,
    depth: section.depth,
    orderPath: section.orderPath,
    sourceText,
    intent: sourceText,
    expected: expectedText,
    target: TARGET.LOCAL,
    commandDraft: createCommandDraft('', COMMAND_PROVENANCE.INFERRED, { inferenceAllowed: true }),
    validationDraft: createValidationDraft('', Boolean(expectedText), 'blank'),
    knowledgeRefs: [],
    persistence: { state: 'not_suggested' }
  }, index);
}

function normalizePrefix(value) {
  if (/[sSＳｓ]/u.test(value)) return 'S';
  if (/[eEＥｅ]/u.test(value)) return 'E';
  return '';
}

function toAsciiDigits(value) {
  return String(value).replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}
