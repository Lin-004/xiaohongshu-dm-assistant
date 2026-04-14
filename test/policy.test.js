import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConversationStateKey,
  getMessageHash,
  getMessageIncrement,
  shouldRequireManualReview
} from '../src/policy.js';

test('manual review for business cooperation keywords', () => {
  const reason = shouldRequireManualReview({
    title: '品牌方',
    latestMessage: '你好，想找你合作投放，方便报个价吗',
    history: ['你好']
  });

  assert.match(reason, /business|pricing/);
});

test('manual review for complaint or off-platform contact keywords', () => {
  const complaintReason = shouldRequireManualReview({
    title: '用户A',
    latestMessage: '我要投诉你们，准备起诉',
    history: []
  });
  const contactReason = shouldRequireManualReview({
    title: '用户B',
    latestMessage: '加个微信聊吧',
    history: []
  });

  assert.match(complaintReason, /complaint/);
  assert.match(contactReason, /offPlatform/);
});

test('cooldown blocks repeated auto replies', () => {
  const reason = shouldRequireManualReview(
    {
      title: '用户C',
      latestMessage: '还在吗',
      history: ['你好']
    },
    {
      lastHandledAt: '2026-04-14T00:00:00.000Z'
    },
    '2026-04-14T00:10:00.000Z'
  );

  assert.match(reason, /冷却时间/);
});

test('getMessageIncrement returns all messages on first handle', () => {
  const increment = getMessageIncrement(
    {
      history: ['你好', '在吗']
    },
    null
  );

  assert.deepEqual(increment, ['你好', '在吗']);
});

test('getMessageIncrement limits first-handle increment by unread count', () => {
  const increment = getMessageIncrement(
    {
      history: ['hello', 'hi', '怎么不回我信息', '刚刚', '测试测试']
    },
    null,
    {
      unreadCount: 1
    }
  );

  assert.deepEqual(increment, ['测试测试']);
});

test('getMessageIncrement returns appended suffix when history extends', () => {
  const increment = getMessageIncrement(
    {
      history: ['你好', '资料发你了', '收到', '还有吗']
    },
    {
      lastContextMessages: ['你好', '资料发你了']
    }
  );

  assert.deepEqual(increment, ['收到', '还有吗']);
});

test('getMessageIncrement returns empty array when no new messages exist', () => {
  const increment = getMessageIncrement(
    {
      history: ['你好', '在吗']
    },
    {
      lastContextMessages: ['你好', '在吗']
    }
  );

  assert.deepEqual(increment, []);
});

test('conversation key and message hash are stable', () => {
  const stateKeyA = getConversationStateKey('张三', '你好');
  const stateKeyB = getConversationStateKey('张三', '你好');
  const messageHashA = getMessageHash('你好', ['你好', '请问怎么卖']);
  const messageHashB = getMessageHash('你好', ['你好', '请问怎么卖']);

  assert.equal(stateKeyA, stateKeyB);
  assert.equal(messageHashA, messageHashB);
});
