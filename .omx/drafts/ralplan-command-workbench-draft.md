# RALPLAN Draft — Command Workbench E2E Plan

## Source of Truth

- Requirements source: `.omx/specs/deep-interview-command-workbench-restart-context.md`.
- The spec defines this as a greenfield repo with only the context document and OMX runtime files discovered so far; treat implementation file paths below as proposed targets, not existing files (`.omx/specs/deep-interview-command-workbench-restart-context.md:139-144`).
- The product intent is a local tool/plugin that turns test-case text into a reviewable, debuggable, executable, saveable single test-case script while preserving human control over execution/export/skill creation (`.omx/specs/deep-interview-command-workbench-restart-context.md:26-28`).

## Requirements Summary

### Must deliver in first implementation pass

1. Local server + HTML UI for test-case intake, review, debug execution, and script export (`.omx/specs/deep-interview-command-workbench-restart-context.md:32-43`, `:47-59`).
2. Structured extraction of preconditions, test steps, expected results, command drafts, and validation-script drafts (`.omx/specs/deep-interview-command-workbench-restart-context.md:34-38`, `:49-53`).
3. No-command natural-language inference: when source text lacks a command, the system may draft a reference/to-confirm command, but it remains editable and cannot execute until user confirmation/kept-in-flow (`.omx/specs/deep-interview-command-workbench-restart-context.md:38`, `:54`, `:91-92`, `:114-115`).
4. Skill persistence and reuse: user-confirmed natural-language intent → command mappings can be persisted; future similar intent may auto-populate editable command drafts without showing confidence/source details or requiring confirmation to reuse (`.omx/specs/deep-interview-command-workbench-restart-context.md:41-42`, `:55-56`, `:97-99`, `:119-121`).
5. Manual execute-to-here: execution requires user click and replays from the first command/precondition through the selected item, preserving session context, and must never execute later commands (`.omx/specs/deep-interview-command-workbench-restart-context.md:39`, `:57`, `:93-95`, `:116-117`).
6. Basic remote host/device execution configuration: target IP, username, password/key, port, root login, host-side commands, device-side commands, and simple host/device context switching (`.omx/specs/deep-interview-command-workbench-restart-context.md:40`, `:58`, `:126`).
7. User-initiated download/export of a final standalone single script with fixed Chinese PASS/NO PASS outputs, error/expected sample comparison, final result line, and exit-code semantics (`.omx/specs/deep-interview-command-workbench-restart-context.md:43`, `:59-65`, `:122-123`).
8. LLM/API or local CLI adapter with connectivity/health check (`.omx/specs/deep-interview-command-workbench-restart-context.md:37`, `:53`, `:125`).

### Explicit non-goals

- Multi-user support, permission management, database, concurrent scheduling, complex device orchestration, automatic skill persistence without confirmation, production-grade security audit, document-driven free command generation, and keyword/whitelist command recall as the main flow are out of scope (`.omx/specs/deep-interview-command-workbench-restart-context.md:67-77`, `:124`).

## RALPLAN-DR Summary

### Principles

1. **Draft-first, human-controlled execution** — every command shown in the UI is editable draft material until the user manually executes/export/persists it (`.omx/specs/deep-interview-command-workbench-restart-context.md:89-99`).
2. **Source text remains primary** — original commands, step order, and expected results outrank model/document suggestions (`.omx/specs/deep-interview-command-workbench-restart-context.md:101-107`).
3. **Evidence assists; it does not invent** — docs and skills may explain, validate, or fill draft mappings, but must not become free command-generation sources (`.omx/specs/deep-interview-command-workbench-restart-context.md:103-106`).
4. **Session semantics are safety-critical** — execute-to-here must replay sequentially from the start and never skip context or run future steps (`.omx/specs/deep-interview-command-workbench-restart-context.md:107`, `:116-117`).
5. **Greenfield simplicity over infrastructure** — prefer local file-backed storage and a modular monolith because DB/multi-user/scheduling/security hardening are explicit non-goals (`.omx/specs/deep-interview-command-workbench-restart-context.md:67-77`, `:81-87`).

### Decision Drivers

1. **Safety/provenance boundary:** avoid fabricated execution while still supporting no-command inference.
2. **End-to-end demonstrability:** first pass must prove UI → LLM/CLI → edit/confirm → execute-to-here → skill persist/reuse → script export.
3. **Local-first maintainability:** the repo is greenfield, so planned modules must be separable without introducing a database or production platform scope.

### Viable Options

#### Option A — Local modular monolith with file-backed persistence (favored)

**Approach:** One local app owns API, UI, LLM/CLI adapters, skill store, execution runner, and script generator behind typed module boundaries; data persists as local files.

**Pros:**
- Matches no-database and local-first constraints.
- Keeps E2E loop easy to run in development.
- Allows later extraction into services if needed.
- Makes skill/script/log persistence inspectable and versionable.

**Cons:**
- Requires strong internal boundaries to avoid a tangled monolith.
- Long-running execution must be carefully isolated from request handlers.
- File locking/versioning must be designed enough to avoid corrupting skill assets.

#### Option B — Split server + execution worker from day one

**Approach:** UI/API server delegates execution and LLM jobs to a separate local worker process via a queue or IPC.

**Pros:**
- Cleaner isolation for remote commands and long-running sessions.
- Easier future concurrency story.
- Worker crashes are less likely to crash UI server.

**Cons:**
- Adds coordination complexity before concurrency is in scope.
- Tempts queue/database work that is explicitly out of scope.
- Slower to reach first E2E proof.

#### Option C — CLI-first script generator with minimal web shell

**Approach:** Implement extraction/execution/export as CLI commands first; UI becomes a thin wrapper around CLI outputs.

**Pros:**
- Fastest path to deterministic tests for parser/executor/script generator.
- Easier to run in CI.
- Reduces frontend complexity early.

**Cons:**
- Underserves the requested UI review/debug workflow.
- Skill persistence confirmation and editable drafts become awkward.
- Risk of postponing the core product interaction.

### Favored decision

Choose **Option A** with a deliberately thin execution abstraction: local modular monolith, local files for persistence, typed domain model, and runner interfaces that can later support a worker split if command execution grows too complex.

## Proposed Architecture

### Proposed file/module map

Because this is a greenfield repo, paths are proposed:

- `package.json`, `pnpm-lock.yaml` or equivalent: app scripts and chosen JS/TS dependencies.
- `src/domain/types.ts`: core test case, step, command draft, validation draft, skill, execution, and script-export types.
- `src/domain/provenance.ts`: command origin/state transitions (`original`, `inferred_draft`, `skill_reuse`, `confirmed`, `persisted`).
- `src/server/index.ts`: local server bootstrap.
- `src/server/routes/*.ts`: API routes for parse, health, skill persist/reuse, execute-to-here, export script.
- `src/llm/adapter.ts`, `src/llm/providers/*.ts`: LLM/API/CLI adapter contracts and health checks.
- `src/planner/extract.ts`: turns source text into ordered preconditions/steps/expected results.
- `src/planner/infer-command.ts`: creates editable reference/to-confirm command and validation drafts.
- `src/skills/store.ts`: local file-backed intent-command mapping store.
- `src/skills/match.ts`: similarity/reuse lookup that returns command drafts without noisy source/confidence UI.
- `src/executor/session.ts`: sessionful execute-to-here orchestration.
- `src/executor/local.ts`, `src/executor/remote.ts`: local shell and basic SSH/host/device runners.
- `src/script/generator.ts`: standalone single-script generator and fixed output template.
- `src/persistence/files.ts`: local paths for cases, scripts, logs, skills, histories.
- `src/ui/*`: UI components for original text, ordered cards, command drafts, validation drafts, console/worklog, skill confirmation, and download.
- `tests/unit/*`, `tests/integration/*`, `tests/e2e/*`: verification suites.
- `docs/architecture.md`: module contracts, safety invariants, and ADR notes.

### Core domain states

Command draft states should be explicit enough to enforce safety:

- `original`: command extracted from input text.
- `inferred_draft`: command inferred from natural-language step; editable; not executable until kept/confirmed in the command flow.
- `skill_reuse`: command auto-populated from persisted mapping; editable draft.
- `confirmed`: user has accepted/kept the command for execution/export.
- `rejected` or `blank`: no usable command yet.

Skill persistence states:

- `suggested`: system can offer “保存为 skill?” after a user confirms/edits a useful mapping.
- `pending_confirmation`: modal/confirmation is visible.
- `persisted`: user explicitly confirmed save.

Execution states:

- `idle`, `running_to_step`, `passed_to_step`, `failed_at_step`, `cancelled`, `blocked_needs_confirmation`.

## Implementation Plan

### Phase 0 — Project foundation and invariants

1. Initialize the local app skeleton and document the chosen stack in `docs/architecture.md`.
2. Define `src/domain/types.ts` and `src/domain/provenance.ts` first; tests lock command-state and skill-state transitions before UI wiring.
3. Add fixture test cases covering explicit commands, no-command natural-language steps, expected-result text, host/device hints, and final script output.

### Phase 1 — Parser/planner and LLM/CLI adapter boundary

1. Implement `src/llm/adapter.ts` with provider-neutral `healthCheck`, `extractCase`, `inferCommand`, and `inferValidation` methods.
2. Implement a development/mock adapter so tests and UI can run without a real model.
3. Implement `src/planner/extract.ts` for converting LLM/CLI output into ordered preconditions/steps/expected results.
4. Implement `src/planner/infer-command.ts` so no-command steps produce `inferred_draft` entries, not executable commands.
5. Add schema validation for adapter outputs to prevent malformed model output from becoming executable state.

### Phase 2 — Skill store and reuse loop

1. Implement file-backed skill storage in `src/skills/store.ts` using append-safe or atomic-write JSON/Markdown files under a local data directory.
2. Implement `src/skills/match.ts` to retrieve persisted intent-command mappings for similar natural-language steps.
3. Make reuse populate editable `skill_reuse` command drafts automatically, without requiring a reuse confirmation step.
4. Implement explicit user-confirmed persistence API: no write occurs until the user confirms “保存为 skill”.
5. Add tests proving auto-reuse does not create a new skill and persistence never happens without confirmation.

### Phase 3 — UI review/debug workbench

1. Build the page layout validated by the image mockup: header/status/actions, source text panel, ordered precondition/step cards, command draft fields, validation fields, console output, model/CLI worklog, and skill-save confirmation.
2. Ensure all command and validation fields are editable before execution/export.
3. Add per-row “执行到此” controls that call execute-to-here with the selected index.
4. Add “下载 single 脚本” export action.
5. Display fixed script result template only in generated/exported output, not as editable UI fields.

### Phase 4 — Sessionful execution and remote basics

1. Implement `src/executor/session.ts` as the only orchestration path for execute-to-here.
2. Implement local shell execution and basic SSH/host/device runner adapters.
3. Enforce selected-index bounds so the runner executes commands `0..N` only and never `N+1`.
4. Preserve session context across commands within a run.
5. Stream output into a single console/worklog model while retaining expandable historical run logs.
6. Block execution when any required command before or at N remains unconfirmed/blank.

### Phase 5 — Script generator and export

1. Implement `src/script/generator.ts` to produce a standalone script from confirmed/edited steps.
2. Generate fixed Chinese phase-completion lines, error/expected sample output, final PASS/NO PASS line, and exit codes.
3. Use fail-fast behavior: stop at first precondition/step validation failure.
4. Include enough comments/metadata to preserve original text, edited commands, validation logic, and captured output path references.
5. Add UI download flow and integration tests for script content.

### Phase 6 — End-to-end hardening and documentation

1. Add e2e tests for explicit-command case, no-command inference confirmation, skill persistence/reuse, execute-to-here safety, and script export.
2. Add architecture docs and user workflow docs.
3. Add operational notes for configuring LLM/API/CLI and remote connection fields.
4. Add known limitations matching the non-goals.

## Acceptance Criteria

1. A user can paste a test case with explicit commands and get ordered editable precondition/step command drafts preserving source order (`.omx/specs/deep-interview-command-workbench-restart-context.md:113`).
2. A user can paste a natural-language step without an explicit command and receive an editable reference/to-confirm command draft (`.omx/specs/deep-interview-command-workbench-restart-context.md:114`).
3. The system blocks execution for an inferred draft until the command is confirmed/kept in the executable flow (`.omx/specs/deep-interview-command-workbench-restart-context.md:115`).
4. Clicking “执行到此” on step N executes only commands from index 0 through N and does not execute N+1 or later (`.omx/specs/deep-interview-command-workbench-restart-context.md:116`).
5. Execution preserves session context across commands in the same run, including at least environment variables and current directory in automated tests (`.omx/specs/deep-interview-command-workbench-restart-context.md:117`).
6. Users can edit command drafts and validation scripts before execution/export (`.omx/specs/deep-interview-command-workbench-restart-context.md:118`).
7. A user can explicitly confirm persistence of an intent-command mapping as a skill/asset (`.omx/specs/deep-interview-command-workbench-restart-context.md:119`).
8. A later similar natural-language step receives the persisted command directly as an editable draft without displaying source/confidence details or asking to reuse it (`.omx/specs/deep-interview-command-workbench-restart-context.md:120`).
9. No new skill file/record is created unless the persistence confirmation action was completed (`.omx/specs/deep-interview-command-workbench-restart-context.md:121`).
10. The UI exposes a user-initiated download/export for a standalone single script (`.omx/specs/deep-interview-command-workbench-restart-context.md:122`).
11. The exported script emits the required Chinese phase lines, failure comparison labels, final PASS/NO PASS line, and exit-code behavior (`.omx/specs/deep-interview-command-workbench-restart-context.md:60-65`, `:123`).
12. The first-pass implementation contains no database, multi-user/permission system, concurrent scheduler, complex device orchestration, automatic unconfirmed skill persistence, or production security-audit scope (`.omx/specs/deep-interview-command-workbench-restart-context.md:67-77`, `:124`).
13. LLM/API/CLI configuration includes a visible connectivity/health check (`.omx/specs/deep-interview-command-workbench-restart-context.md:125`).
14. Remote configuration supports target IP, username, password/key, port, root login, host-side command, device-side command, and simple host/device context switching fields (`.omx/specs/deep-interview-command-workbench-restart-context.md:126`).
15. Model/adapter output is schema-validated before it can update executable command state; malformed output becomes a UI-visible draft/error, not executable state.
16. Script export refuses or clearly marks any blank/unconfirmed command or validation gap that would make the standalone script unsafe or incomplete.

## Verification Plan

### Unit tests

- Domain state transitions: inferred draft → confirmed, suggested skill → pending confirmation → persisted, skill reuse → editable draft.
- Parser normalization of preconditions/steps/expected results.
- Skill store atomic write/read and no-write-without-confirmation.
- Skill match returning drafts without changing persisted storage.
- Execute-to-here index slicing cannot include future steps.
- Script generator fixed output lines and fail-fast template.

### Integration tests

- Mock LLM extracts explicit-command test case into ordered cards.
- Mock LLM infers no-command draft and blocks execution before confirmation.
- User confirms a mapping, skill store persists it, later similar text auto-populates the command draft.
- Execute-to-here run preserves env/current-directory state across sequential commands.
- Export flow produces a script that runs locally and exits `0` for PASS and `1` for NO PASS fixtures.

### E2E tests

- Browser flow: paste test case → parse → edit/confirm command → execute-to-here → see console output → save skill → paste similar case → see reused command draft → download script.
- Safety flow: click execute on step 1 with step 2 containing a sentinel command; assert sentinel never runs.
- Export flow: downloaded script contains fixed Chinese output strings and fail-fast behavior.

### Observability/manual checks

- Console shows one current output area and expandable historical logs.
- Model/CLI worklog shows compact activity messages.
- Health check surfaces LLM/CLI disconnected state before parse/inference work.
- Remote fields can be filled and validated without adding multi-user/permission/database scope.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No-command inference conflicts with anti-fabrication | Unsafe commands may appear authoritative | Treat all generated commands as editable drafts; require confirmation before execution; schema-validate model outputs. |
| Skill reuse silently suggests wrong command | User may run wrong draft | Reused commands remain editable drafts; execution is manual; script export can flag unconfirmed/unsafe entries. |
| Execute-to-here accidentally runs future commands | Could cause destructive side effects | Centralize slicing in `executor/session.ts`; unit and e2e sentinel tests prove N+1 never executes. |
| Session context differs between UI execution and exported script | Script may pass in UI but fail standalone | Script generator should mirror ordered session semantics and preserve environment/cwd handling where possible. |
| Remote execution grows into complex orchestration | Scope creep and security risk | Limit first pass to basic config and simple context switching; document complex device orchestration as non-goal. |
| LLM/CLI provider unavailability blocks development | Hard to test offline | Build mock adapter and health-check states first. |
| File-backed persistence corruption | Lost skills/scripts/logs | Use atomic writes, backups or append-only records, and tests around partial writes. |

## ADR — Chosen Product/Architecture Direction

### Decision

Implement Command Workbench as a local modular monolith with file-backed persistence, explicit domain state machines for command drafts/skills/execution, and a single sessionful execute-to-here runner.

### Drivers

- Preserve human-control safety boundaries while supporting no-command inference.
- Prove the complete E2E product loop in the first pass.
- Avoid out-of-scope infrastructure such as database, multi-user permissioning, schedulers, and complex orchestration.

### Alternatives considered

- Split server + execution worker from day one: rejected for first pass because it adds coordination/queue complexity and tempts out-of-scope scheduling.
- CLI-first generator with thin UI: rejected because the requested product value is the UI review/debug/confirmation workflow.

### Why chosen

A modular monolith best balances local-first simplicity, E2E demonstrability, and future extensibility. It lets the team write strong tests around safety-critical boundaries before adding operational complexity.

### Consequences

- Internal module boundaries and domain tests are mandatory to keep the monolith maintainable.
- Long-running execution must be carefully isolated within runner interfaces.
- File persistence must use atomic writes and clear data directories.

### Follow-ups

- Reconsider a separate execution worker only after the first E2E loop is stable and concurrency/long-running jobs become real requirements.
- Reconsider richer evidence display only if users struggle to trust skill reuse or inferred commands; current requirement says not to show source/confidence details for reuse.

## Available-Agent-Types Roster

Known suitable roles from the prompt catalog:

- `architect` — system design, boundaries, interfaces, long-horizon tradeoffs.
- `executor` — implementation/refactoring/feature work.
- `test-engineer` — test strategy, coverage, flaky-test hardening.
- `designer` — UX/UI architecture and interaction design.
- `verifier` — completion evidence, claim validation, test adequacy.
- `code-reviewer` — comprehensive code review.
- `debugger` — root-cause analysis when tests or execution fail.
- `writer` — docs, migration notes, user guidance.
- `dependency-expert` — SDK/package choice or upgrade decisions if stack selection becomes contentious.
- `researcher` — official docs/reference lookup for chosen SDKs/APIs.
- `explore` — repo-local mapping after implementation files exist.

## Follow-up Staffing Guidance

### `$ralph` path — single-owner persistence loop

Recommended when one owner should drive the implementation sequentially and keep verification tight.

- Lead: `executor` (medium/high reasoning) owns implementation phases 0-6.
- Side reviewers as needed: `test-engineer` for the acceptance/test suite, `designer` for the UI interaction pass, `verifier` for final evidence, `code-reviewer` before completion.
- Suggested use: after plan approval, run `$ralph .omx/plans/prd-command-workbench-*.md` and keep this plan/test-spec attached as requirements source.

### `$team` path — coordinated parallel implementation

Recommended because this project has separable lanes: domain/LLM, UI, execution/remote, script generation, and tests.

Suggested lanes:

1. `executor` lane A — domain model, parser/planner, LLM adapter.
2. `executor` lane B — skill store/reuse and persistence.
3. `executor` lane C — executor/session/remote basics.
4. `executor` lane D — script generator/export.
5. `designer` or `executor` lane E — UI workbench.
6. `test-engineer` lane F — cross-lane test harness and e2e fixtures.

Use `verifier` after team execution to confirm safety invariants and plan coverage.

### Suggested reasoning levels by lane

- Domain/safety/executor/script generator: high, because state boundaries are safety-critical.
- UI: medium/high, because interaction semantics are central but can iterate visually.
- Tests/verifier: high, because execute-to-here and no-unconfirmed-persistence bugs are high-cost.
- Docs/writer: medium.

## Goal-Mode Follow-up Suggestions

- `$ultragoal` — suitable default if the user wants durable goal tracking across all phases.
- `$performance-goal` — not the first recommended path now; use later if command execution latency, LLM response time, or large-document parsing throughput becomes a measurable optimization target.
- `$autoresearch-goal` — not a fit for the implementation itself; use only if the team decides to research command-document retrieval strategies or LLM/CLI provider tradeoffs separately.

## Team Launch Hints

From an attached OMX/tmux runtime, candidate commands:

```text
$team .omx/plans/prd-command-workbench-<timestamp>.md
```

or, from shell where OMX team is available:

```bash
omx team --plan .omx/plans/prd-command-workbench-<timestamp>.md
```

Team verification path:

1. Team proves each lane acceptance criterion with tests or documented manual evidence.
2. Team produces changed-file summary and test output.
3. Ralph/verifier follow-up runs final end-to-end evidence pass against `.omx/plans/test-spec-command-workbench-<timestamp>.md`.
4. Shutdown only after execute-to-here sentinel, no-unconfirmed-skill-write, and exported-script output tests pass.

## Changelog / Consensus Notes

- Draft created from deep-interview spec for Architect and Critic review.
