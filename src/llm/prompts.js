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
  return 'You are a test-case extraction engine. Return JSON only. No markdown.';
}

function healthPrompt() {
  return 'Return exactly this JSON object and nothing else: {"ok":true,"message":"ready"}';
}

function selectKnowledgePrompt(payload) {
  return `Select relevant knowledge item ids for the current task. Select only from the candidate ids. Do not select by keyword matching alone; reason from the source meaning, phase, device-shell context, title, and summary. If uncertain, return an empty list. Return JSON only with shape {"ok":true,"ids":["..."]}.

Phase: ${payload.phase || ''}
isDeviceShell: ${typeof payload.isDeviceShell === 'boolean' ? payload.isDeviceShell : 'unknown'}
Limit: ${payload.limit || 6}

Source text:
${payload.text || payload.item?.sourceText || payload.item?.intent || ''}

Current item:
${payload.item ? JSON.stringify(payload.item, null, 2) : '(none)'}

Candidate summaries:
${JSON.stringify((payload.candidates || []).map((item) => ({ id: item.id, title: item.title, summary: item.summary, phases: item.phases, isDeviceShell: item.isDeviceShell, strength: item.strength })), null, 2)}`;
}

function extractTestCasePrompt(payload) {
  const knowledge = knowledgePromptSection(payload);
  return `Extract this raw test case into ordered structured JSON. Do not invent commands. Only copy a command when the source text explicitly contains that executable command; otherwise leave command empty or mark it as inferred. Preserve every manual, conditional, or non-shell action as its own ordered item with an empty command rather than dropping it. If a sentence says a manual action must happen before a command, output the manual action first and the command second. Put setup/precondition text as type "precondition" and test steps as type "step" so the original document structure remains visible. target must be "local", "host", or "device". Validation must be executable shell that checks $COMMAND_OUTPUT or $COMMAND_STATUS and must not rerun the primary command; if you cannot write executable shell, leave validation empty. Apply selected knowledge items when relevant, but never override explicit source evidence. Return JSON only with shape {"ok":true,"items":[{"type":"precondition|step","sourceText":"...","intent":"...","command":"...","commandEvidence":"explicit|inferred|none","expected":"...","validation":"...","validationEvidence":"explicit|inferred|none","target":"host"}]}.
${knowledge}

Raw test case:
${payload.text || ''}`;
}

function matchSkillPrompt(payload) {
  return `Choose whether the current item should reuse one existing skill. You may only return an existing skillId, never invent commands. If uncertain return no_match. Return JSON only: {"ok":true,"action":"reuse","skillId":"..."} or {"ok":true,"action":"no_match"}.

Current item:
${JSON.stringify(payload.item, null, 2)}

Existing skills metadata:
${JSON.stringify(payload.skills || [], null, 2)}`;
}

function inferCommandPrompt(payload) {
  const knowledge = knowledgePromptSection(payload);
  return `Draft a command only if the intent is precise enough. Otherwise return an empty command. Apply selected knowledge items when relevant, but do not invent environment-specific commands without source support. Return JSON only: {"ok":true,"command":"..."}.
${knowledge}

Intent:
${payload.intent || ''}

Context:
${safeContextJson(payload.context)}`;
}

function inferValidationPrompt(payload) {
  const knowledge = knowledgePromptSection(payload);
  return `Draft an executable bash validation snippet that checks $COMMAND_OUTPUT or $COMMAND_STATUS and does not rerun the primary command. Do not return natural language. If the expected result cannot be checked as shell, return an empty validation. Apply selected knowledge items when relevant. Return JSON only: {"ok":true,"validation":"..."}.
${knowledge}

Expected result:
${payload.expected || ''}

Context:
${safeContextJson(payload.context)}`;
}

function fallbackPrompt(payload) {
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
  return formatted ? `
Selected knowledge items:
${formatted}
` : '';
}

function safeContextJson(context = {}) {
  const { knowledge, ...rest } = context || {};
  return JSON.stringify(rest, null, 2);
}
