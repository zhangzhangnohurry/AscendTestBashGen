# Command Workbench

Local no-dependency Node.js workbench that turns test-case text into editable command/validation drafts, supports manual "execute to here", explicit skill persistence/reuse, and strict standalone shell-script export.

## Run

```bash
npm start
# open http://localhost:3001
```

## LLM/CLI configuration

This app does **not** fabricate inferred commands. If no provider is configured, raw text is not parsed and no commands are inferred. This avoids local keyword/regex guessing.

Copy `.env.example` into your shell/session configuration and choose one provider:

```bash
# CLI adapter
# Local Claude CLI
export WORKBENCH_LLM_PROVIDER=local-claude
# optional: export WORKBENCH_LLM_MODEL=sonnet

# Local Codex CLI
export WORKBENCH_LLM_PROVIDER=local-codex
# optional: export WORKBENCH_LLM_MODEL=gpt-5.5

# LLM API / HTTP model API
export WORKBENCH_LLM_PROVIDER=llm-api
export WORKBENCH_LLM_URL=https://api.openai.com
export WORKBENCH_LLM_API_KEY=...
export WORKBENCH_LLM_MODEL=gpt-4.1
```

Normal HTTP model calls should use `WORKBENCH_LLM_PROVIDER=llm-api`; this path requires exactly URL, API key, and model, and sends the model in the chat-completions-compatible request body.

Full custom adapter examples: `docs/adapter-contract.md`.

For normal users, choose Local Claude CLI, Local Codex CLI, or LLM API in Settings. Custom adapter contracts are documented in `docs/adapter-contract.md` for advanced integrations only; the custom HTTP adapter is not a direct model API and does not expose a model field.

## Test

```bash
npm test
```

## Safety model

- Commands from source text are executable after a manual click.
- Inferred commands start blocked and must be explicitly confirmed before execution or export.
- Reused skills may auto-fill editable drafts only when the configured adapter returns an existing `skillId`; execution still requires a manual click.
- Execute-to-here creates an immutable snapshot and runs exactly items `0..N`.
- Final script export refuses blank commands, unconfirmed inferred commands, malformed/missing required validation, unresolved SSH config, missing default password/key auth, and unacknowledged root mode.

## Storage

Local workbench state is file-backed under `.workbench/`:

- `skills.json` — confirmed intent → command mappings.
- `run-history.jsonl` — execution records.

No database, multi-user permission system, scheduler, or production security hardening is included in this first pass.
