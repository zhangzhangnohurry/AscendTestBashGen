# Command Workbench Architecture

This implementation follows the PRD's Option A: a local modular monolith with explicit safety boundaries and no external dependencies.

## Modules

- `src/planner/extract.js` does not perform local keyword/regex parsing. It normalizes structured items returned by the configured CLI/HTTP extraction adapter, then asks the configured adapter to choose an existing skill id for reuse, or performs configured command/validation inference.
- `src/domain/state.js` centralizes command, validation, execute, and export readiness guards.
- `src/skills/store.js` persists skills atomically only after explicit confirmation.
- `src/executor/session.js` is the only execute-to-here path. It validates index bounds, blocks unsafe commands, freezes a snapshot, and builds a shell script containing only `0..N`.
- `src/script/generator.js` creates the final standalone shell script and preserves required Chinese PASS/NO PASS output semantics.
- `src/server/index.js` exposes the local API and serves `src/ui/*`.

## Invariants covered by tests

1. Inferred commands cannot execute/export before confirmation.
2. Skill reuse auto-populates editable drafts only from an adapter-selected existing skill id, without local fuzzy matching.
3. Execute-to-here runs exactly `0..N` and excludes future commands.
4. Snapshots are immutable after job creation.
5. Export refuses unsafe gaps and emits fixed PASS/NO PASS script paths.
6. SSH remote/root config gates are represented before export; password auth is the default unless a key path is explicitly configured.

## First-pass limitations

- LLM/CLI integration is configuration-driven through `src/llm/adapter.js`. With no provider configured, inference is disabled and blank blocked drafts are produced for no-command steps.
- Remote execution has config/health/export gates and SSH prefix helpers, but execute-to-here currently runs local shell scripts only.
- Browser tests are covered through HTTP/API and exported-script execution, not a full browser automation dependency.
