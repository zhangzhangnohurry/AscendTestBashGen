import { spawn } from 'node:child_process';
import { promptForTask, systemPromptForTask } from './prompts.js';
import { redactSecrets } from '../security/redact.js';

const DIRECT_PROVIDERS = new Set(['local-claude', 'local-codex', 'llm-api']);
const CUSTOM_CLI_PROVIDERS = new Set(['cli', 'custom-cli']);
const CUSTOM_HTTP_PROVIDERS = new Set(['http', 'custom-http']);
export const DEFAULT_ADAPTER_TIMEOUT_MS = 600000;

/**
 * Reads default adapter settings from environment variables. Per-request UI
 * settings are merged in the server before constructing ConfigurableAdapter,
 * so this function remains the stable fallback for headless/server use.
 */
export function loadAdapterConfig(env = process.env) {
  return {
    provider: (env.WORKBENCH_LLM_PROVIDER || 'disabled').toLowerCase(),
    command: env.WORKBENCH_LLM_COMMAND || '',
    url: env.WORKBENCH_LLM_URL || '',
    model: env.WORKBENCH_LLM_MODEL || '',
    timeoutMs: Number(env.WORKBENCH_LLM_TIMEOUT_MS || DEFAULT_ADAPTER_TIMEOUT_MS),
    apiKey: env.WORKBENCH_LLM_API_KEY || '',
    apiKeyHeader: env.WORKBENCH_LLM_API_KEY_HEADER || 'Authorization',
    apiKeyPrefix: env.WORKBENCH_LLM_API_KEY_PREFIX || 'Bearer'
  };
}

/**
 * Transport wrapper for all model interactions. It deliberately knows about
 * providers, tracing, redaction and JSON parsing, while prompt wording lives in
 * src/llm/prompts.js.
 */
export class ConfigurableAdapter {
  constructor(config = loadAdapterConfig(), options = {}) {
    this.config = { ...config, provider: (config.provider || 'disabled').toLowerCase() };
    this.trace = options.trace || [];
    this.onTraceUpdate = typeof options.onTraceUpdate === 'function' ? options.onTraceUpdate : () => {};
  }

  async health() {
    const provider = this.config.provider;
    if (CUSTOM_CLI_PROVIDERS.has(provider)) {
      if (!this.config.command) return notConfigured('Custom CLI adapter requires a command.');
      return this.#call({ task: 'health' }).catch((error) => ({ ok: false, provider, configured: true, message: error.message }));
    }
    if (CUSTOM_HTTP_PROVIDERS.has(provider)) {
      if (!this.config.url) return notConfigured('Custom HTTP adapter requires a URL.');
      return this.#call({ task: 'health' }).catch((error) => ({ ok: false, provider, configured: true, message: error.message }));
    }
    if (provider === 'local-claude') return localCliHealth('local-claude', this.config.command || 'claude');
    if (provider === 'local-codex') return localCliHealth('local-codex', this.config.command || 'codex');
    if (provider === 'llm-api') {
      const missing = missingApiFields(this.config);
      if (missing.length) return { ok: false, provider, configured: false, message: `Missing: ${missing.join(', ')}` };
      return this.#call({ task: 'health' }).catch((error) => ({ ok: false, provider, configured: true, message: error.message }));
    }
    return notConfigured('Choose Local Claude CLI, Local Codex CLI, or LLM API to enable extraction.');
  }

  async extractTestCase(text, context = {}) {
    if (!this.#configured()) return { configured: false, items: [] };
    const response = await this.#call({ task: 'extractTestCase', text, context });
    return { configured: true, items: Array.isArray(response.items) ? response.items : [], raw: response };
  }

  async matchSkill(item, skills = [], context = {}) {
    if (!this.#configured() || !skills.length) return { action: 'no_match' };
    const safeSkills = skills.map((skill) => ({ id: skill.id, intent: skill.intent, target: skill.target || 'local' }));
    const response = await this.#call({ task: 'matchSkill', item, skills: safeSkills, context });
    if (response.action === 'reuse' && response.skillId) return { action: 'reuse', skillId: String(response.skillId) };
    return { action: 'no_match' };
  }

  async inferCommand(intent, context = {}) {
    if (!this.#configured()) return '';
    const response = await this.#call({ task: 'inferCommand', intent, context });
    return String(response.command || response.text || '').trim();
  }

  async inferValidation(expected, context = {}) {
    if (!this.#configured()) return '';
    const response = await this.#call({ task: 'inferValidation', expected, context });
    return String(response.validation || response.text || '').trim();
  }


  async selectKnowledge({ phase, isDeviceShell, text = '', item = null, candidates = [], limit = 6 } = {}) {
    if (!this.#configured() || !Array.isArray(candidates) || !candidates.length) return { configured: false, ids: [] };
    const response = await this.#call({ task: 'selectKnowledge', phase, isDeviceShell, text, item, candidates, limit });
    const ids = Array.isArray(response.ids) ? response.ids
      : Array.isArray(response.selectedIds) ? response.selectedIds
        : Array.isArray(response.knowledgeIds) ? response.knowledgeIds
          : [];
    return { configured: true, ids: ids.map((id) => String(id)), raw: response };
  }

  #configured() {
    const provider = this.config.provider;
    return CUSTOM_CLI_PROVIDERS.has(provider) ? Boolean(this.config.command)
      : CUSTOM_HTTP_PROVIDERS.has(provider) ? Boolean(this.config.url)
      : provider === 'local-claude'
      || provider === 'local-codex'
      || (provider === 'llm-api' && missingApiFields(this.config).length === 0);
  }

  /**
   * Executes one logical LLM task and records a redacted interaction trace for
   * the right-side UI log. The raw request may contain user text, but secrets
   * are removed before any response leaves the server.
   */
  async #call(payload) {
    const provider = this.config.provider;
    const entry = {
      id: `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      provider,
      task: payload.task,
      status: 'pending',
      request: redactSecrets(summarizePayload(payload))
    };
    const started = Date.now();
    this.trace.push(entry);
    try {
      let result;
      let operation;
      if (CUSTOM_CLI_PROVIDERS.has(provider)) operation = callCustomCli(this.config, payload, entry);
      else if (CUSTOM_HTTP_PROVIDERS.has(provider)) operation = callCustomHttp(this.config, payload, entry);
      else if (provider === 'local-claude' || provider === 'local-codex') operation = callLocalModelCli(this.config, payload, entry);
      else if (provider === 'llm-api') operation = callLlmApi(this.config, payload, entry);
      else throw new Error('LLM provider is not configured');
      this.#notifyTrace(entry, started);
      result = await operation;
      entry.status = 'ok';
      entry.response = redactSecrets(summarizeResponse(result));
      return result;
    } catch (error) {
      entry.status = 'error';
      entry.error = error.message;
      throw error;
    } finally {
      entry.durationMs = Date.now() - started;
      this.#notifyTrace(entry, started);
    }
  }

  #notifyTrace(entry, started) {
    entry.durationMs = Date.now() - started;
    this.onTraceUpdate(redactSecrets({ ...entry }));
  }
}

async function callCustomCli(config, payload, trace) {
  return new Promise((resolve, reject) => {
    const timeoutMs = effectiveTimeoutMs(config);
    trace.transport = { type: 'custom-cli', command: config.command };
    trace.stdin = limitText(JSON.stringify(payload, null, 2), 4000);
    trace.conversation = [{ role: 'stdin', content: trace.stdin }];
    const child = spawn(config.command, [], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI adapter timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      trace.stdout = limitText(stdout, 4000);
      if (stderr.trim()) trace.stderr = limitText(stderr, 1000);
      if (trace.stdout) trace.conversation.push({ role: 'stdout', content: trace.stdout });
      if (trace.stderr) trace.conversation.push({ role: 'stderr', content: trace.stderr });
      if (code !== 0) return reject(new Error(`CLI adapter exited ${code}: ${stderr.trim()}`));
      try {
        const parsed = stdout.trim() ? JSON.parse(stdout) : {};
        resolve({ provider: config.provider, configured: true, ok: parsed.ok !== false, ...parsed });
      } catch {
        reject(new Error(`CLI adapter returned non-JSON output: ${stdout.slice(0, 200)}`));
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

async function callCustomHttp(config, payload, trace) {
  trace.transport = { type: 'custom-http', url: config.url };
  trace.httpRequest = { url: config.url, body: summarizePayload(payload) };
  const response = await postJson(config.url, payload, httpHeaders(config), effectiveTimeoutMs(config), trace);
  return { provider: config.provider, configured: true, ok: response.ok !== false, ...response };
}

/** Local Claude/Codex calls receive one plain prompt over stdin. */
async function callLocalModelCli(config, payload, trace) {
  if (payload.task === 'health') return localCliHealth(config.provider, localCommand(config));
  const prompt = promptForTask(payload);
  const command = localInvocation(config);
  trace.transport = { type: 'local-cli', command };
  trace.prompt = limitText(prompt, 8000);
  trace.conversation = [{ role: 'stdin', content: trace.prompt }];
  const stdout = await runModelCommand(command, prompt, effectiveTimeoutMs(config), trace);
  trace.stdout = limitText(stdout, 8000);
  trace.conversation.push({ role: 'stdout', content: trace.stdout });
  const parsed = extractJson(stdout);
  return { provider: config.provider, configured: true, ok: parsed.ok !== false, ...parsed };
}

/** HTTP LLM API calls are sent in chat-completions-compatible shape. */
async function callLlmApi(config, payload, trace) {
  const prompt = promptForTask(payload);
  const url = resolveApiUrl(config.url);
  const body = {
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPromptForTask(payload) },
      { role: 'user', content: prompt }
    ]
  };
  trace.transport = { type: 'llm-api', url, model: config.model };
  trace.prompt = limitText(prompt, 8000);
  trace.httpRequest = { url, model: config.model, temperature: 0, messages: body.messages };
  trace.conversation = body.messages.map((message) => ({ role: message.role, content: limitText(message.content, 8000) }));
  const response = await postJson(url, body, httpHeaders(config), effectiveTimeoutMs(config), trace);
  const content = response.choices?.[0]?.message?.content ?? response.output_text ?? response.text ?? JSON.stringify(response);
  trace.modelOutput = limitText(content, 8000);
  trace.conversation.push({ role: 'assistant', content: trace.modelOutput });
  const parsed = extractJson(content);
  return { provider: 'llm-api', configured: true, ok: parsed.ok !== false, ...parsed };
}


function localInvocation(config) {
  const command = localCommand(config);
  if (config.provider === 'local-claude') {
    const model = config.model ? ` --model ${shellQuote(config.model)}` : '';
    return `${command} -p --output-format text${model}`;
  }
  const model = config.model ? ` -m ${shellQuote(config.model)}` : '';
  return `${command} exec --skip-git-repo-check --sandbox read-only${model} -`;
}

function localCommand(config) {
  return config.command || (config.provider === 'local-claude' ? 'claude' : 'codex');
}

async function localCliHealth(provider, command) {
  try {
    const result = await runShell(`command -v ${shellQuote(command.split(/\s+/)[0])}`, '', 5000);
    if (result.code !== 0) return { ok: false, provider, configured: false, message: `${command} not found on server PATH` };
    return { ok: true, provider, configured: true, message: `${command} found at ${result.stdout.trim()}` };
  } catch (error) {
    return { ok: false, provider, configured: false, message: error.message };
  }
}

async function runModelCommand(command, prompt, timeoutMs, trace) {
  const result = await runShell(command, prompt, timeoutMs);
  if (result.code !== 0) {
    if (trace) {
      trace.stdout = limitText(result.stdout, 8000);
      trace.stderr = limitText(result.stderr, 2000);
      if (trace.stdout) trace.conversation.push({ role: 'stdout', content: trace.stdout });
      if (trace.stderr) trace.conversation.push({ role: 'stderr', content: trace.stderr });
    }
    throw new Error(`${command} exited ${result.code}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function runShell(command, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Command timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin || '');
  });
}

async function postJson(url, body, headers, timeoutMs, trace) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    if (trace) {
      trace.httpStatus = response.status;
      trace.httpResponseText = limitText(text, 8000);
    }
    let json = {};
    if (text) json = JSON.parse(text);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    return json;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      if (trace) trace.httpError = `timeout after ${timeoutMs}ms`;
      throw new Error(`LLM/API request timed out after ${timeoutMs}ms. 这是统一的 10 分钟模型调用超时时间，说明模型/API 在该时间内没有返回。`);
    }
    if (trace) trace.httpError = limitText(error.message || String(error), 8000);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resolveApiUrl(url) {
  const trimmed = String(url || '').replace(/\/$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  if (/\/responses$/.test(trimmed)) return trimmed;
  return `${trimmed}/v1/chat/completions`;
}

function httpHeaders(config) {
  const headers = { 'content-type': 'application/json' };
  if (config.apiKey) {
    const headerName = config.apiKeyHeader || 'Authorization';
    const prefix = config.apiKeyPrefix ?? 'Bearer';
    headers[headerName] = prefix ? `${prefix} ${config.apiKey}` : config.apiKey;
  }
  return headers;
}

function missingApiFields(config) {
  const missing = [];
  if (!config.url) missing.push('url');
  if (!config.apiKey) missing.push('apiKey');
  if (!config.model) missing.push('model');
  return missing;
}

function effectiveTimeoutMs(config) {
  return DEFAULT_ADAPTER_TIMEOUT_MS;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error(`Model output did not contain JSON: ${raw.slice(0, 200)}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function notConfigured(message) {
  return { ok: false, provider: 'disabled', configured: false, message };
}

function summarizePayload(payload) {
  const summary = { task: payload.task };
  if (payload.text != null) {
    summary.textLength = String(payload.text).length;
    summary.textPreview = limitText(payload.text, 600);
  }
  if (payload.intent != null) summary.intent = limitText(payload.intent, 600);
  if (payload.expected != null) summary.expected = limitText(payload.expected, 600);
  if (payload.item) {
    summary.item = {
      index: payload.item.index,
      type: payload.item.type,
      target: payload.item.target,
      sourceText: limitText(payload.item.sourceText || payload.item.intent || '', 800),
      expected: limitText(payload.item.expected || '', 600)
    };
  }
  if (Array.isArray(payload.skills)) summary.skillCount = payload.skills.length;
  if (Array.isArray(payload.candidates)) summary.knowledgeCandidateCount = payload.candidates.length;
  if (payload.phase) summary.phase = payload.phase;
  if (typeof payload.isDeviceShell === 'boolean') summary.isDeviceShell = payload.isDeviceShell;
  if (Array.isArray(payload.context?.knowledge)) summary.selectedKnowledgeIds = payload.context.knowledge.map((item) => item.id);
  return summary;
}

function summarizeResponse(response) {
  return {
    ok: response?.ok !== false,
    provider: response?.provider,
    itemCount: Array.isArray(response?.items) ? response.items.length : undefined,
    action: response?.action,
    hasCommand: Boolean(response?.command),
    hasValidation: Boolean(response?.validation),
    checkCount: Array.isArray(response?.checks) ? response.checks.length : undefined,
    selectedKnowledgeCount: Array.isArray(response?.ids) ? response.ids.length : undefined,
    keys: response && typeof response === 'object' ? Object.keys(response).slice(0, 20) : []
  };
}

function limitText(value, limit) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
