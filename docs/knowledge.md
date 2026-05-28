# Knowledge Base Mechanism

Command Workbench keeps runtime knowledge under `.workbench/knowledge/`:

```text
.workbench/knowledge/
  index.json
  items/
    *.md
```

There is one user-facing concept: **knowledge item / 人工经验**. A single Markdown item may include requirements, templates, examples, and reference notes. The product should not ask users to classify an item as a rule, skill, example, doc, phase, or device-shell type.

`index.json` stores compact metadata:

```json
{
  "version": 1,
  "items": [
    {
      "id": "switch-user",
      "title": "切换用户必须显式处理",
      "summary": "当原文要求切换用户时，生成 su/sudo/ssh 等上下文切换动作，不能跳过。",
      "path": "items/switch-user.md",
      "enabled": true,
      "strength": "must"
    }
  ]
}
```

Retrieval flow:

1. Local code filters only `enabled` and does not use phase/device-shell hard constraints.
2. The model receives concise summaries for enabled items and chooses semantically relevant ids from the current item/source text.
3. Only selected Markdown files are loaded into the final model prompt.

Local code must not use raw test-case keyword matching such as `includes("切换用户")` or regular expressions over the user's source text to select knowledge.

Knowledge can be useful for decomposition, command generation, or validation, but that applicability should be described in natural-language titles/summaries/content instead of mandatory metadata fields. Standalone prerequisite/preflight detection is intentionally not a separate knowledge workflow.
