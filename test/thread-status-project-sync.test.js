import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildProjectDraftItems,
  parseThreadStatusMarkdown
} from '../src/thread-status-project-sync.js';

const statusFile = path.resolve('docs/thread-status.md');

test('thread status markdown can be parsed into project drafts', async () => {
  const markdown = await fs.readFile(statusFile, 'utf8');
  const parsed = parseThreadStatusMarkdown(markdown);
  const drafts = buildProjectDraftItems(parsed);

  assert.ok(parsed.currentStage.length > 0);
  assert.equal(parsed.unifiedConclusions.length >= 3, true);
  assert.equal(parsed.threadDetails['产品规划 / 主线程'].sections.length > 0, true);
  assert.equal(drafts.length, 10);
  assert.deepEqual(
    drafts.map((item) => item.title),
    [
      '[Current] Main / Product Planning',
      '[Next] Main / Product Planning',
      '[Current] Technical Planning',
      '[Next] Technical Planning',
      '[Current] Coding',
      '[Next] Coding',
      '[Current] Testing',
      '[Next] Testing',
      '[Current] Delivery',
      '[Next] Delivery'
    ]
  );
});
