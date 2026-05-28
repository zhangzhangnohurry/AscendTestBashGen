import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('knowledge retrieval offers all enabled summaries then reads model-selected markdown', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-knowledge-'));
  process.env.WORKBENCH_DIR = dir;
  const marker = Date.now();
  const { retrieveKnowledge } = await import(`../../src/knowledge/retrieve.js?case=${marker}`);
  const { persistKnowledgeItem, listKnowledgeSummaries } = await import(`../../src/knowledge/store.js?case=${marker}`);
  const knowledgeDir = path.join(dir, 'knowledge');
  await mkdir(path.join(knowledgeDir, 'items'), { recursive: true });
  await writeFile(path.join(knowledgeDir, 'items', 'switch-user.md'), '# Switch user\n\nUse su $user when the source requires changing user.');
  await writeFile(path.join(knowledgeDir, 'items', 'generate.md'), '# Generate\n\nReuse a reviewed command pattern.');
  await writeFile(path.join(knowledgeDir, 'items', 'disabled.md'), '# Disabled');
  await writeFile(path.join(knowledgeDir, 'index.json'), JSON.stringify({
    version: 1,
    items: [
      { id: 'switch-user', title: 'Switch user', summary: 'Handle user switching explicitly.', path: 'items/switch-user.md', enabled: true, strength: 'must' },
      { id: 'generate', title: 'Generate', summary: 'Reuse a reviewed command pattern.', path: 'items/generate.md', enabled: true },
      { id: 'disabled', title: 'Disabled', summary: 'Should not appear.', path: 'items/disabled.md', enabled: false }
    ]
  }));

  const calls = [];
  const adapter = {
    async selectKnowledge(request) {
      calls.push(request);
      assert.deepEqual(request.candidates.map((entry) => entry.id), ['switch-user', 'generate']);
      return { configured: true, ids: ['switch-user', 'disabled', 'missing'] };
    }
  };

  const result = await retrieveKnowledge({ text: 'source text is not matched locally', adapter });
  assert.equal(calls.length, 1);
  assert.deepEqual(result.selectedIds, ['switch-user']);
  assert.match(result.selected[0].content, /Use su \$user/);

  const blocked = await persistKnowledgeItem({ title: 'Draft', content: 'body', confirmed: false });
  assert.equal(blocked.persisted, false);
  const saved = await persistKnowledgeItem({ title: 'Manual experience', content: '# Manual\n\nKeep this reviewable.', confirmed: true });
  assert.equal(saved.persisted, true);
  assert((await listKnowledgeSummaries()).some((item) => item.id === saved.item.id));
});
