import { appendJsonLine, getWorkbenchDir } from '../persistence/files.js';
import { validateExecutionSlice } from '../domain/state.js';
import { nowIso, TARGET } from '../domain/types.js';
import { runShellScript } from './local.js';
import { remoteHealth } from './remote.js';
import path from 'node:path';

/**
 * Executes the reviewed prefix 0..selectedIndex and stores an immutable run
 * snapshot. Readiness checks happen before execution so blank/unconfirmed/model
 * guesses never run accidentally.
 */
export async function executeToHere(items, selectedIndex, config = {}, runner = runShellScript) {
  const validation = validateExecutionSlice(items, selectedIndex);
  if (!validation.ok) return { ok: false, status: 'blocked', gaps: validation.gaps, selectedIndex };

  const remoteTargets = validation.slice.filter((item) => item.target === TARGET.HOST || item.target === TARGET.DEVICE);
  if (remoteTargets.length) {
    const health = remoteHealth(config);
    if (!health.ok) {
      return { ok: false, status: 'blocked', gaps: health.gaps.map((code) => ({ code, message: code })), selectedIndex };
    }
  }

  const snapshot = deepFreezeClone(validation.slice);
  const script = buildExecutionScript(snapshot);
  const startedAt = nowIso();
  const result = await runner(script, {
    cwd: config.cwd || process.cwd(),
    env: config.env || {},
    timeoutMs: config.timeoutMs || 30000,
    signal: config.signal
  });
  const finishedAt = nowIso();
  const job = {
    id: `job-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    selectedIndex,
    startedAt,
    finishedAt,
    status: result.code === 0 ? 'passed' : (result.timedOut ? 'timeout' : 'failed'),
    snapshot,
    result
  };
  await appendJsonLine(path.join(getWorkbenchDir(), 'run-history.jsonl'), job);
  return { ok: result.code === 0, ...job };
}

/**
 * Renders the execute-to-here script used by the interactive run button. The
 * validation block receives COMMAND_OUTPUT/COMMAND_STATUS from the primary
 * command, preventing the validation from rerunning the main command.
 */
export function buildExecutionScript(items) {
  const lines = ['set +e', 'echo "[workbench] execute-to-here snapshot start"'];
  for (const item of items) {
    lines.push(`echo "[workbench] item ${item.index} ${item.type} target=${item.target}"`);
    lines.push('COMMAND_OUTPUT="$({');
    lines.push(item.commandDraft.value);
    lines.push('} 2>&1)"');
    lines.push('COMMAND_STATUS=$?');
    lines.push('printf "%s\n" "$COMMAND_OUTPUT"');
    lines.push('if [ "$COMMAND_STATUS" -ne 0 ]; then echo "[workbench] command failed at item ' + item.index + '" >&2; exit "$COMMAND_STATUS"; fi');
    if (String(item.validationDraft?.value || '').trim()) {
      lines.push('export COMMAND_OUTPUT COMMAND_STATUS');
      lines.push('{');
      lines.push(item.validationDraft.value);
      lines.push('}');
      lines.push('status=$?');
      lines.push('if [ "$status" -ne 0 ]; then echo "[workbench] validation failed at item ' + item.index + '" >&2; exit "$status"; fi');
    }
  }
  lines.push('echo "[workbench] execute-to-here snapshot complete"');
  return lines.join('\n');
}

function deepFreezeClone(value) {
  return JSON.parse(JSON.stringify(value));
}
