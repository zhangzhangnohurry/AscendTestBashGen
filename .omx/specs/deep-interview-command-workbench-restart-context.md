# Execution-Ready Spec — Command Workbench

## Metadata

- Profile: standard
- Rounds: 1
- Final ambiguity: 0.16
- Threshold: 0.20
- Context type: greenfield
- Source context: `COMMAND_WORKBENCH_RESTART_CONTEXT.md`
- Context snapshot: `.omx/context/command-workbench-restart-context-20260521T132544Z.md`
- Transcript: `.omx/interviews/command-workbench-restart-context-20260521T133527Z.md`
- Prompt-safe initial-context summary: not needed; source file is small enough for planning use.

## Clarity Breakdown

| Dimension | Score | Note |
|---|---:|---|
| Intent | 0.90 | E2E local workbench + reusable confirmed intent-command mappings |
| Outcome | 0.90 | UI/server, LLM/CLI, execute-to-here, remote basics, script export, skill persistence/reuse |
| Scope | 0.90 | Broad E2E first pass with explicit non-goals |
| Constraints | 0.88 | No unconfirmed execution/persistence; drafts are editable |
| Success | 0.82 | Acceptance criteria sufficient for downstream PRD/test planning |
| Context | 0.76 | Greenfield repo; context doc only |

## Intent

Build a general local tool/plugin that turns test-case text into a reviewable, debuggable, executable, saveable **single test-case script**. The tool must support real test cases where commands may be embedded in text or absent, while preserving human control over execution, final script export, and durable skill creation.

## Desired Outcome

An end-to-end local command workbench with:

1. Local server + HTML UI.
2. Test-case text intake.
3. Structured extraction of preconditions, test steps, and expected results.
4. Command and validation-script draft generation through LLM/API or local CLI.
5. Support for natural-language steps with no explicit command by producing editable reference/to-confirm command drafts.
6. Manual execute-to-here behavior that replays from the first command/precondition through the selected step in one contextual session.
7. Basic remote execution configuration for host/device scenarios.
8. User-confirmed persistence of natural-language intent → command mappings as reusable skills/assets.
9. Automatic reuse of existing persisted skills to populate future editable command drafts.
10. User-initiated download/export of a final standalone single script with fixed PASS/NO PASS output semantics.

## In Scope

- E2E first pass, not PRD-only.
- Local server and HTML UI.
- Original test-case text display.
- Ordered precondition/test-step sequence.
- Editable command drafts for each precondition/step.
- Editable validation scripts / expected-result checks when available or inferred.
- LLM/API or local CLI based extraction and inference.
- No-command natural-language inference for commands, but only as drafts until confirmed.
- Skill persistence flow: after user confirms that an intent can use command `xxx`, persist that mapping for future reuse.
- Skill reuse flow: similar future natural-language intent can automatically receive the persisted command as an editable draft without requiring confirmation merely to reuse it.
- Manual execute-to-here: from the first command through the selected item only, preserving session context.
- Basic host/device remote execution fields such as target IP, username, password/key, port, root login, host commands, device commands, and simple host/device context switching.
- Final single-script download/export.
- Final script fixed result outputs:
  - `预制条件检查完成: PASS/NO PASS`
  - `用例执行完成: PASS/NO PASS`
  - failure comparison: `错误样本`, `期望样本`
  - final line: `PASS` or `NO PASS`
  - PASS exit code `0`; NO PASS non-zero, recommended `1`.

## Out of Scope / Non-goals

- Multi-user support.
- Permission management.
- Database.
- Concurrent scheduling.
- Complex device orchestration.
- Automatic skill persistence without user confirmation.
- Production-grade security audit.
- Treating documents as free command-generation sources.
- Keyword/whitelist based command recall as the main flow.

## Decision Boundaries

OMX/downstream planning may decide:

- Local app architecture and module boundaries.
- Concrete UI layout details consistent with the single-column ordered steps + console/worklog intent.
- Local file-based persistence format for scripts, logs, and skills/assets, as long as no database is introduced.
- LLM/API/CLI adapter boundaries and health-check design.
- Draft data model for preconditions, steps, commands, validations, expected results, and provenance flags.

Must preserve these user decisions:

- All generated/provided commands are drafts and may be edited by the user.
- Inferred commands from no-command natural language are allowed, but must start as reference/to-confirm drafts.
- Execution requires a manual user click.
- Execution always means execute from the first command/precondition through the selected item.
- Later commands after the selected item must never execute during execute-to-here.
- Final script writing is exposed as user-initiated download/export.
- Persisting an intent-command mapping as skill requires user confirmation.
- Reusing an existing persisted skill to populate a command draft does not require confirmation and should happen automatically.
- No unconfirmed automatic skill persistence.

## Constraints

- Input test-case text is the primary source of truth.
- Original commands, step order, and expected results have highest priority.
- Documents are evidence stores for format/field/output/assertion support, not free-generation sources.
- Do not use simple keyword/whitelist recall to generate commands in the main flow.
- Commands may share session context, so isolated per-command execution is invalid.
- Output and historical logs should be saveable.
- Basic remote execution is required, but heavy operational features are out of scope.

## Testable Acceptance Criteria

1. Given a test case containing explicit commands, the tool extracts ordered preconditions/steps and populates editable command drafts preserving original order.
2. Given a natural-language step with no explicit command, the tool can infer a reference/to-confirm editable command draft.
3. An inferred command cannot execute until the user confirms/keeps it in the editable command flow.
4. When the user clicks execute on step N, the runner executes only from the first command/precondition through step N and never executes step N+1 or later.
5. The execution session preserves context across commands, such as environment variables, current directory, login state, or generated files.
6. The UI allows the user to edit command drafts and validation scripts before execution/export.
7. The UI allows the user to confirm persistence of an intent-command mapping as a skill/asset.
8. After a mapping is persisted, a later similar natural-language step receives the mapped command directly as an editable draft without showing source/confidence details or requiring reuse confirmation.
9. The system does not persist new skills without explicit user confirmation.
10. The UI allows downloading/exporting a final standalone single script.
11. The exported script emits the required Chinese PASS/NO PASS phase lines, error/expected sample comparison on failure, final PASS/NO PASS line, and correct exit code semantics.
12. The first-pass design avoids multi-user/permission systems, databases, concurrency scheduling, complex device orchestration, and production-grade security-audit scope.
13. The LLM/API or local CLI configuration includes a connectivity/health check.
14. Basic remote configuration supports target IP, username, password/key, port, root login, host-side commands, device-side commands, and simple host/device context switching.

## Assumptions Exposed + Resolutions

- Assumption: first pass could be PRD-only. Resolution: corrected to full E2E first-pass scope.
- Assumption: first pass could require commands already present in the source text. Resolution: rejected; no-command natural-language inference is required.
- Assumption: anti-fabrication might prohibit inferred commands entirely. Resolution: inferred commands are allowed as reference/to-confirm drafts and need user confirmation before execution/final use.
- Assumption: skill reuse should show evidence/metadata. Resolution: no; directly provide editable command drafts.

## Pressure-Pass Findings

A scope pressure test attempted to narrow the MVP to explicit-command-only scenarios. The user rejected that and clarified that natural-language no-command inference plus durable skill persistence are first-pass essentials. This changed the spec from a safer command-extraction-only workbench into an E2E workbench with a human-confirmed learning loop.

## Brownfield Evidence vs Inference Notes

- `[from-code][auto-confirmed]`: `COMMAND_WORKBENCH_RESTART_CONTEXT.md` exists and is prompt-safe (~6.8 KB).
- `[from-code][auto-confirmed]`: no implementation files were found at shallow repo depth beyond `.omx` runtime files and the context document.
- `[from-code]`: treat repository as greenfield for planning unless later code is added or revealed.
- `omx explore` failed due to a sandbox/bwrap network-address permission issue; direct shell fallback was used for read-only inspection.

## Technical Context Findings

Likely planning modules:

- `server`: local API/web server.
- `ui`: original text, ordered steps, command/validation drafts, execute controls, console/worklog, download action.
- `llm-adapters`: CLI/API providers and health checks.
- `parser-planner`: structure extraction, natural-language inference, expected-result analysis.
- `skill-store`: local file-backed intent-command mappings and reuse lookup.
- `executor`: sessionful local/remote execute-to-here runner.
- `remote`: basic SSH/host/device context support.
- `script-generator`: final standalone script template and fixed output/exit semantics.
- `persistence`: local file paths for scripts, logs, skills/assets, execution history.

## Condensed Transcript

### Round 6 — decision boundaries / confirmation checkpoints

**Q:** Which actions require explicit confirmation vs automatic behavior: execute commands, write final single script, persist skill, reuse existing skill to draft commands?

**A:** Execution must be manually clicked and always runs from the first command to the selected point; later commands must never execute. Writing final output means allowing the user to download the single script. Persistence as skill requires confirmation. Reusing existing skills does not require confirmation because the point is automatic retrieval to avoid repeated manual input.

**Interpretation:** Confirmation checkpoints are explicit: manual click for execute-to-here only, no downstream execution; script export is user-initiated download; skill persistence requires confirmation; skill reuse may auto-populate editable command drafts without confirmation.


## Recommended Handoff

Use `$ralplan` next:

```text
$plan --consensus --direct .omx/specs/deep-interview-command-workbench-restart-context.md
```

Expected outputs: `.omx/plans/prd-*.md` and `.omx/plans/test-spec-*.md` based on this clarified spec.
