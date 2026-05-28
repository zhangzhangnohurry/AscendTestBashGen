// Browser-side controller for the single-page workbench.
// It owns only UI state and calls server APIs for parsing, generation,
// execution and export checks; it does not interpret test-case semantics locally.
let items = [];
let pendingSkillIndex = null;
let currentGaps = [];
let gapCursor = -1;
let interactionLogs = [];
let worklogLines = [];
let waitLogTimers = [];
let activeTraceId = null;
const $ = (id) => document.getElementById(id);
const UI_PROVIDERS = new Set(['disabled', 'local-claude', 'local-codex', 'llm-api']);
const DEFAULT_ADAPTER_TIMEOUT_MS = 600000;

$('parseBtn').addEventListener('click', splitText);
$('calibrateBtn').addEventListener('click', calibrateStructure);
$('generateBtn').addEventListener('click', generateDrafts);
$('downloadBtn').addEventListener('click', downloadScript);
$('nextGapBtn').addEventListener('click', jumpToNextGap);
$('menuBtn').addEventListener('click', toggleRawPanel);
$('settingsBtn').addEventListener('click', openSettingsModal);
$('closeSettingsModal').addEventListener('click', closeSettingsModal);
$('saveSettingsBtn').addEventListener('click', saveSettings);
$('clearSettingsBtn').addEventListener('click', clearSettings);
$('testSettingsBtn').addEventListener('click', testSettings);
$('adapterProvider').addEventListener('change', updateProviderFields);
$('clearConsoleBtn').addEventListener('click', () => { $('console').textContent = ''; });
$('confirmRemoteBtn').addEventListener('click', confirmRemoteConfig);
$('testRemoteBtn').addEventListener('click', testRemoteConnection);
$('copyRawBtn').addEventListener('click', () => navigator.clipboard?.writeText($('rawText').value));
$('closeSkillModal').addEventListener('click', closeSkillModal);
$('cancelSkillBtn').addEventListener('click', closeSkillModal);
$('confirmSkillBtn').addEventListener('click', savePendingSkill);
loadSettings();
loadHealth();


function toggleRawPanel() {
  $('rawPanel').classList.toggle('collapsed');
  document.body.classList.toggle('raw-collapsed', $('rawPanel').classList.contains('collapsed'));
}

function openSettingsModal() {
  loadSettings();
  $('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  $('settingsModal').classList.add('hidden');
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('workbenchAdapterConfig') || '{}');
  const provider = UI_PROVIDERS.has(saved.provider) ? saved.provider : 'disabled';
  $('adapterProvider').value = provider;
  $('adapterCommand').value = saved.command || '';
  $('customCliCommand').value = saved.command || '';
  $('adapterUrl').value = saved.url || '';
  $('customHttpUrl').value = saved.url || '';
  $('adapterModel').value = saved.model || '';
  $('adapterApiModel').value = saved.model || '';
  $('adapterTimeout').value = String(DEFAULT_ADAPTER_TIMEOUT_MS);
  $('adapterApiKey').value = saved.apiKey || '';
  $('customHttpApiKey').value = saved.apiKey || '';
  $('customHttpApiKeyHeader').value = saved.apiKeyHeader || 'Authorization';
  $('customHttpApiKeyPrefix').value = saved.apiKeyPrefix ?? 'Bearer';
  loadRemoteSettings();
  updateProviderFields();
}

function saveSettings() {
  const config = getAdapterConfigFromForm();
  localStorage.setItem('workbenchAdapterConfig', JSON.stringify(config));
  saveRemoteSettings();
  appendLog(`已保存配置：${config.provider}；SSH 密码不会写入 localStorage。`);
  closeSettingsModal();
  loadHealth();
}

function clearSettings() {
  localStorage.removeItem('workbenchAdapterConfig');
  localStorage.removeItem('workbenchRemoteConfig');
  clearRemoteFields();
  loadSettings();
  appendLog('已清空 LLM/CLI 与远程 SSH 配置。');
  loadHealth();
}

async function testSettings() {
  const config = getAdapterConfigFromForm();
  const result = await api('/api/adapter/health', { adapterConfig: config }, true);
  addInteractions(result.interactionLog);
  appendLog('配置测试完成：', result);
}

function getAdapterConfig() {
  return JSON.parse(localStorage.getItem('workbenchAdapterConfig') || '{}');
}

function getAdapterConfigFromForm() {
  const provider = $('adapterProvider').value;
  const base = { provider, timeoutMs: DEFAULT_ADAPTER_TIMEOUT_MS };
  if (provider === 'local-claude' || provider === 'local-codex') {
    return { ...base, model: $('adapterModel').value.trim(), command: $('adapterCommand').value.trim() };
  }
  if (provider === 'llm-api') {
    return { ...base, url: $('adapterUrl').value.trim(), apiKey: $('adapterApiKey').value, model: $('adapterApiModel').value.trim() };
  }
  if (provider === 'custom-cli') {
    return { ...base, command: $('customCliCommand').value.trim() };
  }
  if (provider === 'custom-http') {
    return {
      ...base,
      url: $('customHttpUrl').value.trim(),
      apiKey: $('customHttpApiKey').value,
      apiKeyHeader: $('customHttpApiKeyHeader').value.trim() || 'Authorization',
      apiKeyPrefix: $('customHttpApiKeyPrefix').value
    };
  }
  return base;
}

function updateProviderFields() {
  const provider = $('adapterProvider').value;
  $('disabledSettings').classList.toggle('hidden', provider !== 'disabled');
  $('localSettings').classList.toggle('hidden', provider !== 'local-claude' && provider !== 'local-codex');
  $('apiSettings').classList.toggle('hidden', provider !== 'llm-api');
  $('customCliSettings').classList.toggle('hidden', provider !== 'custom-cli');
  $('customHttpSettings').classList.toggle('hidden', provider !== 'custom-http');
}

async function loadHealth() {
  const localConfig = getAdapterConfig();
  const hasLocalConfig = localConfig.provider && localConfig.provider !== 'disabled';
  const health = hasLocalConfig
    ? await api('/api/adapter/health', { adapterConfig: localConfig }, true)
    : (await api('/api/health')).llm;
  const label = hasLocalConfig ? providerLabel(localConfig.provider) : health.provider;
  $('llmHealth').textContent = `● LLM/CLI ${health.ok ? label : '未配置/不可用'}`;
  $('llmHealth').className = `pill ${health.ok ? 'green' : 'orange'}`;
  $('remoteHealth').textContent = '● 远程主机待配置';
}

/**
 * Stage 1: local deterministic section split. This runs before any LLM call so
 * users can review/adjust the ordered S-list and choose whether LLM calibration
 * is needed.
 */
async function splitText() {
  $('parseBtn').disabled = true;
  items = [];
  currentGaps = [];
  gapCursor = -1;
  interactionLogs = [];
  worklogLines = [];
  activeTraceId = createTraceId();
  renderCards();
  renderWorklog([]);
  updateGapSummary([]);
  resetPipeline();
  try {
    $('calibrateBtn').classList.add('hidden');
    $('generateBtn').classList.add('hidden');
    setPipelineStep('pipelineDecompose', 'running', '章节拆分中：读取 S 编号结构...');
    appendLog('章节拆分中：基于显式 S 编号拆分原文，不调用 LLM。');
    const decomposed = await api('/api/structure/split', { text: $('rawText').value });
    items = decomposed.items || [];
    renderWorklog(decomposed.worklog || []);
    renderCards();
    setPipelineStep('pipelineDecompose', 'done', `完成：${items.length} 个步骤`);
    setPipelineStep('pipelineCalibrate', 'idle', '可选：用户确认是否需要 LLM 校准');
    setPipelineStep('pipelineGenerate', 'idle', '等待用户确认后生成');
    $('calibrateBtn').classList.remove('hidden');
    $('generateBtn').classList.remove('hidden');
    appendLog('请在中间列表调整原文/判断原文；可选择 LLM 校准，或直接确认生成脚本。');
    await checkExport();
  } catch (error) {
    setPipelineStep('pipelineDecompose', 'error', error.message || String(error));
    appendLog(`章节拆分失败：${error.message || error}`);
  } finally {
    $('parseBtn').disabled = false;
  }
}

async function calibrateStructure() {
  if (!items.length) return;
  $('calibrateBtn').disabled = true;
  activeTraceId = createTraceId();
  try {
    setPipelineStep('pipelineCalibrate', 'running', 'LLM 校准中：仅调整步骤边界/顺序...');
    appendLog('LLM 校准中：不会生成脚本，只输出 step 条目。');
    const decomposed = await withWaitingLog(
      'LLM 校准中：LLM/CLI 仍在处理',
      () => api('/api/decompose', { text: $('rawText').value, items, adapterConfig: getAdapterConfig(), traceId: activeTraceId })
    );
    addInteractions(decomposed.interactionLog);
    items = decomposed.items || [];
    renderWorklog(decomposed.worklog || []);
    renderCards();
    setPipelineStep('pipelineCalibrate', 'done', `完成：${items.length} 个步骤`);
    await checkExport();
  } catch (error) {
    const receivedLogs = addInteractions(error.payload?.interactionLog);
    if (!receivedLogs) await refreshRecentInteractions();
    setPipelineStep('pipelineCalibrate', 'error', error.message || String(error));
    appendLog(`LLM 校准失败：${error.message || error}`);
    if (error.payload) appendLog('失败详情：', error.payload);
  } finally {
    $('calibrateBtn').disabled = false;
    activeTraceId = null;
  }
}

async function generateDrafts() {
  if (!items.length) return;
  $('generateBtn').disabled = true;
  activeTraceId = createTraceId();
  try {
    setPipelineStep('pipelineGenerate', 'running', `脚本生成中：0/${items.length}`);
    appendLog(`脚本生成中：逐项回填 ${items.length} 个草稿...`);
    for (let index = 0; index < items.length; index += 1) {
      setPipelineStep('pipelineGenerate', 'running', `脚本生成中：${index + 1}/${items.length}`);
      appendLog(`脚本生成中：请求 LLM/CLI 生成 item ${index + 1}/${items.length}...`);
      const result = await withWaitingLog(
        `脚本生成中：item ${index + 1}/${items.length} 仍在处理`,
        () => api('/api/generate-item', { item: items[index], adapterConfig: getAdapterConfig(), config: collectConfig(), traceId: activeTraceId })
      );
      addInteractions(result.interactionLog);
      items[index] = result.item;
      renderCards();
      await checkExport();
    }
    setPipelineStep('pipelineGenerate', 'done', `完成：已回填 ${items.length} 个草稿`);
    appendLog('脚本生成完成。');
  } catch (error) {
    const receivedLogs = addInteractions(error.payload?.interactionLog);
    if (!receivedLogs) await refreshRecentInteractions();
    setPipelineStep('pipelineGenerate', 'error', error.message || String(error));
    appendLog(`生成失败：${error.message || error}`);
    if (error.payload) appendLog('失败详情：', error.payload);
  } finally {
    $('generateBtn').disabled = false;
    activeTraceId = null;
  }
}

function resetPipeline() {
  setPipelineStep('pipelineDecompose', 'idle', '等待开始');
  setPipelineStep('pipelineCalibrate', 'idle', '等待用户选择');
  setPipelineStep('pipelineGenerate', 'idle', '等待开始');
}

function setPipelineStep(id, state, message) {
  const element = $(id);
  element.className = state;
  element.querySelector('span').textContent = message;
}

function renderCards() {
  $('emptyState').classList.toggle('hidden', items.length > 0);
  renderGroup('stepsSection', 'stepCards', 'stepCount', items);
}

function renderGroup(sectionId, containerId, countId, groupItems) {
  $(sectionId).classList.toggle('hidden', groupItems.length === 0);
  $(countId).textContent = groupItems.length ? `(${groupItems.length})` : '';
  $(containerId).innerHTML = '';
  groupItems.forEach((item) => $(containerId).appendChild(renderRow(item)));
  $(containerId).querySelectorAll('textarea').forEach((el) => el.addEventListener('input', onEdit));
  $(containerId).querySelectorAll('button').forEach((el) => el.addEventListener('click', onAction));
}

function renderRow(item) {
  const actualIndex = items.indexOf(item);
  const commandBlocked = item.commandDraft.originalProvenance === 'inferred' && !item.commandDraft.confirmed;
  const row = document.createElement('article');
  row.className = `row-card depth-${Math.min(Number(item.depth || 1), 3)}`;
  row.id = `item-${actualIndex}`;
  row.innerHTML = `
    <div class="row-index">${escapeHtml(item.label || `S${actualIndex + 1}`)}</div>
    <div class="editor-block source-block">
      <label>原文</label>
      <textarea data-kind="source" data-index="${actualIndex}">${escapeHtml(item.sourceText || item.intent || '')}</textarea>
    </div>
    <div class="reference-block">
      <label>参考文档</label>
      ${renderKnowledgeRefs(item.knowledgeRefs)}
    </div>
    <div class="editor-block">
      <label>生成脚本</label>
      <span class="badge ${escapeHtml(item.commandDraft.provenance)}">${escapeHtml(labelForProvenance(item.commandDraft, commandBlocked))}</span>
      <textarea data-kind="command" data-index="${actualIndex}">${escapeHtml(item.commandDraft.value)}</textarea>
    </div>
    <div class="editor-block">
      <label>判断原文</label>
      <textarea data-kind="expected" data-index="${actualIndex}">${escapeHtml(item.expected || '')}</textarea>
    </div>
    <div class="editor-block">
      <label>生成判断脚本</label>
      <span class="badge ${escapeHtml(item.validationDraft.provenance || 'blank')}">${escapeHtml(labelForValidation(item.validationDraft))}</span>
      <textarea data-kind="validation" data-index="${actualIndex}" placeholder="例如：grep -q 'expected text' <<< \"$COMMAND_OUTPUT\"">${escapeHtml(item.validationDraft.value || '')}</textarea>
    </div>
    <div class="row-actions">
      <button class="execute-btn" data-action="execute" data-index="${actualIndex}">▷ 执行到此</button>
      <button class="secondary" data-action="confirm" data-index="${actualIndex}">确认草稿</button>
      <button class="secondary" data-action="skill" data-index="${actualIndex}">保存 skill</button>
    </div>`;
  return row;
}

function labelForProvenance(draft, blocked) {
  if (blocked) return '推断初稿';
  if (draft.provenance === 'skill_reuse') return '来自 skill';
  if (draft.provenance === 'original') return '原文命令';
  if (draft.provenance === 'user_edited') return '用户编辑';
  return draft.provenance || '草稿';
}

function labelForValidation(draft) {
  if (!draft?.value) return draft?.required ? '需要验证' : '可选';
  if ((draft.originalProvenance || draft.provenance) === 'inferred_validation' && !draft.confirmed) return '推断验证';
  if (draft.provenance === 'skill_reuse') return '来自 skill';
  if (draft.provenance === 'user_edited') return '用户编辑';
  if (draft.provenance === 'original_expected') return '原文验证';
  return draft.provenance || '验证';
}

function onEdit(event) {
  const index = Number(event.target.dataset.index);
  const item = items[index];
  if (event.target.dataset.kind === 'source') {
    item.sourceText = event.target.value;
    item.intent = event.target.value;
  } else if (event.target.dataset.kind === 'expected') {
    item.expected = event.target.value;
    item.validationDraft.required = Boolean(event.target.value.trim());
  } else if (event.target.dataset.kind === 'command') {
    item.commandDraft.value = event.target.value;
    item.commandDraft.provenance = 'user_edited';
    item.commandDraft.editState = 'dirty';
  } else {
    item.validationDraft.value = event.target.value;
    item.validationDraft.provenance = 'user_edited';
    item.validationDraft.confirmed = true;
  }
}

function renderKnowledgeRefs(refs = []) {
  if (!Array.isArray(refs) || !refs.length) return '<div class="muted-ref">待选择</div>';
  return `<ul class="knowledge-refs">${refs.map((ref) => `<li title="${escapeHtml(ref.id)}">${escapeHtml(ref.title || ref.id)}</li>`).join('')}</ul>`;
}

async function onAction(event) {
  const index = Number(event.target.dataset.index);
  const action = event.target.dataset.action;
  if (action === 'confirm') {
    items[index].commandDraft.confirmed = true;
    items[index].commandDraft.rejected = false;
    if (items[index].validationDraft) items[index].validationDraft.confirmed = true;
    appendLog(`已确认 item ${index} 的命令草稿。`);
    renderCards();
    return checkExport();
  }
  if (action === 'skill') return openSkillModal(index);
  if (action === 'execute') {
    appendLog(`开始执行：0 → ${index}`);
    const result = await api('/api/execute', { items, selectedIndex: index, config: collectConfig() }, true);
    appendLog(result);
    await checkExport();
  }
}

function openSkillModal(index) {
  pendingSkillIndex = index;
  const item = items[index];
  $('skillIntent').value = item.intent || item.sourceText || '';
  $('skillCommand').value = item.commandDraft.value || '';
  $('skillName').value = item.intent || item.sourceText || '';
  $('skillDescription').value = '';
  $('skillModal').classList.remove('hidden');
}

function closeSkillModal() {
  pendingSkillIndex = null;
  $('skillModal').classList.add('hidden');
}

async function savePendingSkill() {
  if (pendingSkillIndex == null) return;
  const item = items[pendingSkillIndex];
  const result = await api('/api/skills', {
    intent: $('skillIntent').value || item.intent,
    command: $('skillCommand').value || item.commandDraft.value,
    validation: item.validationDraft.value,
    target: item.target,
    confirmed: true,
    name: $('skillName').value,
    description: $('skillDescription').value
  });
  appendLog(result.persisted ? `Skill saved: ${result.skill.id}` : `Skill not saved: ${result.reason}`);
  closeSkillModal();
}


async function confirmRemoteConfig() {
  const result = await api('/api/remote/health', { config: collectConfig(), live: false }, true);
  updateRemoteStatus(result);
  saveRemoteSettings();
  appendLog('远程配置确认：', result);
}

async function testRemoteConnection() {
  const result = await api('/api/remote/health', { config: collectConfig(), live: true }, true);
  updateRemoteStatus(result);
  saveRemoteSettings();
  appendLog('SSH 连通测试：', result);
}

function updateRemoteStatus(result) {
  const ok = Boolean(result.ok);
  $('remoteHealth').textContent = ok ? '● 远程主机已确认' : '● 远程主机未通过';
  $('remoteHealth').className = `pill ${ok ? 'green' : 'orange'}`;
  const messages = (result.gaps || []).concat(result.message ? [result.message] : []);
  if (messages.length) $('gaps').innerHTML = messages.map((message) => `<li>${escapeHtml(String(message))}</li>`).join('');
}

async function checkExport() {
  const result = await api('/api/export/check', { items, config: collectConfig() });
  currentGaps = result.gaps || [];
  updateGapSummary(currentGaps);
  markGapRows(currentGaps);
  $('gaps').innerHTML = currentGaps.map((gap) => `<li>${escapeHtml(gap.message || gap.code)}</li>`).join('');
}

async function downloadScript() {
  const response = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, config: collectConfig() }) });
  if (!response.ok) {
    const error = await response.json();
    $('gaps').innerHTML = error.gaps.map((gap) => `<li>${escapeHtml(gap.message || gap.code)}</li>`).join('');
    appendLog('导出被拒绝，请先修复缺口。');
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'command-workbench-case.sh';
  link.click();
  URL.revokeObjectURL(url);
  appendLog('已下载 single 脚本。');
}

/**
 * Collects remote execution settings from the settings modal. Password stays in
 * memory in this page only; saveRemoteSettings intentionally omits it.
 */
function collectConfig() {
  return {
    remote: {
      host: $('remoteHost').value,
      username: $('remoteUser').value,
      password: $('remotePassword').value,
      rootMode: $('rootMode').checked,
      rootWarningAcknowledged: $('rootAck').checked
    }
  };
}

async function api(url, body, tolerateError = false) {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok && !tolerateError) {
    const error = new Error(json.error || JSON.stringify(json));
    error.status = response.status;
    error.payload = json;
    throw error;
  }
  return json;
}

/**
 * Emits a small heartbeat while a long LLM/CLI request is in flight. The
 * request itself still owns timeout/cancellation; this only prevents the page
 * from looking silent when a model spends tens of seconds generating output.
 */
async function withWaitingLog(label, task) {
  stopWaitingLog();
  const startedAt = Date.now();
  await refreshRecentInteractions(activeTraceId, false);
  waitLogTimers.push(setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    appendLog(`${label}，已等待 ${elapsedSeconds}s...`);
  }, 10000));
  waitLogTimers.push(setInterval(() => {
    refreshRecentInteractions(activeTraceId, false);
  }, 1000));
  try {
    return await task();
  } finally {
    stopWaitingLog();
    await refreshRecentInteractions(activeTraceId, false);
  }
}

function stopWaitingLog() {
  for (const timer of waitLogTimers) clearInterval(timer);
  waitLogTimers = [];
}

function renderWorklog(lines = undefined) {
  if (Array.isArray(lines)) worklogLines = lines;
  const workItems = worklogLines.map((line) => `<li class="worklog-line">${escapeHtml(line)}</li>`);
  const interactionItems = interactionLogs.map((entry) => `
    <li class="interaction-log">
      <div><strong>${escapeHtml(entry.task)}</strong> · ${escapeHtml(providerLabel(entry.provider))} · ${escapeHtml(entry.status || 'pending')} · ${Number(entry.durationMs || 0)}ms</div>
      ${renderConversation(entry)}
      <details>
        <summary>完整 trace JSON</summary>
        <pre>${escapeHtml(JSON.stringify(entry, null, 2))}</pre>
      </details>
    </li>`);
  $('worklog').innerHTML = workItems.concat(interactionItems).join('');
}

function renderConversation(entry) {
  const conversation = Array.isArray(entry.conversation) ? entry.conversation : fallbackConversation(entry);
  if (!conversation.length) return '';
  return `
    <div class="conversation">
      ${conversation.map((message) => `
        <details class="conversation-turn" ${message.role === 'assistant' || message.role === 'stdout' ? '' : 'open'}>
          <summary>${escapeHtml(conversationLabel(entry, message.role))}</summary>
          <pre>${escapeHtml(message.content || '')}</pre>
        </details>`).join('')}
    </div>`;
}

function fallbackConversation(entry) {
  const turns = [];
  if (Array.isArray(entry.httpRequest?.messages)) {
    turns.push(...entry.httpRequest.messages.map((message) => ({ role: message.role, content: message.content })));
  } else if (entry.prompt) {
    turns.push({ role: 'stdin', content: entry.prompt });
  } else if (entry.stdin) {
    turns.push({ role: 'stdin', content: entry.stdin });
  }
  if (entry.modelOutput) turns.push({ role: 'assistant', content: entry.modelOutput });
  if (entry.stdout) turns.push({ role: 'stdout', content: entry.stdout });
  if (entry.stderr) turns.push({ role: 'stderr', content: entry.stderr });
  if (entry.httpResponseText && !entry.modelOutput) turns.push({ role: 'http-response', content: entry.httpResponseText });
  return turns;
}

function conversationLabel(entry, role) {
  const provider = entry.provider || '';
  const labels = {
    system: 'LLM API system message',
    user: 'LLM API user message',
    assistant: 'LLM API assistant response',
    stdin: provider.startsWith('local-') ? 'CLI stdin prompt' : 'Adapter stdin JSON',
    stdout: provider.startsWith('local-') ? 'CLI stdout' : 'Adapter stdout',
    stderr: provider.startsWith('local-') ? 'CLI stderr' : 'Adapter stderr',
    'http-response': 'HTTP response body'
  };
  return labels[role] || role;
}

function addInteractions(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  let changed = 0;
  let created = 0;
  for (const rawEntry of entries) {
    const entry = redactSecrets(rawEntry);
    const index = entry.id ? interactionLogs.findIndex((item) => item.id === entry.id) : -1;
    if (index >= 0) {
      const merged = { ...interactionLogs[index], ...entry };
      if (JSON.stringify(merged) !== JSON.stringify(interactionLogs[index])) {
        interactionLogs[index] = merged;
        changed += 1;
      }
    } else {
      interactionLogs.push(entry);
      created += 1;
      changed += 1;
    }
  }
  if (!changed) return 0;
  renderWorklog();
  if (created) appendLog(`已实时记录模型/CLI 交互 ${created} 条。`);
  return changed;
}

async function refreshRecentInteractions(traceId = activeTraceId, logEmpty = true) {
  try {
    const suffix = traceId ? `?traceId=${encodeURIComponent(traceId)}` : '';
    const result = await api(`/api/interactions/recent${suffix}`, undefined, true);
    const count = addInteractions(result.interactions || []);
    if (!count && logEmpty) appendLog('未从服务端最近记录中找到新的模型/CLI 交互。');
    return count;
  } catch (error) {
    appendLog(`读取服务端模型/CLI 最近记录失败：${error.message || error}`);
    return 0;
  }
}

function createTraceId() {
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateGapSummary(gaps = []) {
  const itemGaps = gaps.filter((gap) => Number.isInteger(gap.index));
  $('gapCount').textContent = `缺口 ${gaps.length}`;
  $('nextGapBtn').disabled = itemGaps.length === 0;
}

function markGapRows(gaps = []) {
  document.querySelectorAll('.row-card.has-gap').forEach((node) => node.classList.remove('has-gap'));
  for (const gap of gaps) {
    if (Number.isInteger(gap.index)) document.getElementById(`item-${gap.index}`)?.classList.add('has-gap');
  }
}

function jumpToNextGap() {
  const itemGaps = currentGaps.filter((gap) => Number.isInteger(gap.index));
  if (!itemGaps.length) return;
  gapCursor = (gapCursor + 1) % itemGaps.length;
  const index = itemGaps[gapCursor].index;
  const row = document.getElementById(`item-${index}`);
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row?.classList.add('gap-focus');
  setTimeout(() => row?.classList.remove('gap-focus'), 1200);
}

function appendLog(text, value = undefined) {
  const suffix = value === undefined ? formatLogValue(text) : `${text}${formatLogValue(value)}`;
  $('console').textContent = `${new Date().toLocaleTimeString()} ${suffix}\n\n${$('console').textContent}`;
}

function loadRemoteSettings() {
  const saved = JSON.parse(localStorage.getItem('workbenchRemoteConfig') || '{}');
  $('remoteHost').value = saved.host || '';
  $('remoteUser').value = saved.username || '';
  $('rootMode').checked = Boolean(saved.rootMode);
  $('rootAck').checked = Boolean(saved.rootWarningAcknowledged);
}

function saveRemoteSettings() {
  const remote = collectConfig().remote;
  localStorage.setItem('workbenchRemoteConfig', JSON.stringify({
    host: remote.host,
    username: remote.username,
    rootMode: remote.rootMode,
    rootWarningAcknowledged: remote.rootWarningAcknowledged
  }));
}

function clearRemoteFields() {
  $('remoteHost').value = '';
  $('remoteUser').value = '';
  $('remotePassword').value = '';
  $('rootMode').checked = false;
  $('rootAck').checked = false;
}

function formatLogValue(value) {
  if (typeof value === 'string') return redactSecretText(value);
  return JSON.stringify(redactSecrets(value), null, 2);
}

function redactSecrets(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = /password|apiKey|authorization|token|secret/i.test(key) ? '[REDACTED]' : redactSecrets(entry, seen);
  }
  seen.delete(value);
  return output;
}

function redactSecretText(text) {
  return String(text).replace(/("?(?:password|apiKey|authorization|token|secret)"?\s*[:=]\s*)"?[^",}\s]+"?/gi, '$1[REDACTED]');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function providerLabel(provider) {
  return {
    'local-claude': '本地 Claude',
    'local-codex': '本地 Codex',
    'llm-api': 'LLM API',
    'custom-cli': '自定义 CLI',
    'custom-http': '自定义 HTTP'
  }[provider] || provider;
}
