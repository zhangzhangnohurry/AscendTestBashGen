# LLM / CLI Adapter Contract

Command Workbench does not parse test cases with local keywords/regex. It sends JSON requests to a configured adapter and expects JSON responses.

## Tasks

### `health`

Request:

```json
{"task":"health"}
```

Response:

```json
{"ok":true,"provider":"your-adapter","message":"ready"}
```

### `extractTestCase`

Request:

```json
{"task":"extractTestCase","text":"raw test case text","context":{}}
```

Response:

```json
{
  "ok": true,
  "items": [
    {
      "type": "precondition",
      "sourceText": "P1 original text",
      "intent": "human-readable intent",
      "command": "optional command draft",
      "commandEvidence": "explicit",
      "expected": "optional expected result",
      "validation": "optional validation that checks $COMMAND_OUTPUT",
      "validationEvidence": "inferred",
      "target": "host"
    }
  ]
}
```

Rules:

- `type`: `precondition` or `step`.
- `target`: `local`, `host`, or `device`; SSH is the remote transport.
- `commandEvidence`: use `explicit` only when `command` is copied from the source text. Use `inferred` for model/tool guesses and `none` when no command is present. Commands without explicit evidence are blocked until reviewed.
- `validationEvidence`: use `explicit` only when the source text contains an executable validation snippet. Inferred validations are blocked until reviewed.
- Validation must check `$COMMAND_OUTPUT`; do not repeat the primary command.
- Manual or conditional actions must not be dropped. Return them as separate ordered items with an empty `command` when they are not directly executable, so the user can fill or acknowledge them.

### `matchSkill`

Request contains the current item plus metadata for existing skills. It intentionally does not include stored command bodies.

```json
{
  "task": "matchSkill",
  "item": {"sourceText":"...","intent":"...","expected":"...","target":"host"},
  "skills": [{"id":"skill-001","intent":"...","target":"host"}],
  "context": {}
}
```

Response:

```json
{"ok":true,"action":"reuse","skillId":"skill-001"}
```

or:

```json
{"ok":true,"action":"no_match"}
```

### `inferCommand`

Request:

```json
{"task":"inferCommand","intent":"...","context":{"sourceText":"...","expected":"..."}}
```

Response:

```json
{"ok":true,"command":"command draft"}
```

### `inferValidation`

Request:

```json
{"task":"inferValidation","expected":"...","context":{"sourceText":"...","intent":"..."}}
```

Response:

```json
{"ok":true,"validation":"grep -q 'expected text' <<< \"$COMMAND_OUTPUT\""}
```

## CLI adapter

The CLI command receives one JSON object on stdin and must print one JSON object to stdout.

Minimal local CLI adapter for testing:

```js
// /tmp/workbench-adapter.cjs
process.stdin.setEncoding('utf8');
let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  const req = JSON.parse(raw);
  if (req.task === 'health') {
    console.log(JSON.stringify({ ok: true, provider: 'local-cli-test', message: 'ready' }));
    return;
  }
  if (req.task === 'extractTestCase') {
    console.log(JSON.stringify({
      ok: true,
      items: [
        { type: 'precondition', sourceText: 'P1 adapter item', intent: 'check environment', command: 'true', commandEvidence: 'explicit', expected: 'success', validation: ': \"${COMMAND_OUTPUT}\"', validationEvidence: 'explicit', target: 'host' },
        { type: 'step', sourceText: 'S1 adapter item', intent: 'collect diagnostic log', command: 'printf "expected-token\\n"', commandEvidence: 'explicit', expected: 'expected token appears', validation: 'grep -q "expected-token" <<< "$COMMAND_OUTPUT"', validationEvidence: 'inferred', target: 'host' }
      ]
    }));
    return;
  }
  if (req.task === 'matchSkill') {
    console.log(JSON.stringify({ ok: true, action: 'no_match' }));
    return;
  }
  if (req.task === 'inferCommand') {
    console.log(JSON.stringify({ ok: true, command: '' }));
    return;
  }
  if (req.task === 'inferValidation') {
    console.log(JSON.stringify({ ok: true, validation: '' }));
    return;
  }
  console.log(JSON.stringify({ ok: false, message: 'unknown task' }));
});
```

Configure UI:

- Provider: `cli`
- CLI command: `node /tmp/workbench-adapter.cjs`
- Timeout if needed
- Click `测试 health`; expected `ok:true`.

CLI mode intentionally does not show HTTP URL or API key fields. If the CLI adapter needs credentials, configure them in the adapter process environment.
- Paste any text and click parse; the adapter test items should appear.

## HTTP adapter

The HTTP adapter receives the same JSON request by POST and returns the same JSON response.

Minimal local HTTP adapter for testing:

```js
// /tmp/workbench-http-adapter.cjs
const http = require('node:http');

http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  res.setHeader('content-type', 'application/json');

  if (body.task === 'health') {
    res.end(JSON.stringify({ ok: true, provider: 'local-http-test', message: 'ready' }));
    return;
  }
  if (body.task === 'extractTestCase') {
    res.end(JSON.stringify({ ok: true, items: [
      { type: 'step', sourceText: 'HTTP adapter item', intent: 'show expected token', command: 'printf "expected-token\\n"', commandEvidence: 'explicit', expected: 'contains expected token', validation: 'grep -q "expected-token" <<< "$COMMAND_OUTPUT"', validationEvidence: 'inferred', target: 'host' }
    ] }));
    return;
  }
  if (body.task === 'matchSkill') {
    res.end(JSON.stringify({ ok: true, action: 'no_match' }));
    return;
  }
  res.end(JSON.stringify({ ok: true }));
}).listen(8787, () => console.log('adapter listening on :8787'));
```

Run:

```bash
node /tmp/workbench-http-adapter.cjs
```

Configure UI:

- Provider: `http`
- HTTP URL: `http://127.0.0.1:8787`
- Open `高级：HTTP 鉴权` only if your adapter needs API key
- API key header: default `Authorization`
- API key prefix: default `Bearer`; leave blank if your adapter expects the raw key.

## API key

API key is only needed if your HTTP adapter requires it. The workbench sends it to the adapter as an HTTP header:

```text
Authorization: Bearer <api-key>
```

You can change the header name and prefix in Settings. For CLI adapters, put provider credentials inside the CLI adapter process/environment instead of storing them in the workbench UI.
