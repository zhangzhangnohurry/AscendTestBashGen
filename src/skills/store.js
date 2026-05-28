/** Legacy user-confirmed command snippets, kept for existing UI flows. */
import path from 'node:path';
import { atomicWriteJson, ensureWorkbenchDir, getWorkbenchDir, readJsonFile } from '../persistence/files.js';
import { normalizeIntent } from './match.js';
import { nowIso } from '../domain/types.js';

export const SKILLS_FILE = path.join(getWorkbenchDir(), 'skills.json');

function skillsFile() {
  return path.join(getWorkbenchDir(), 'skills.json');
}

/** Lists saved skills as compact metadata for model-mediated reuse. */
export async function listSkills() {
  await ensureWorkbenchDir();
  const data = await readJsonFile(skillsFile(), { version: 1, skills: [] });
  return data.skills || [];
}


/** Persists a user-confirmed skill; unconfirmed model drafts are refused. */
export async function persistSkill({ intent, command, validation = '', target = 'local', confirmed = false }) {
  if (!confirmed) return { persisted: false, reason: 'confirmation_required' };
  if (!String(intent || '').trim() || !String(command || '').trim()) {
    return { persisted: false, reason: 'intent_and_command_required' };
  }
  const data = await readJsonFile(skillsFile(), { version: 1, skills: [] });
  const id = `skill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const skill = {
    id,
    intent: String(intent).trim(),
    normalizedIntent: normalizeIntent(intent),
    command: String(command),
    validation: String(validation || ''),
    target,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const existing = (data.skills || []).filter((entry) => normalizeIntent(entry.intent) !== skill.normalizedIntent);
  await atomicWriteJson(skillsFile(), { version: 1, skills: [...existing, skill] });
  return { persisted: true, skill };
}
