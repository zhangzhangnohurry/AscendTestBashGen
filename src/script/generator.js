import { exportReadiness } from '../domain/state.js';

/**
 * Converts reviewed workbench items into a standalone bash script.
 * The exporter intentionally treats setup/precondition items and test-step items
 * the same way: each item runs its command once, validates the captured output,
 * and fails the whole script on the first error. There is no separate
 * "precondition satisfied" decision path anymore.
 */

export function generateStandaloneScript(items, config = {}) {
  const readiness = exportReadiness(items, config);
  if (!readiness.exportable) {
    return { ok: false, status: 'refused', gaps: readiness.gaps };
  }
  return { ok: true, status: 'exportable', filename: 'command-workbench-case.sh', script: renderScript(readiness.items) };
}

function renderScript(items) {
  const lines = [
    '#!/usr/bin/env bash',
    'set +e',
    '',
    'fail_case() {',
    '  echo "用例执行完成: NO PASS"',
    '  echo "错误样本: $1"',
    '  echo "期望样本: $2"',
    '  echo "NO PASS"',
    '  exit 1',
    '}',
    ''
  ];

  for (const item of items) {
    const expected = shellDouble(item.expected || item.validationDraft.value || 'command and validation should pass');
    lines.push(`# item ${item.index}: ${item.type} target=${item.target}`);
    lines.push('COMMAND_OUTPUT="$({');
    lines.push(item.commandDraft.value);
    lines.push('} 2>&1)"');
    lines.push('COMMAND_STATUS=$?');
    lines.push('printf "%s\n" "$COMMAND_OUTPUT"');
    lines.push(`if [ "$COMMAND_STATUS" -ne 0 ]; then fail_case "command exited $COMMAND_STATUS" "${expected}"; fi`);
    if (String(item.validationDraft.value || '').trim()) {
      lines.push('export COMMAND_OUTPUT COMMAND_STATUS');
      lines.push('{');
      lines.push(item.validationDraft.value);
      lines.push('}');
      lines.push('status=$?');
      lines.push(`if [ "$status" -ne 0 ]; then fail_case "validation exited $status" "${expected}"; fi`);
    }
    lines.push('');
  }

  lines.push('echo "用例执行完成: PASS"');
  lines.push('echo "PASS"');
  lines.push('exit 0');
  lines.push('');
  return lines.join('\n');
}

function shellDouble(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
