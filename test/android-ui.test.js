import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAndroidPageState } from '../src/channels/android-page-state.js';
import {
  extractConversationContext,
  extractConversationSummaries,
  findBottomTabBounds,
  findMessageInputBounds,
  findMessageInputState,
  findSendButtonBounds,
  parseUiHierarchy,
  summarizeUiTexts
} from '../src/channels/android-ui.js';

const conversationListXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="消息" bounds="[0,0][1080,120]"></node>
    <node index="1" text="" clickable="true" bounds="[0,180][1080,360]">
      <node index="0" text="品牌方" bounds="[48,210][380,260]"></node>
      <node index="1" text="你好，想合作一个视频" bounds="[48,270][620,320]"></node>
      <node index="2" text="1" bounds="[980,230][1030,280]"></node>
    </node>
    <node index="2" text="" clickable="true" bounds="[0,360][1080,540]">
      <node index="0" text="普通用户" bounds="[48,390][380,440]"></node>
      <node index="1" text="在吗" bounds="[48,450][280,500]"></node>
    </node>
  </node>
</hierarchy>`;

const conversationDetailXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="品牌方" bounds="[320,78][760,148]"></node>
    <node index="1" text="你好" bounds="[120,520][280,580]"></node>
    <node index="2" text="想合作一个视频" bounds="[700,700][980,760]"></node>
    <node index="3" text="发消息…" bounds="[120,2200][860,2320]"></node>
  </node>
</hierarchy>`;

const ambiguousConversationListXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="消息" bounds="[0,0][1080,120]"></node>
    <node index="1" text="" clickable="true" bounds="[0,180][1080,360]">
      <node index="0" text="小红薯9816158" bounds="[48,210][420,250]"></node>
      <node index="1" text="最后一条" bounds="[48,272][280,320]"></node>
      <node index="2" text="2" bounds="[980,230][1030,280]"></node>
    </node>
  </node>
</hierarchy>`;

const emojiConversationDetailXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="A小邱&#128536;" bounds="[320,78][760,148]"></node>
    <node index="1" text="你好呀" bounds="[120,520][320,580]"></node>
    <node index="2" text="发消息…" bounds="[930,2240][1040,2320]"></node>
  </node>
</hierarchy>`;

const blockedPopupXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="消息" bounds="[420,80][660,140]"></node>
    <node index="1" text="允许小红书发送通知吗" bounds="[180,760][900,860]"></node>
    <node index="2" text="暂不开启" clickable="true" bounds="[180,980][500,1080]"></node>
    <node index="3" text="允许" clickable="true" bounds="[580,980][900,1080]"></node>
  </node>
</hierarchy>`;

const unknownPageXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="首页" bounds="[420,80][660,140]"></node>
    <node index="1" text="推荐" bounds="[120,260][280,320]"></node>
    <node index="2" text="发现更多内容" bounds="[120,420][620,500]"></node>
    <node index="3" text="" clickable="true" bounds="[720,2240][980,2380]">
      <node index="0" text="消息" bounds="[780,2280][900,2340]"></node>
    </node>
  </node>
</hierarchy>`;

test('parseUiHierarchy builds descendants from xml dump', () => {
  const tree = parseUiHierarchy(conversationListXml);
  assert.ok(tree.descendants.length >= 5);
});

test('extractConversationSummaries finds conversation rows and unread state', () => {
  const conversations = extractConversationSummaries(conversationListXml);

  assert.equal(conversations.length, 2);
  assert.equal(conversations[0].title, '品牌方');
  assert.equal(conversations[0].unread, true);
  assert.equal(conversations[0].unreadCount, 1);
  assert.equal(conversations[1].unread, false);
  assert.equal(conversations[1].unreadCount, null);
});

test('extractConversationSummaries prefers top-line title over last-message summary', () => {
  const conversations = extractConversationSummaries(ambiguousConversationListXml);

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].title, '小红薯9816158');
  assert.equal(conversations[0].unreadCount, 2);
});

test('extractConversationContext reads title and recent message history', () => {
  const context = extractConversationContext(conversationDetailXml, 8);

  assert.equal(context.title, '品牌方');
  assert.deepEqual(context.history, ['你好', '想合作一个视频']);
  assert.equal(context.latestMessage, '想合作一个视频');
});

test('extractConversationContext decodes numeric entities in conversation title', () => {
  const context = extractConversationContext(emojiConversationDetailXml, 8);

  assert.equal(context.title, 'A小邱😘');
});

test('summarizeUiTexts exposes visible text snippets for dump inspection', () => {
  const summary = summarizeUiTexts(conversationListXml, 3);

  assert.equal(summary.length, 3);
  assert.equal(summary[0].text, '消息');
  assert.equal(summary[1].text, '品牌方');
});

test('detectAndroidPageState identifies conversation list page', () => {
  const pageState = detectAndroidPageState(conversationListXml);

  assert.equal(pageState.state, 'conversation_list');
  assert.equal(pageState.signals.conversationCount, 2);
});

test('detectAndroidPageState identifies conversation detail page', () => {
  const pageState = detectAndroidPageState(conversationDetailXml);

  assert.equal(pageState.state, 'conversation_detail');
  assert.equal(pageState.topTitle, '品牌方');
});

test('detectAndroidPageState identifies blocked popup page', () => {
  const pageState = detectAndroidPageState(blockedPopupXml);

  assert.equal(pageState.state, 'blocked_by_popup');
  assert.deepEqual(pageState.signals.popupTexts, ['暂不开启', '允许']);
});

test('detectAndroidPageState falls back to unknown page', () => {
  const pageState = detectAndroidPageState(unknownPageXml);

  assert.equal(pageState.state, 'unknown');
});

test('findBottomTabBounds finds bottom message tab action area', () => {
  const bounds = findBottomTabBounds(unknownPageXml, '消息');

  assert.ok(bounds);
  assert.equal(bounds.centerX, 850);
  assert.equal(bounds.centerY, 2310);
});

test('findMessageInputBounds and send button bounds detect composer controls', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" bounds="[0,0][1080,2400]">
    <node index="0" text="测试用户" bounds="[320,78][760,148]"></node>
    <node index="1" text="你好" bounds="[120,520][280,580]"></node>
    <node index="2" text="发消息…" class="android.widget.EditText" focusable="true" bounds="[48,2200][860,2330]"></node>
    <node index="3" text="发送" clickable="true" bounds="[900,2190][1040,2330]"></node>
  </node>
</hierarchy>`;

  const inputBounds = findMessageInputBounds(xml);
  const inputState = findMessageInputState(xml);
  const sendBounds = findSendButtonBounds(xml);

  assert.ok(inputBounds);
  assert.equal(inputState?.isEmpty, true);
  assert.ok(sendBounds);
});
