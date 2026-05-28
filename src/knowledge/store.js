import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, ensureWorkbenchDir, getWorkbenchDir, readJsonFile } from '../persistence/files.js';
import { nowIso } from '../domain/types.js';

export const KNOWLEDGE_DIR = path.join(getWorkbenchDir(), 'knowledge');
export const KNOWLEDGE_INDEX_FILE = path.join(KNOWLEDGE_DIR, 'index.json');
export const KNOWLEDGE_ITEMS_DIR = path.join(KNOWLEDGE_DIR, 'items');

function knowledgeDir() {
  return path.join(getWorkbenchDir(), 'knowledge');
}

function knowledgeIndexFile() {
  return path.join(knowledgeDir(), 'index.json');
}

function knowledgeItemsDir() {
  return path.join(knowledgeDir(), 'items');
}

/** Ensures the runtime knowledge directory/index exists before read/write calls. */
export async function ensureKnowledgeStore() {
  await ensureWorkbenchDir();
  await fs.mkdir(knowledgeItemsDir(), { recursive: true });
  try {
    await fs.access(knowledgeIndexFile());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await atomicWriteJson(knowledgeIndexFile(), { version: 1, items: [] });
  }
}

/**
 * Returns compact metadata used for candidate selection. This intentionally
 * avoids reading Markdown bodies until the model has selected ids.
 */
export async function listKnowledgeSummaries({ phase, isDeviceShell } = {}) {
  await ensureKnowledgeStore();
  const index = await readKnowledgeIndex();
  return index.items
    .map(normalizeSummary)
    .filter((item) => item.id && item.path && item.enabled !== false)
    .filter((item) => matchesMetadata(item, { phase, isDeviceShell }));
}

export async function readKnowledgeItems(ids = []) {
  await ensureKnowledgeStore();
  const wanted = new Set(ids.map((id) => String(id)));
  const summaries = (await readKnowledgeIndex()).items.map(normalizeSummary).filter((item) => wanted.has(item.id));
  const items = [];
  for (const summary of summaries) {
    const filePath = resolveKnowledgePath(summary.path);
    const content = await fs.readFile(filePath, 'utf8');
    items.push({ ...summary, content });
  }
  return items;
}

export async function saveKnowledgeIndex(items) {
  await ensureKnowledgeStore();
  await atomicWriteJson(knowledgeIndexFile(), { version: 1, items: items.map(normalizeSummary) });
}

/** Persists one user-authored experience item and indexes it for later selection. */
export async function persistKnowledgeItem({ title, content, summary = '', phases = [], isDeviceShell = null, strength = 'should', confirmed = false }) {
  if (!confirmed) return { persisted: false, reason: 'confirmation_required' };
  const body = text(content);
  if (!body) return { persisted: false, reason: 'content_required' };
  const id = `knowledge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeTitle = text(title) || '人工经验';
  const relativePath = `items/${id}.md`;
  await ensureKnowledgeStore();
  await fs.writeFile(path.join(knowledgeDir(), relativePath), body.endsWith('\n') ? body : `${body}\n`);
  const index = await readKnowledgeIndex();
  const item = normalizeSummary({
    id,
    title: safeTitle,
    summary: text(summary) || body.slice(0, 200),
    path: relativePath,
    enabled: true,
    phases,
    isDeviceShell,
    strength,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  await atomicWriteJson(knowledgeIndexFile(), { version: 1, items: [...index.items.map(normalizeSummary), item] });
  return { persisted: true, item };
}

async function readKnowledgeIndex() {
  const raw = await readJsonFile(knowledgeIndexFile(), { version: 1, items: [] });
  if (Array.isArray(raw)) return { version: 1, items: raw };
  return { version: Number(raw.version || 1), items: Array.isArray(raw.items) ? raw.items : [] };
}

function normalizeSummary(item = {}) {
  return {
    id: text(item.id),
    title: text(item.title || item.name),
    summary: text(item.summary || item.description),
    path: text(item.path),
    enabled: item.enabled !== false,
    phases: list(item.phases || item.phase),
    isDeviceShell: normalizeDeviceShell(item.isDeviceShell),
    strength: normalizeStrength(item.strength),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt)
  };
}

function matchesMetadata(item, { phase, isDeviceShell } = {}) {
  const phases = item.phases || [];
  const phaseOk = !phase || phases.length === 0 || phases.includes(String(phase));
  const deviceOk = typeof isDeviceShell !== 'boolean' || item.isDeviceShell === null || item.isDeviceShell === isDeviceShell;
  return phaseOk && deviceOk;
}

function resolveKnowledgePath(relativePath) {
  const resolved = path.resolve(knowledgeDir(), relativePath);
  const root = path.resolve(knowledgeDir());
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Knowledge item path escapes knowledge directory: ${relativePath}`);
  }
  return resolved;
}

function normalizeDeviceShell(value) {
  if (value === true || value === false) return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return null;
}

function normalizeStrength(value) {
  const normalized = text(value).toLowerCase();
  return ['must', 'should', 'may'].includes(normalized) ? normalized : 'should';
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function text(value) {
  return String(value ?? '').trim();
}
