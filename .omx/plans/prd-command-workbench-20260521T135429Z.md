# PRD — Command Workbench E2E Local Tool

## 0. Metadata

- Status: consensus revised draft
- Requirements source: `.omx/specs/deep-interview-command-workbench-restart-context.md`
- Context type: greenfield; proposed implementation paths below do not exist yet unless later created.
- Planning mode: `$plan --consensus --direct`
- Reviewer disposition incorporated: Architect REVISE→approve Option A after stronger safety boundaries; Critic REVISE until state matrices, strict export gates, runner contract, remote safety, and tests are explicit.

## 1. Source-of-Truth Facts

- Product intent: local tool/plugin turning test-case text into a reviewable, debuggable, executable, saveable single test-case script while preserving human control (`.omx/specs/deep-interview-command-workbench-restart-context.md:26-28`).
- First pass is E2E: local UI/server, LLM/CLI extraction/inference, remote basics, execute-to-here, skill persistence/reuse, and script export (`.omx/specs/deep-interview-command-workbench-restart-context.md:32-43`, `:47-59`).
- Inferred no-command commands are editable reference/to-confirm drafts (`.omx/specs/deep-interview-command-workbench-restart-context.md:38`, `:54`, `:91-92`, `:114-115`).
- Execution requires manual click, executes from first command/precondition through selected item, and never executes later commands (`.omx/specs/deep-interview-command-workbench-restart-context.md:39`, `:57`, `:93-95`, `:116-117`).
- Skill persistence requires explicit user confirmation; skill reuse should auto-populate editable command drafts without reuse confirmation (`.omx/specs/deep-interview-command-workbench-restart-context.md:41-42`, `:55-56`, `:97-99`, `:119-121`).
- Final script export is user-initiated and preserves fixed Chinese PASS/NO PASS outputs and exit-code semantics (`.omx/specs/deep-interview-command-workbench-restart-context.md:59-65`, `:122-123`).
- Out of scope: multi-user, permission management, database, concurrent scheduling, complex device orchestration, unconfirmed skill persistence, production security audit, free document-driven command generation, keyword/whitelist command recall (`.omx/specs/deep-interview-command-workbench-restart-context.md:67-77`, `:124`).

## 2. Requirements Summary

Build a local Command Workbench that supports this first-pass workflow:

1. User pastes raw Chinese/English test-case text.
2. LLM/API or local CLI extracts ordered preconditions, test steps, expected results, command drafts, and validation drafts.
3. Original commands preserve source order when present.
4. No-command natural-language steps may receive editable reference/to-confirm inferred command drafts.
5. Existing persisted skills may directly populate editable command drafts for similar natural-language intents without reuse confirmation.
6. User can edit command and validation drafts.
7. User manually clicks “执行到此”; runner executes exactly immutable snapshot items `0..N`, never later items.
8. User can explicitly confirm saving an intent-command mapping as a skill/asset.
9. User can download a final standalone single script only when strict export readiness gates pass.

## 3. RALPLAN-DR Summary

### 3.1 Principles

1. **Draft-first, human-controlled execution** — generated/provided commands are editable drafts; actual execution requires manual click.
2. **Source text priority** — original commands, order, and expected results outrank model/document/skill suggestions.
3. **Inference is allowed but gated** — no-command inference is core, but inferred commands require explicit keep/confirm before execution/export.
4. **Skill reuse is low-friction** — existing skill mappings may auto-fill drafts without reuse confirmation; new skill persistence always requires confirmation.
5. **Session safety is architectural** — execute-to-here is an isolated job contract over an immutable ordered snapshot.
6. **Local-first simplicity** — local files and modular boundaries; no DB, multi-user, scheduler, or production security scope.

### 3.2 Decision Drivers

1. Preserve anti-fabrication/human-control while supporting no-command inference.
2. Prove the complete E2E loop in the first pass.
3. Keep implementation local, testable, and ready for a later execution-worker split if needed.

### 3.3 Viable Options

#### Option A — Local modular monolith with worker-ready execution boundary (chosen)

One local app owns API, UI, LLM/CLI adapters, file-backed skill store, script export, and an in-process executor behind a strict job contract that can later move to a worker.

- Pros: fastest E2E proof; matches no-DB/no-scheduler constraints; files are inspectable; UX/domain iterations stay close.
- Cons: requires disciplined boundaries; execution isolation is enforced by contract/tests rather than process boundary.

#### Option B — Split server + execution worker from day one

UI/API server delegates execution/LLM jobs to a local worker via IPC or queue.

- Steelman: remote execution, root-login fields, cancellation/timeouts, and no-future-command guarantees are safety-critical; a worker boundary reduces blast radius, contains crashes, isolates long-running sessions, and can make snapshots immutable by design.
- Why not first: queue/IPC and worker lifecycle complexity risk pulling the project toward scheduler/database work that is explicitly out of scope.

#### Option C — CLI-first generator with thin UI

Build extraction/execution/export as CLI flows first; UI wraps CLI.

- Pros: easiest CI and deterministic fixtures.
- Why not first: under-serves requested UI review/edit/confirmation workbench and makes skill-save confirmation awkward.

### 3.4 Decision

Choose **Option A** with a **worker-ready execution boundary**. `executor/session` must accept immutable job snapshots and expose cancellation, timeout, and redaction semantics so Option B remains a future refactor, not a redesign.

## 4. Architecture

### 4.1 Proposed modules and paths

- `src/domain/types.ts` — test case, step, command draft, validation draft, skill, execution job, export result types.
- `src/domain/state.ts` — command/validation/skill/export state machines and transition guards.
- `src/server/index.ts` — local server bootstrap.
- `src/server/routes/parse.ts` — text intake and extraction.
- `src/server/routes/execute.ts` — execute-to-here endpoint; only creates immutable jobs.
- `src/server/routes/skills.ts` — skill reuse/persist APIs.
- `src/server/routes/export.ts` — final script readiness check and download.
- `src/llm/adapter.ts` — provider-neutral CLI/API contract with health check.
- `src/llm/mock.ts` — deterministic development/test provider.
- `src/planner/extract.ts` — ordered precondition/step/expected-result extraction normalization.
- `src/planner/infer-command.ts` — no-command command and validation draft inference.
- `src/skills/store.ts` — local file-backed atomic skill store.
- `src/skills/match.ts` — intent-to-command reuse lookup.
- `src/executor/job.ts` — immutable execution job schema.
- `src/executor/session.ts` — only execute-to-here orchestration path.
- `src/executor/local.ts` — local shell runner.
- `src/executor/remote.ts` — basic SSH/host/device runner.
- `src/executor/redact.ts` — secret redaction before display/persist/export.
- `src/script/generator.ts` — standalone single-script template.
- `src/persistence/files.ts` — local paths, atomic writes, and no-secret defaults.
- `src/ui/*` — workbench UI matching accepted image concept.
- `tests/unit/*`, `tests/integration/*`, `tests/e2e/*` — verification suites.
- `docs/architecture.md` — decisions, invariants, and known limits.

### 4.2 Command state matrix

| Dimension | Values | Execution rule | Export rule | Skill rule |
|---|---|---|---|---|
| Provenance | `original`, `inferred`, `skill_reuse`, `user_edited` | `original` and `skill_reuse` may be executable if nonblank and included; `inferred` is blocked until explicitly kept/confirmed; `user_edited` inherits prior provenance but records manual edit. | `inferred` must be confirmed; all included commands must be nonblank and validation-ready. | Any useful confirmed/edited mapping may be suggested for persistence, but write requires explicit confirmation. |
| Edit state | `clean`, `dirty` | Dirty is allowed; executed job snapshot captures current value. | Dirty is allowed if readiness gates pass; script uses current edited value. | Persisted mapping saves the user-confirmed current value. |
| Execution readiness | `blocked`, `ready`, `running`, `passed`, `failed` | `blocked` cannot run; execute endpoint returns visible blocker. | Runtime failed is not itself an export blocker unless readiness/validation is missing. | Runtime success never auto-persists. |
| Export readiness | `preview_only`, `exportable`, `refused` | Not applicable. | Final standalone download requires `exportable`; `refused` returns exact gap list. | Not applicable. |
| Persistence state | `not_suggested`, `suggested`, `pending_confirmation`, `persisted` | Not a prerequisite for execution. | Not a prerequisite for export. | Only `pending_confirmation -> persisted` writes a new skill. |

Clarification: **`skill_reuse` does not require confirmation merely to reuse**. It auto-populates an editable draft. Manual execute click is still required for any execution, and final export remains user-initiated.

### 4.3 Validation draft state matrix

| Dimension | Values | Execution/export effect |
|---|---|---|
| Provenance | `original_expected`, `inferred_validation`, `skill_reuse`, `user_edited`, `blank` | Validation may come from expected result text, model inference, skill reuse, or user edits. |
| Readiness | `optional_empty`, `required_ready`, `required_missing`, `malformed` | If a step has a required expected result, `required_missing` or `malformed` blocks final export and may block execute-to-here validation. |
| Runtime result | `not_run`, `pass`, `no_pass`, `error` | Used for console/logs and final script fail-fast semantics. |

Validation scripts/checks are first-class editable drafts. Where expected results exist or final PASS/NO PASS semantics depend on a check, missing/malformed validation blocks final standalone export.

### 4.4 Runner invariant: isolated execution job contract

`src/executor/session.ts` is the only code path that runs commands. It receives immutable ordered snapshot, selected index `N`, session config, current command/validation draft values, timeout/cancellation policy, and redaction rules.

Required invariant:

1. Validate `N` is in range.
2. Refuse jobs with blank commands or unconfirmed inferred commands in `0..N`.
3. Execute exactly items `0..N` in order.
4. Never evaluate, prefetch, expand, or execute commands after `N`.
5. Preserve session context across `0..N`.
6. Apply timeout/cancellation safely; cancelled jobs stop before starting the next item.
7. Redact secrets before display, persistence, or script/log export.
8. Persist redacted job record with snapshot metadata, status, and blockers.

### 4.5 Strict export readiness

Draft/preview may show gaps; final standalone download must refuse unsafe gaps and return a gap report when any of these exist: blank included command, unconfirmed inferred command, required validation missing/malformed, unresolved remote target config, unsupported host/device transition, script template cannot preserve PASS/NO PASS/fail-fast semantics, or command marked rejected/blocked.

### 4.6 Remote safety minimums

- Password/key fields are not persisted by default.
- Logs redact password, key material, tokens, and configured secret values before display/persist/export.
- Root login requires explicit root-mode selection and visible warning in UI/worklog.
- Remote health check runs before remote execute-to-here.
- Host/device context is labeled per command and represented in execution snapshot.
- Host-key behavior is explicit: known-hosts policy or documented dev-mode bypass; never silent.
- Export either preserves simple host/device switching or refuses unsupported transitions with a gap report.

## 5. UI Product Requirements

- Header: app title, LLM/CLI health, remote status, “下载 single 脚本”.
- Left: raw test-case text.
- Center: ordered precondition/test-step cards with source description, editable command draft, editable validation script/check, and “执行到此”.
- Right: console output and model/CLI worklog.
- Skill confirmation modal/card: “保存为 skill?” with natural-language intent → current command draft and explicit confirm/cancel.
- Final fixed script lines are not editable UI fields; they belong to generated output.

## 6. Implementation Plan

1. **Foundation/domain invariants:** app skeleton, `types.ts`, `state.ts`, fixtures.
2. **LLM/CLI adapter and parser/planner:** health check, mock adapter, extraction normalization, inference, schema validation.
3. **Skill store and reuse:** atomic local store, match/reuse drafts, confirmation-only writes.
4. **UI workbench:** three-zone layout, editable drafts, parse/infer/reuse, skill-save modal, execute buttons, export refusal/download.
5. **Execution and remote basics:** immutable job contract, local/SSH runners, `0..N` enforcement, timeout/cancel, redaction, run history.
6. **Script generator/export:** fixed Chinese outputs, fail-fast semantics, strict readiness before download.
7. **Hardening/docs:** unit/integration/e2e/observability tests, architecture/user/setup docs, known limitations.

## 7. Acceptance Criteria

1. Explicit-command input becomes ordered editable precondition/step command drafts preserving source order.
2. No-command natural-language input can produce editable reference/to-confirm inferred command draft.
3. Inferred command drafts are blocked from execution/export until explicitly kept/confirmed.
4. Persisted skill reuse directly fills editable command drafts without reuse confirmation.
5. Skill persistence never writes until user confirms “保存为 skill”.
6. Clicking “执行到此” for index `N` creates immutable job snapshot and executes exactly `0..N`.
7. Future command `N+1` is never executed, prefetched for execution, or included in the job.
8. Execution preserves session context across commands in `0..N`.
9. Timeout/cancel stops safely before starting next command.
10. Console/worklog and persisted logs redact configured secrets.
11. Remote config supports IP, username, password/key, port, root mode, host/device command labels, and simple context switching.
12. Root login requires explicit root-mode selection/warning.
13. LLM/API/CLI health check is visible before parse/inference.
14. Validation drafts are editable and have readiness states.
15. Final standalone export refuses blank commands, unconfirmed inferred commands, missing/malformed required validation, unresolved remote config, unsupported host/device transitions, and blocked/rejected commands.
16. Exported script emits `预制条件检查完成: PASS/NO PASS`, `用例执行完成: PASS/NO PASS`, `错误样本`, `期望样本`, final `PASS/NO PASS`, exit `0` for pass and nonzero preferably `1` for no pass.
17. Implementation avoids database, multi-user/permission system, concurrent scheduler, complex device orchestration, automatic unconfirmed skill persistence, and production-grade security audit.

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Inference appears authoritative | Provenance/readiness states, editable draft UI, confirm-before-execution/export. |
| Skill reuse suggests wrong command | Keep editable draft; manual execution and strict export gates remain. |
| Execute-to-here runs future commands | Centralize immutable job slicing; unit/e2e sentinel tests. |
| Validation gaps undermine PASS/NO PASS | Validation readiness matrix and strict export refusal. |
| Remote secrets leak | No default secret persistence; redaction; root warning. |
| Monolith becomes unsafe | Worker-ready runner contract and module boundaries. |
| Model output malformed | Schema validation and mock provider tests. |

## 9. Pre-mortem

1. Inferred command executes without confirmation — prevent by state-machine guard and endpoint test.
2. Step N execution triggers N+1 — prevent with immutable snapshot slicing and sentinel e2e test.
3. Exported script reports PASS despite missing validation — prevent with validation readiness gates and export refusal tests.

## 10. Expanded Test Plan Summary

- Unit: domain state, validation state, export readiness, runner slicing, script generator, redaction.
- Integration: extraction, inference blocking, skill persist/reuse, context preservation, sentinel, timeout/cancel, remote health/root, export refusal/success.
- E2E: explicit-command happy path, no-command inference/skill reuse, future-command safety, export refusal, remote redaction.
- Observability: health states, worklog, console history, gap reports, known limitations.

## 11. ADR

### Decision

Implement Command Workbench as a local modular monolith with file-backed persistence, first-class state machines for command/validation/skill/export readiness, and a worker-ready isolated execute-to-here job contract.

### Drivers

Human-controlled execution/persistence; E2E proof; avoid DB/multi-user/scheduler scope; keep future worker split possible.

### Alternatives considered

- Split execution worker from day one — strong safety isolation; rejected for first pass due queue/IPC lifecycle complexity and out-of-scope scheduling pressure.
- CLI-first generator — easier tests; rejected because UI review/edit/confirmation is product core.

### Why chosen

Fastest path to a real local workbench while making safety-critical execution boundary explicit and testable.

### Consequences

Domain state machines and tests are mandatory; export refusal may feel strict but protects final script semantics; remote support remains basic with safety minimums.

### Follow-ups

Revisit worker split after E2E stabilizes or concurrency/long-running remote jobs become real; revisit evidence/source display only if users need more trust in reused skill drafts.

## 12. Available-Agent-Types Roster

`architect`, `executor`, `test-engineer`, `designer`, `verifier`, `code-reviewer`, `debugger`, `writer`, `dependency-expert`, `researcher`, `explore`.

## 13. Follow-up Staffing Guidance

### `$ralph`

Primary `executor`; support with `test-engineer`, `designer`, `verifier`, `code-reviewer`. Use high reasoning for domain/execution/export/tests; medium-high for UI.

### `$team`

Parallel lanes: domain+LLM/parser, skill store/reuse, execution+remote, script export, UI, test/e2e, final verifier.

Launch hints from attached OMX runtime:

```text
$team .omx/plans/prd-command-workbench-<timestamp>.md
```

or shell:

```bash
omx team --plan .omx/plans/prd-command-workbench-<timestamp>.md
```

Team verification path: each lane proves its acceptance criteria; after team shutdown, Ralph/verifier runs the test spec and verifies sentinel/no-unconfirmed-skill/export-refusal evidence.

## 14. Goal-Mode Follow-up Suggestions

- `$ultragoal` — default for durable goal tracking across implementation phases.
- `$performance-goal` — later for LLM latency, parse throughput, or remote execution optimization.
- `$autoresearch-goal` — only for separate research on retrieval/matching/LLM provider strategy.

## 15. Consensus Changelog

- Added explicit command state matrix.
- Added validation draft state matrix.
- Changed final export to strict refusal for unsafe gaps.
- Added isolated runner job contract with immutable snapshot, `0..N`, no `N+1`, timeout/cancel, and redaction.
- Added remote safety minimums without expanding to production security scope.
- Expanded pre-mortem, test plan, acceptance criteria, and staffing guidance.
