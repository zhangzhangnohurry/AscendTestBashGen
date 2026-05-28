# Ralph Context Snapshot — User-friendly LLM Config

## Task statement
User invoked `$ralph` and requested that this tool is for final users, not adapter developers. The LLM setup must not expose lots of adapter complexity. Local Claude/Codex should be directly callable. LLM API setup should only require key, url, and model.

## Desired outcome
Update the web app settings and backend adapter implementation so normal users choose simple providers:
- Local Claude CLI
- Local Codex CLI
- LLM API (key/url/model)
Advanced custom adapter support may remain hidden/advanced, not the main path.

## Known facts/evidence
- Current UI exposes provider-aware settings but still uses low-level `cli` / `http` adapter concepts.
- Current backend supports configurable adapter tasks through `src/llm/adapter.js` and `/api/adapter/health`.
- Current tests pass: 18 tests before this task.
- Project is a no-dependency Node.js web app.

## Constraints
- Do not require final users to write adapter scripts for local Claude/Codex.
- Do not require users to understand OpenAI/Anthropic adapter protocols in the main UI.
- No local keyword/regex parsing of test case text.
- Keep validation model: validation checks `$COMMAND_OUTPUT`, do not rerun primary command.
- Preserve existing tests or update them to match the product-facing design.

## Unknowns/open questions
- Exact prompt format for real local Claude/Codex CLI may vary by installed CLI. Implement robust direct CLI invocation by command, prompt via stdin, and JSON extraction from stdout.
- Generic LLM API response shape can vary. Use an OpenAI-compatible chat-completions style when URL is a base URL or explicit endpoint, with robust JSON extraction.

## Likely codebase touchpoints
- `src/llm/adapter.js`
- `src/ui/index.html`
- `src/ui/app.js`
- `src/ui/style.css`
- `src/server/index.js`
- `docs/adapter-contract.md`
- `README.md`
- `tests/*`
