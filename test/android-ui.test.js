import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractConversationContext,
  extractConversationSummaries,
  parseUiHierarchy,
  summarizeUiTexts
} from '../src/channels/android-ui.js';

const conversationListXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="消息" bounds="[0,0][1080,120]"></node>
    <node index="1" text="" clickable="true" bounds="[0,180][1080,360]">
      <node index="0" text="品牌方A" bounds="[48,210][380,260]"></node>
      <node index="1" text="你好，想合作一下" bounds="[48,270][620,320]"></node>
      <node index="2" text="1" bounds="[980,230][1030,280]"></node>
    </node>
    <node index="2" text="" clickable="true" bounds="[0,360][1080,540]">
      <node index="0" text="普通用户B" bounds="[48,390][380,440]"></node>
      <node index="1" text="在吗" bounds="[48,450][280,500]"></node>
    </node>
  </node>
</hierarchy>`;

const conversationDetailXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="品牌方A" bounds="[320,78][760,148]"></node>
    <node index="1" text="你好" bounds="[120,520][280,580]"></node>
    <node index="2" text="想合作一下" bounds="[700,700][980,760]"></node>
    <node index="3" text="发送" bounds="[930,2240][1040,2320]"></node>
  </node>
</hierarchy>`;

test('parseUiHierarchy builds descendants from xml dump', () => {
  const tree = parseUiHierarchy(conversationListXml);
  assert.ok(tree.descendants.length >= 5);
});

test('extractConversationSummaries finds conversation rows and unread state', () => {
  const conversations = extractConversationSummaries(conversationListXml);

  assert.equal(conversations.length, 2);
  assert.equal(conversations[0].title, '品牌方A');
  assert.equal(conversations[0].unread, true);
  assert.equal(conversations[1].unread, false);
});

test('extractConversationContext reads title and recent message history', () => {
  const context = extractConversationContext(conversationDetailXml, 8);

  assert.equal(context.title, '品牌方A');
  assert.deepEqual(context.history, ['你好', '想合作一下']);
  assert.equal(context.latestMessage, '想合作一下');
});

test('summarizeUiTexts exposes visible text snippets for dump inspection', () => {
  const summary = summarizeUiTexts(conversationListXml, 3);

  assert.equal(summary.length, 3);
  assert.equal(summary[0].text, '消息');
  assert.equal(summary[1].text, '品牌方A');
});
