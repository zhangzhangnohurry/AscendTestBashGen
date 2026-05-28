import { listKnowledgeSummaries, readKnowledgeItems } from './store.js';

/**
 * Retrieves knowledge in two passes: local code filters only structured
 * metadata, then the configured model selects semantically relevant ids from
 * summaries. The full Markdown body is loaded only after model selection.
 */
export async function retrieveKnowledge({ phase, isDeviceShell, target, text = '', item = null, adapter, limit = 6 } = {}) {
  const deviceShell = normalizeDeviceShellFilter(isDeviceShell, target);
  const candidates = await listKnowledgeSummaries({ phase, isDeviceShell: deviceShell });
  if (!candidates.length || !adapter || typeof adapter.selectKnowledge !== 'function') {
    return emptyResult(candidates.length);
  }
  const selection = await adapter.selectKnowledge({ phase, isDeviceShell: deviceShell, text, item, candidates, limit });
  const selectedIds = normalizeSelectedIds(selection, candidates, limit);
  const selected = selectedIds.length ? await readKnowledgeItems(selectedIds) : [];
  return {
    candidateCount: candidates.length,
    selectedIds: selected.map((entry) => entry.id),
    selected,
    selection
  };
}

/** Formats selected full-text knowledge for injection into task prompts. */
export function formatKnowledgeForPrompt(knowledge = []) {
  const selected = Array.isArray(knowledge) ? knowledge : [];
  if (!selected.length) return '';
  return selected.map((item, index) => `Knowledge ${index + 1}: ${item.title || item.id}\nID: ${item.id}\nStrength: ${item.strength || 'should'}\nSummary: ${item.summary || ''}\nContent:\n${item.content || ''}`).join('\n\n---\n\n');
}

function normalizeDeviceShellFilter(isDeviceShell, target) {
  if (typeof isDeviceShell === 'boolean') return isDeviceShell;
  if (target === 'device') return true;
  if (target === 'host' || target === 'local') return false;
  return undefined;
}

function normalizeSelectedIds(selection, candidates, limit) {
  const allowed = new Set(candidates.map((item) => item.id));
  const rawIds = Array.isArray(selection?.ids) ? selection.ids
    : Array.isArray(selection?.selectedIds) ? selection.selectedIds
      : Array.isArray(selection?.knowledgeIds) ? selection.knowledgeIds
        : [];
  const selected = [];
  for (const raw of rawIds) {
    const id = String(raw || '').trim();
    if (allowed.has(id) && !selected.includes(id)) selected.push(id);
    if (selected.length >= limit) break;
  }
  return selected;
}

function emptyResult(candidateCount = 0) {
  return { candidateCount, selectedIds: [], selected: [], selection: { configured: false, ids: [] } };
}
