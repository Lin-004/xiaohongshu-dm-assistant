import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConversationNotification } from '../src/notifier.js';

test('formatConversationNotification includes core fields', () => {
  const text = formatConversationNotification({
    conversationTitle: '测试用户',
    latestMessage: '请问这个怎么买',
    reply: '你好，这边可以先告诉我你想了解哪一款。',
    outcome: '已自动发送',
    reason: '示例原因'
  });

  assert.match(text, /会话: 测试用户/);
  assert.match(text, /用户消息:/);
  assert.match(text, /AI 回复:/);
  assert.match(text, /处理方式: 已自动发送/);
  assert.match(text, /原因: 示例原因/);
});
