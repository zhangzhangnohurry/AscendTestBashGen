# Command Workbench Knowledge Base

Runtime knowledge uses one unified catalog:

- `index.json` — compact summaries and metadata used for model selection.
- `items/*.md` — full knowledge items loaded only after the model selects them.

A knowledge item may contain rules, templates, examples, or reference notes in one Markdown file. Users should not need to decide whether something is a rule, skill, example, phase, or device-shell type; they add an experience item, and the title/summary/content explain where it applies.

Selection flow:

1. Local code filters only `enabled`.
2. The configured model/CLI receives enabled summaries and selects relevant item ids from the current source/item meaning.
3. Only selected Markdown files are injected into the formal model prompt.

Local code must not select knowledge by matching raw test-case keywords.

Note: standalone precondition detection has been removed by product decision.
