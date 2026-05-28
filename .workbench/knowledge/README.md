# Command Workbench Knowledge Base

Runtime knowledge uses one unified catalog:

- `index.json` — compact summaries and metadata used for model selection.
- `items/*.md` — full knowledge items loaded only after the model selects them.

A knowledge item may contain rules, templates, examples, or reference notes in one Markdown file. Users should not need to decide whether something is a rule or a skill; they add an experience item, and metadata describes where it applies.

Selection flow:

1. Local code filters only structured metadata such as `enabled`, `phases`, and `isDeviceShell`.
2. The configured model/CLI receives enabled summaries and selects relevant item ids.
3. Only selected Markdown files are injected into the formal decompose/generate/validate prompt.

Local code must not select knowledge by matching raw test-case keywords.


Note: standalone precondition detection has been removed by product decision.
Knowledge items should target decompose/generate/validate only.
