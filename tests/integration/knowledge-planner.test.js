import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function seedKnowledge() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cw-knowledge-planner-'));
  process.env.WORKBENCH_DIR = dir;
  const knowledgeDir = path.join(dir, 'knowledge');
  await mkdir(path.join(knowledgeDir, 'items'), { recursive: true });
  await writeFile(path.join(knowledgeDir, 'items', 'experience.md'), '# Experience\n\nPrefer explicit context switching when needed.');
  await writeFile(path.join(knowledgeDir, 'index.json'), JSON.stringify({
    version: 1,
    items: [{ id: 'experience', title: 'Experience', summary: 'Relevant generation experience.', path: 'items/experience.md', enabled: true, phases: ['decompose', 'generate'], isDeviceShell: false, strength: 'must' }]
  }));
}

test('planner selects knowledge summaries and injects selected markdown into adapter calls', async () => {
  await seedKnowledge();
  const { decomposeTestCase, generateItemDraft } = await import(`../../src/planner/extract.js?case=${Date.now()}`);
  const seen = [];
  const adapter = {
    async selectKnowledge(request) {
      seen.push({ task: 'selectKnowledge', phase: request.phase, candidates: request.candidates.map((item) => item.id) });
      return { configured: true, ids: ['experience'] };
    },
    async extractTestCase(text, context) {
      seen.push({ task: 'extractTestCase', knowledge: context.knowledge.map((item) => item.id), content: context.knowledge[0]?.content });
      return { configured: true, items: [{ type: 'step', sourceText: 'S1', intent: 'do S1', expected: 'ok', target: 'host' }] };
    },
    async matchSkill() { return { action: 'no_match' }; },
    async inferCommand(intent, context) {
      seen.push({ task: 'inferCommand', knowledge: context.knowledge.map((item) => item.id), content: context.knowledge[0]?.content });
      return 'echo from-knowledge-context';
    },
    async inferValidation() { return ''; }
  };

  const decomposed = await decomposeTestCase('raw input', { adapter });
  const generated = await generateItemDraft(decomposed.items[0], { adapter });

  assert.equal(generated.commandDraft.value, 'echo from-knowledge-context');
  assert.deepEqual(seen.filter((entry) => entry.task === 'selectKnowledge').map((entry) => entry.phase), ['decompose', 'generate']);
  assert.match(seen.find((entry) => entry.task === 'extractTestCase').content, /explicit context switching/);
  assert.match(seen.find((entry) => entry.task === 'inferCommand').content, /explicit context switching/);
});
