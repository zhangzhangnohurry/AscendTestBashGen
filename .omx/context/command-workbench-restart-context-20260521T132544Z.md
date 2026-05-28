# Deep Interview Context Snapshot: command-workbench-restart-context

## Task statement
User invoked `$deep-interview COMMAND_WORKBENCH_RESTART_CONTEXT.md 看下`, asking to inspect the restart context document and clarify requirements before any execution.

## Desired outcome
Produce an execution-ready requirements spec for a local tool/plugin that turns test-case text into a reviewable, debuggable, saveable single test-case script, with UI/server, command extraction, evidence-backed assertions, remote execution, LLM/CLI integration, and persistence.

## Stated solution
Build a generic local tool/plugin that:
- accepts test-case text;
- extracts preconditions, test steps, and expected results;
- extracts or proposes bash commands with strict provenance rules;
- generates executable validation scripts that output PASS/NO PASS and why;
- runs a local server + HTML UI for review/debugging;
- supports “execute to this step” by replaying from preconditions in one contextual session;
- supports local/remote host/device execution;
- saves a final standalone single-case script with fixed result output format and logs.

## Probable intent hypothesis
The user wants to convert a rough product/architecture note into a clarified, bounded implementation plan without losing strict constraints around command provenance, UI semantics, and final script behavior.

## Known facts/evidence
- Source document: `COMMAND_WORKBENCH_RESTART_CONTEXT.md`.
- File size: ~6.8 KB, 230 words / 337 lines / 6954 bytes from `wc`; prompt-safe summary gate not needed.
- Current repo has no implementation files discovered at max depth 3, only the context document and `.omx` runtime files. Treat as greenfield unless user indicates code exists elsewhere.
- `omx explore` failed in this environment due to `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; fallback shell inspection succeeded.

## Constraints
- Input test-case text is the primary source of truth.
- No simple keyword/whitelist recall for command generation in the main flow.
- Documents are evidence stores, not free command-generation sources.
- Do not fabricate commands.
- Commands extracted from source text have priority; when source has no command, generated commands must be marked reference/to-confirm.
- Precondition and step commands run in one session because context affects later commands.
- Final script uses fail-fast behavior and fixed PASS/NO PASS outputs/exit codes.
- Remote execution is basic required capability; permissions, multi-user isolation, database, and concurrency scheduling are out of initial scope.
- No direct implementation during deep-interview.

## Unknowns/open questions
- First-pass scope/MVP boundary: which capabilities must be in v1 vs deferred.
- The main user success criterion: validated spec, runnable prototype, UI-first tool, script generator, or architecture plan.
- Which execution lane should follow after interview.
- Which LLM/CLI interfaces are mandatory first.
- Where command/document evidence assets should live initially.
- Exact persistence format and script template constraints beyond fixed outputs.

## Decision-boundary unknowns
- What the agent may decide autonomously about architecture, stack, UI layout, persistence format, and LLM provider abstractions.
- Whether to choose a minimal local-file implementation first or design for extensibility immediately.
- Whether ambiguous commands should block script generation or be allowed as editable/to-confirm entries.

## Likely codebase touchpoints
- Greenfield repository; likely future touchpoints include server entrypoint, UI frontend, parser/planner orchestration, command provenance model, execution/session runner, remote SSH/device runner, evidence/document store, final script generator, and persistence/logging.

## Prompt-safe initial-context summary status
not_needed
