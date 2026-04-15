import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutoSendDecision,
  getConversationStateKey,
  getMessageHash,
  getMessageIncrement,
  shouldRequireManualReview,
  validateAutoSendDraft
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
      history: ['你好', '资料发你了', '收到了', '还有吗']
    },
    {
      lastContextMessages: ['你好', '资料发你了']
    }
  );

  assert.deepEqual(increment, ['收到了', '还有吗']);
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
  const messageHashA = getMessageHash('你好', ['你好', '请问怎么收费']);
  const messageHashB = getMessageHash('你好', ['你好', '请问怎么收费']);

  assert.equal(stateKeyA, stateKeyB);
  assert.equal(messageHashA, messageHashB);
});

test('validateAutoSendDraft rejects blank or punctuation-only drafts', () => {
  assert.equal(validateAutoSendDraft('   ').valid, false);
  assert.equal(validateAutoSendDraft('!!!').valid, false);
  assert.equal(validateAutoSendDraft('你好').valid, true);
});

test('getAutoSendDecision blocks disabled, manual review, and duplicate send', () => {
  const disabled = getAutoSendDecision({
    autoSendEnabled: false,
    canSendReplies: true,
    pageState: 'conversation_detail',
    incrementMessages: ['你好'],
    reply: '收到',
    manualReason: null,
    record: null,
    messageHash: 'hash-a'
  });
  const manualReview = getAutoSendDecision({
    autoSendEnabled: true,
    canSendReplies: true,
    pageState: 'conversation_detail',
    incrementMessages: ['你好'],
    reply: '收到',
    manualReason: '命中人工审核',
    record: null,
    messageHash: 'hash-b'
  });
  const duplicate = getAutoSendDecision({
    autoSendEnabled: true,
    canSendReplies: true,
    pageState: 'conversation_detail',
    incrementMessages: ['你好'],
    reply: '收到',
    manualReason: null,
    record: {
      lastHandledMessageHash: 'hash-c'
    },
    messageHash: 'hash-c'
  });

  assert.equal(disabled.allowed, false);
  assert.equal(disabled.code, 'AUTO_SEND_DISABLED');
  assert.equal(manualReview.allowed, false);
  assert.equal(manualReview.code, 'AUTO_SEND_MANUAL_REVIEW_REQUIRED');
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.code, 'AUTO_SEND_DUPLICATED_INCREMENT');
});
