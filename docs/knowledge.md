# Knowledge Base Mechanism

Command Workbench keeps runtime knowledge under `.workbench/knowledge/`:

```text
.workbench/knowledge/
  index.json
  items/
    *.md
```

There is one user-facing concept: **knowledge item / 人工经验**. A single Markdown item may include requirements, templates, examples, and reference notes. The product should not ask users to classify an item as a rule, skill, example, or doc.

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
      "phases": ["decompose", "generate"],
      "isDeviceShell": true,
      "strength": "must"
    }
  ]
}
```

Retrieval flow:

1. Local code filters only structured metadata: `enabled`, `phases`, and `isDeviceShell`.
2. The model receives concise summaries, including `isDeviceShell`, and chooses semantically relevant ids.
3. Only selected Markdown files are loaded into the final model prompt.

Local code must not use raw test-case keyword matching such as `includes("切换用户")` or regular expressions over the user's source text to select knowledge.

## Runtime phases

Knowledge can currently target these model phases:

- `decompose` — split the raw document into ordered original items while preserving the source wording.
- `generate` — draft a command for one reviewed item.
- `validate` — draft an executable validation snippet for one reviewed item.

The removed standalone precondition-detection flow is intentionally not a phase. Setup/precondition text may still appear as document structure, but the system no longer creates a separate “precondition satisfied” check path.
