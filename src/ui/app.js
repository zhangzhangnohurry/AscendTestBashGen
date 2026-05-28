// Browser-side controller for the single-page workbench.
// It owns only UI state and calls server APIs for parsing, generation,
// execution and export checks; it does not interpret test-case semantics locally.
let items = [];
let pendingSkillIndex = null;
let currentGaps = [];
let gapCursor = -1;
let interactionLogs = [];
let worklogLines = [];
const $ = (id) => document.getElementById(id);
const UI_PROVIDERS = new Set(['disabled', 'local-claude', 'local-codex', 'llm-api']);

$('parseBtn').addEventListener('click', parseText);
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
  $('adapterTimeout').value = String(saved.timeoutMs || 30000);
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
  const base = { provider, timeoutMs: Number($('adapterTimeout').value || 30000) };
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
 * parseText runs the two-stage model workflow: first decompose the source
 * document, then generate commands/validations one item at a time so progress
 * is visible and failed items do not hide earlier results.
 */
async function parseText() {
  $('parseBtn').disabled = true;
  items = [];
  currentGaps = [];
  gapCursor = -1;
  interactionLogs = [];
  worklogLines = [];
  renderCards();
  renderWorklog([]);
  updateGapSummary([]);
  resetPipeline();
  try {
    setPipelineStep('pipelineDecompose', 'running', '文档拆解中：提取预制条件和测试步骤原文...');
    appendLog('文档拆解中...');
    const decomposed = await api('/api/decompose', { text: $('rawText').value, adapterConfig: getAdapterConfig() });
    addInteractions(decomposed.interactionLog);
    items = decomposed.items || [];
    renderWorklog(decomposed.worklog || []);
    renderCards();
    setPipelineStep('pipelineDecompose', 'done', `完成：${countByType('precondition')} 个预制条件，${items.length - countByType('precondition')} 个测试步骤`);
    await checkExport();


    setPipelineStep('pipelineGenerate', 'running', `脚本生成中：0/${items.length}`);
    appendLog(`脚本生成中：逐项回填 ${items.length} 个草稿...`);
    for (let index = 0; index < items.length; index += 1) {
      setPipelineStep('pipelineGenerate', 'running', `脚本生成中：${index + 1}/${items.length}`);
      const result = await api('/api/generate-item', { item: items[index], adapterConfig: getAdapterConfig() });
      addInteractions(result.interactionLog);
      items[index] = result.item;
      renderCards();
      await checkExport();
    }
    setPipelineStep('pipelineGenerate', 'done', `完成：已回填 ${items.length} 个草稿`);
    appendLog('文档拆解和脚本生成完成。');
  } catch (error) {
    const active = $('pipelineDecompose').classList.contains('running') ? 'pipelineDecompose' : 'pipelineGenerate';
    setPipelineStep(active, 'error', error.message || String(error));
    appendLog(`生成失败：${error.message || error}`);
  } finally {
    $('parseBtn').disabled = false;
  }
}

function resetPipeline() {
  setPipelineStep('pipelineDecompose', 'idle', '等待开始');
  setPipelineStep('pipelineGenerate', 'idle', '等待开始');
}

function setPipelineStep(id, state, message) {
  const element = $(id);
  element.className = state;
  element.querySelector('span').textContent = message;
}

function countByType(type) {
  return items.filter((item) => item.type === type).length;
}

function renderCards() {
  const preconditions = items.filter((item) => item.type === 'precondition');
  const steps = items.filter((item) => item.type !== 'precondition');
  $('emptyState').classList.toggle('hidden', items.length > 0);
  renderGroup('preconditionsSection', 'preconditionCards', 'preCount', preconditions);
  renderGroup('stepsSection', 'stepCards', 'stepCount', steps);
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
  row.className = 'row-card';
  row.id = `item-${actualIndex}`;
  row.innerHTML = `
    <div class="row-index">${actualIndex}</div>
    <div class="row-source">${escapeHtml(item.sourceText || item.intent || '(empty)')}</div>
    <div class="editor-block">
      <label>命令草稿（可编辑）</label>
      <span class="badge ${escapeHtml(item.commandDraft.provenance)}">${escapeHtml(labelForProvenance(item.commandDraft, commandBlocked))}</span>
      <textarea data-kind="command" data-index="${actualIndex}">${escapeHtml(item.commandDraft.value)}</textarea>
    </div>
    <div class="editor-block">
      <label>验证脚本（检查 $COMMAND_OUTPUT）</label>
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
  if (event.target.dataset.kind === 'command') {
    item.commandDraft.value = event.target.value;
    item.commandDraft.provenance = 'user_edited';
    item.commandDraft.editState = 'dirty';
  } else {
    item.validationDraft.value = event.target.value;
    item.validationDraft.provenance = 'user_edited';
    item.validationDraft.confirmed = true;
  }
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
  if (!response.ok && !tolerateError) throw new Error(json.error || JSON.stringify(json));
  return json;
}

function renderWorklog(lines = undefined) {
  if (Array.isArray(lines)) worklogLines = lines;
  const workItems = worklogLines.map((line) => `<li class="worklog-line">${escapeHtml(line)}</li>`);
  const interactionItems = interactionLogs.map((entry) => `
    <li class="interaction-log">
      <div><strong>${escapeHtml(entry.task)}</strong> · ${escapeHtml(entry.provider)} · ${escapeHtml(entry.status || 'pending')} · ${Number(entry.durationMs || 0)}ms</div>
      <details>
        <summary>查看请求/响应</summary>
        <pre>${escapeHtml(JSON.stringify(entry, null, 2))}</pre>
      </details>
    </li>`);
  $('worklog').innerHTML = workItems.concat(interactionItems).join('');
}

function addInteractions(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return;
  interactionLogs.push(...entries.map(redactSecrets));
  renderWorklog();
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
