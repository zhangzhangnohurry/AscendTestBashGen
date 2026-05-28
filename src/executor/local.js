import { spawn } from 'node:child_process';

/**
 * Runs a generated bash snippet locally with bounded time and captured output.
 * The caller supplies already-reviewed script text; this helper only manages the
 * child process lifecycle and never edits commands.
 */
export function runShellScript(script, { cwd = process.cwd(), env = {}, timeoutMs = 30000, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (code, signalName) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, signal: signalName, stdout, stderr, timedOut });
    });
  });
}
