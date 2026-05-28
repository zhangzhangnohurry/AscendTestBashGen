import { formatKnowledgeForPrompt } from '../knowledge/retrieve.js';

/**
 * Central prompt registry for every LLM-facing task in the workbench.
 *
 * Keeping prompts here has two important product effects:
 * 1. UI/server/adapter code can stay about transport and state, not prompt wording.
 * 2. Future prompt reviews can inspect one file and see the exact contract sent to
 *    local CLI models and HTTP model APIs.
 */
export function promptForTask(payload = {}) {
  if (payload.task === 'health') return healthPrompt();
  if (payload.task === 'selectKnowledge') return selectKnowledgePrompt(payload);
  if (payload.task === 'extractTestCase') return extractTestCasePrompt(payload);
  if (payload.task === 'matchSkill') return matchSkillPrompt(payload);
  if (payload.task === 'inferCommand') return inferCommandPrompt(payload);
  if (payload.task === 'inferValidation') return inferValidationPrompt(payload);
  return fallbackPrompt(payload);
}

/**
 * HTTP model APIs receive an explicit system message in addition to the task prompt.
 * Local CLIs usually accept one plain prompt, so the adapter only uses this for HTTP.
 */
export function systemPromptForTask(_payload = {}) {
  // 中文：你是一个测试用例抽取引擎。只返回 JSON。不要返回 Markdown。
  return 'You are a test-case extraction engine. Return JSON only. No markdown.';
}

function healthPrompt() {
  // 中文：只返回这个 JSON 对象，不要返回任何其他内容：{"ok":true,"message":"ready"}
  return 'Return exactly this JSON object and nothing else: {"ok":true,"message":"ready"}';
}

function selectKnowledgePrompt(payload) {
  // 中文：为当前任务选择相关知识条目的 id。只能从候选 id 中选择。不要只靠关键字匹配；要根据源文本含义、当前步骤、标题和摘要来判断。如果不确定，返回空列表。只返回 JSON，格式为 {"ok":true,"ids":["..."]}。
  // 中文：Limit = 最多选择的知识条目数量。
  // 中文：Source text = 当前待处理的原文。
  // 中文：Current item = 当前步骤对象；没有则为 none。
  // 中文：Candidate summaries = 候选知识摘要列表。
  return `Select relevant knowledge item ids for the current task. Select only from the candidate ids. Do not select by keyword matching alone; reason from the source meaning, current item, title, and summary. If uncertain, return an empty list. Return JSON only with shape {"ok":true,"ids":["..."]}.

Limit: ${payload.limit || 6}

Source text:
${payload.text || payload.item?.sourceText || payload.item?.intent || ''}

Current item:
${payload.item ? JSON.stringify(payload.item, null, 2) : '(none)'}

Candidate summaries:
${JSON.stringify((payload.candidates || []).map((item) => ({ id: item.id, title: item.title, summary: item.summary, strength: item.strength })), null, 2)}`;
}

function extractTestCasePrompt(payload) {
  // 中文：把原始测试用例校准成有序的待审查步骤。这只是可选的结构校准。
  // 中文：规则：
  // 中文：- 保持原始顺序和原文措辞。
  // 中文：- 每个条目的 type 都必须是 "step"，不要输出任何非 step 类型。
  // 中文：- 优先使用已提供的本地章节拆分；只有在明显拆错边界时才调整。
  // 中文：- 不要丢弃原文中的人工操作、条件分支、登录、上下电、切换用户等动作；即使暂时不能生成命令，也要作为独立步骤展示给用户审查。
  // 中文：- 只有当源文本明确包含可执行命令时才复制 command；否则 command 必须为空，commandEvidence 必须是 "none"。
  // 中文：- 不要推断命令。
  // 中文：- expected 只能从本地章节拆分中复制，即 E1/E1.1 文本绑定到对应 S1/S1.1 行；如果本地拆分 expected 为空，expected 必须为空。不要编造预期结果。
  // 中文：- 本阶段不要生成 validation 脚本；validation 必须为空，validationEvidence 必须是 "none"。
  // 中文：- target 必须是 "local"、"host" 或 "device"；只有源文本明确说 host/物理机时用 "host"，明确说 device 侧时用 "device"，否则用 "local"。
  // 中文：只返回 JSON。
  // 中文：Local section split = 本地章节拆分结果。
  // 中文：Raw test case = 原始测试用例全文。
  return `Calibrate the raw test case into ordered review steps. This is optional structure calibration only.

Rules:
- Preserve the source order and original wording.
- Every item type must be "step". Do not output any non-step item types.
- Prefer the provided local section split; only adjust boundaries if the split is visibly wrong.
- Do not drop manual actions, conditional branches, login, power-cycle, user-switch, or similar source actions; keep them as separate step items even when they cannot generate a command yet.
- Copy command only when the source text explicitly contains an executable command. Otherwise command must be empty and commandEvidence must be "none".
- Do not infer commands.
- expected must be copied only from the provided local section split, where E1/E1.1 text is attached to matching S1/S1.1 rows. If the local split expected is empty, expected must be empty. Do not invent expected results.
- Do not generate validation scripts in this stage; validation must be empty and validationEvidence must be "none".
- target must be "local", "host", or "device"; use "host" only when the source clearly says host/physical machine, use "device" only when it clearly says device side, otherwise use "local".

Return JSON only:
{"ok":true,"items":[{"type":"step","label":"S1 or S1.1","depth":1,"orderPath":[1],"sourceText":"original text slice","intent":"short meaning","command":"explicit command or empty","commandEvidence":"explicit|none","expected":"copy from matching local split expected or empty","validation":"","validationEvidence":"none","target":"local|host|device"}]}

Local section split:
${JSON.stringify((payload.context?.structureItems || []).map((item) => ({ label: item.label, depth: item.depth, sourceText: item.sourceText, expected: item.expected || '' })), null, 2)}

Raw test case:
${payload.text || ''}`;
}

function matchSkillPrompt(payload) {
  // 中文：判断当前条目是否应该复用已有 skill。只能返回已有 skillId，绝不能编造命令。如果不确定，返回 no_match。只返回 JSON：{"ok":true,"action":"reuse","skillId":"..."} 或 {"ok":true,"action":"no_match"}。
  // 中文：Current item = 当前步骤对象。
  // 中文：Existing skills metadata = 已有 skill 的元数据。
  return `Choose whether the current item should reuse one existing skill. You may only return an existing skillId, never invent commands. If uncertain return no_match. Return JSON only: {"ok":true,"action":"reuse","skillId":"..."} or {"ok":true,"action":"no_match"}.

Current item:
${JSON.stringify(payload.item, null, 2)}

Existing skills metadata:
${JSON.stringify(payload.skills || [], null, 2)}`;
}

function inferCommandPrompt(payload) {
  const knowledge = knowledgePromptSection(payload);
  // 中文：只有当 intent/source text 足够明确时，才起草一条可执行命令；否则返回空命令。相关时应用已选知识条目，但不要在没有源文本支持时编造环境专用命令。当已选知识明确要求使用执行上下文时，可以使用 remote.host、remote.username 等 execution context 值。只返回 JSON：{"ok":true,"command":"..."}。
  // 中文：Intent = 当前步骤意图。
  // 中文：Context = 当前步骤上下文，包含 sourceText、expected、item、execution 等。
  return `Draft one executable command only if the intent/source text is precise enough. Otherwise return an empty command. Apply selected knowledge items when relevant, but do not invent environment-specific commands without source support. Use execution context values, such as remote.host and remote.username, when selected knowledge explicitly requires them. Return JSON only: {"ok":true,"command":"..."}.
${knowledge}

Intent:
${payload.intent || ''}

Context:
${safeContextJson(payload.context)}`;
}

function inferValidationPrompt(payload) {
  const knowledge = knowledgePromptSection(payload);
  // 中文：起草一段可执行的 bash 校验片段，用于检查 $COMMAND_OUTPUT 或 $COMMAND_STATUS，且不要重新执行主命令。不要返回自然语言。如果预期结果无法用 shell 检查，则返回空 validation。相关时应用已选知识条目。只返回 JSON：{"ok":true,"validation":"..."}。
  // 中文：Expected result = 预期结果原文。
  // 中文：Context = 当前步骤上下文，包含 sourceText、intent、item、knowledge 等。
  return `Draft an executable bash validation snippet that checks $COMMAND_OUTPUT or $COMMAND_STATUS and does not rerun the primary command. Do not return natural language. If the expected result cannot be checked as shell, return an empty validation. Apply selected knowledge items when relevant. Return JSON only: {"ok":true,"validation":"..."}.
${knowledge}

Expected result:
${payload.expected || ''}

Context:
${safeContextJson(payload.context)}`;
}

function fallbackPrompt(payload) {
  // 中文：针对任务 ${payload.task} 只返回 JSON：${JSON.stringify(payload)}
  return `Return JSON only for task ${payload.task}: ${JSON.stringify(payload)}`;
}

/**
 * Knowledge is selected in a cheap first pass from summaries; only the selected
 * Markdown bodies are then injected here, preserving the “index first, full text
 * only when chosen” design that avoids flooding every model call.
 */
function knowledgePromptSection(payload) {
  const knowledge = payload.context?.knowledge || payload.knowledge || [];
  const formatted = formatKnowledgeForPrompt(knowledge);
  // 中文：Selected knowledge items = 已选中的知识条目全文，会被注入正式提示词。
  return formatted ? `
Selected knowledge items:
${formatted}
` : '';
}

function safeContextJson(context = {}) {
  const { knowledge, ...rest } = context || {};
  return JSON.stringify(rest, null, 2);
}
