/** Runtime persistence helpers for small JSON/JSONL files under WORKBENCH_DIR. */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const WORKBENCH_DIR = process.env.WORKBENCH_DIR || path.resolve('.workbench');

/** Returns the active workbench directory, honoring test/runtime overrides. */
export function getWorkbenchDir() {
  return process.env.WORKBENCH_DIR || path.resolve('.workbench');
}

export async function ensureWorkbenchDir() {
  await fs.mkdir(getWorkbenchDir(), { recursive: true });
}

export async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

/** Writes JSON atomically via temp-file + rename to avoid partial indexes. */
export async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, filePath);
}

export async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`);
}
