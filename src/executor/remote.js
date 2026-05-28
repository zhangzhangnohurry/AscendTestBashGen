import { spawn } from 'node:child_process';

/**
 * Validates remote SSH configuration without opening a network connection.
 * This backs the “确认远程配置” button so users can see missing fields before
 * attempting a live SSH test.
 */
export function remoteHealth(config = {}) {
  const remote = config.remote || {};
  const gaps = [];
  if (!remote.host) gaps.push('remote_host_missing');
  if (!remote.username) gaps.push('remote_username_missing');
  if (!remote.password && !remote.privateKeyPath) gaps.push('remote_password_missing');
  if (remote.rootMode && !remote.rootWarningAcknowledged) gaps.push('root_warning_not_acknowledged');
  return { ok: gaps.length === 0, gaps, config: { host: remote.host || '', username: remote.username || '', port: remote.port || 22, auth: remote.privateKeyPath ? 'key' : 'password', rootMode: Boolean(remote.rootMode) } };
}

/**
 * Performs an optional live SSH smoke test. Password auth uses sshpass only for
 * the spawned process environment and does not write the password into logs or
 * generated command text.
 */
export async function remoteLiveHealth(config = {}, helpers = {}) {
  const base = remoteHealth(config);
  if (!base.ok) return { ...base, phase: 'config', message: '远程配置未确认，先补齐 host、username 和认证信息。' };

  const commandAvailable = helpers.commandAvailable || defaultCommandAvailable;
  const runProcess = helpers.runProcess || defaultRunProcess;
  if (!(await commandAvailable('ssh'))) {
    return { ...base, ok: false, phase: 'ssh', gaps: ['ssh_missing'], message: '当前运行 Web 服务的机器找不到 ssh 命令，无法做 SSH 连通测试。' };
  }

  const remote = config.remote || {};
  const user = remote.rootMode ? 'root' : remote.username;
  const sshArgs = [
    '-o', remote.privateKeyPath ? 'BatchMode=yes' : 'BatchMode=no',
    '-o', 'ConnectTimeout=5',
    '-o', 'NumberOfPasswordPrompts=1',
    '-p', String(remote.port || 22)
  ];
  if (remote.privateKeyPath) {
    sshArgs.push('-i', String(remote.privateKeyPath));
  }
  sshArgs.push(`${user}@${remote.host}`, 'printf workbench-ssh-ok');

  let command = 'ssh';
  let args = sshArgs;
  const env = {};
  if (remote.password && !remote.privateKeyPath) {
    if (!(await commandAvailable('sshpass'))) {
      return { ...base, ok: false, phase: 'ssh', gaps: ['sshpass_missing'], message: '密码模式已确认配置，但当前机器没有 sshpass，无法自动输入密码做连通测试。安装 sshpass 后再点“测试 SSH 连通”，或改用已配置免密/key 的 SSH。' };
    }
    command = 'sshpass';
    args = ['-e', 'ssh', ...sshArgs];
    env.SSHPASS = String(remote.password);
  }

  const result = await runProcess(command, args, { env, timeoutMs: 8000 });
  const ok = result.code === 0 && String(result.stdout || '').includes('workbench-ssh-ok');
  return {
    ...base,
    ok,
    phase: 'ssh',
    gaps: ok ? [] : ['ssh_connect_failed'],
    message: ok ? 'SSH 连通测试通过。' : summarizeSshFailure(result),
    detail: ok ? undefined : trimOutput(result.stderr || result.stdout)
  };
}

/** Builds the SSH command prefix for future remote execution composition. */
export function buildSshPrefix(config = {}) {
  const remote = config.remote || {};
  const port = remote.port || 22;
  const user = remote.rootMode ? 'root' : remote.username;
  const key = remote.privateKeyPath ? ` -i ${shellQuote(remote.privateKeyPath)}` : '';
  // Password is the default auth mode by product decision. The prefix intentionally
  // does not embed passwords; execution code must pass credentials through the
  // selected SSH mechanism instead of writing them into command text.
  return `ssh -p ${shellQuote(String(port))}${key} ${shellQuote(`${user}@${remote.host}`)}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function defaultCommandAvailable(command) {
  const result = await defaultRunProcess(command, ['-V'], { timeoutMs: 2000 });
  return result.code === 0;
}

function defaultRunProcess(command, args = [], { env = {}, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
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
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (code, signalName) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, signal: signalName, stdout, stderr, timedOut });
    });
  });
}

function summarizeSshFailure(result) {
  if (result?.timedOut) return 'SSH 连通测试超时，请检查 host、端口、网络或认证信息。';
  return 'SSH 连通测试失败，请检查 host、username、密码/key、端口以及首次连接的 host key 确认状态。';
}

function trimOutput(value) {
  const text = String(value || '').trim();
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}
