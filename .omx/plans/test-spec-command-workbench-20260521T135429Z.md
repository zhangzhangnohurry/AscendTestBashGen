# Test Spec — Command Workbench E2E Local Tool

## 0. Metadata

- Pairs with PRD: `prd-command-workbench-<same timestamp>.md`
- Requirements source: `.omx/specs/deep-interview-command-workbench-restart-context.md`
- Scope: unit, integration, e2e, observability/manual verification for first E2E implementation.

## 1. Test Strategy

Prove safety-critical invariants before broad UX polish: inferred commands do not execute/export until confirmed; skill reuse auto-populates drafts without reuse confirmation but remains editable; execute-to-here runs exactly `0..N`; validation gaps block final export; remote secrets/root handling has first-pass safety minimums; exported scripts preserve PASS/NO PASS semantics.

## 2. Unit Tests

### Domain state

- `original` nonblank command can become execution-ready without inference confirmation.
- `inferred` command starts blocked; `confirm/keep` makes it ready.
- `skill_reuse` command auto-populates as editable draft and does not require reuse confirmation.
- `user_edited` records current command value and preserves readiness rules.
- Blank/rejected command is execution/export blocked.
- Persistence state only writes on `pending_confirmation -> persisted`.

### Validation state

- Expected-result step without validation becomes `required_missing`.
- Malformed validation becomes `malformed` and blocks final export.
- Optional empty validation is allowed only when source step has no required expected result.
- User-edited validation can become `required_ready` after syntax/schema validation.

### Export readiness

- Refuses blank command.
- Refuses unconfirmed inferred command.
- Refuses missing/malformed required validation.
- Refuses unresolved remote config.
- Refuses unsupported host/device transition.
- Allows export when all included commands and validations are ready.

### Runner slicing

- Selected index `0` executes only item 0.
- Middle index executes exactly `0..N`.
- Last index executes all included items.
- Out-of-range index refuses job creation.
- Snapshot cannot be mutated by later UI edits during a run.

### Script generator

- Emits `预制条件检查完成: PASS` and `预制条件检查完成: NO PASS` paths.
- Emits `用例执行完成: PASS` and `用例执行完成: NO PASS` paths.
- Emits `错误样本` and `期望样本` on failure.
- Ends with final `PASS` or `NO PASS`.
- Returns `0` for PASS and `1` or documented nonzero for NO PASS.
- Fail-fast stops at first failed precondition/step.

### Redaction

- Redacts password fields, private key material, tokens, and configured secret values.
- Redaction applies before display, persistence, and export metadata.

## 3. Integration Tests

1. Explicit-command extraction preserves ordered preconditions/steps/commands/expected results.
2. No-command inference returns command draft and execution blocks until confirmation.
3. Skill persistence writes atomically only after confirmation.
4. Suggested/pending skill without confirm creates no record.
5. Skill reuse auto-populates command draft without source/confidence display and without creating new skill.
6. Execute-to-here preserves env/current-directory context.
7. N+1 sentinel side effect never occurs when selecting earlier step.
8. Timeout/cancel stops current job and next command is not started.
9. Remote health reports missing/invalid config before sequence execution.
10. Root mode requires explicit flag and visible warning/worklog event.
11. Host/device ordering is represented in snapshot and executed/exported or refused with gap.
12. Export refusal returns exact unsafe gap list.
13. Export success returns downloadable script only after readiness passes.

## 4. E2E Browser Tests

### Explicit-command happy path

Open UI → paste explicit-command case → parse cards → edit validation → execute final step → console output appears → download script → run script in fixture shell → assert PASS and exit `0`.

### No-command inference + skill save + reuse

Paste no-command case → mock inference returns reference/to-confirm draft → confirm/keep/edit → execute → confirm “保存为 skill” → paste similar case → command auto-populates from skill without reuse confirmation → user can edit.

### Future command never runs

Three-step fixture with sentinel side effect in step 2 → execute-to-here on step 1 → assert steps 0/1 ran and step 2 sentinel is absent.

### Export refusal

Case with unconfirmed inferred command plus missing required validation → click download → assert no script downloads and refusal report lists both gaps.

### Remote safety

Enter remote secret fixture → health check / failed remote run → assert redacted logs; toggle root mode → assert explicit warning is required/visible.

## 5. Observability / Manual Checks

- Header shows LLM/CLI health.
- Remote status shows configured/unconfigured and health state.
- Worklog shows parse, inference, skill reuse, skill-save waiting, execution start/finish.
- Console has one current-output area with expandable historical runs.
- Export refusal report maps gaps to steps.
- Known limitations match non-goals.

## 6. Minimum Quality Gates

- Unit tests pass.
- Integration tests pass for parser, skill store/reuse, runner, export, redaction.
- E2E tests pass for explicit command, no-command inference/reuse, N+1 sentinel, export refusal.
- At least one exported script fixture runs locally and produces expected PASS/NO PASS outputs and exit codes.
- No test/log output includes raw configured secrets.
- Changed files and remaining risks are documented.
