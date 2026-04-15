import { pathToFileURL } from 'node:url';
import { getChannel } from './channel.js';
import { config, validateRuntimeConfig } from './config.js';
import { generateReply } from './llm.js';
import { logger } from './logger.js';
import {
  formatConversationNotification,
  safeNotify
} from './notifier.js';
import {
  getAutoSendDecision,
  getConversationStateKey,
  getMessageHash,
  getMessageIncrement,
  shouldRequireManualReview
} from './policy.js';
import { loadState, saveState } from './state-store.js';
import { nowIso, sleep } from './utils.js';

export async function main() {
  const configErrors = validateRuntimeConfig();
  if (configErrors.length) {
    throw new Error(`配置缺失: ${configErrors.join('，')}`);
  }

  const state = await loadState();
  const channel = getChannel();
  const runtime = await channel.createRuntime();
  const canSendReplies = channel.capabilities?.sendReply !== false;
  let stopped = false;

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (stopped) {
        return;
      }

      stopped = true;
      logger.info(`收到 ${signal}，准备安全退出`);
    });
  }

  logger.info(`小红书私信监听已启动，当前通道: ${channel.name}`);
  if (config.xiaohongshu.autoSendReply && !canSendReplies) {
    logger.warn('当前通道不支持自动发送，将退化为仅生成 AI 草稿。');
  }
  logger.info(
    `自动发送: ${
      config.xiaohongshu.autoSendReply && canSendReplies ? '开启' : '关闭'
    }`
  );

  while (!stopped) {
    try {
      await monitorOnce(channel, runtime, state);
    } catch (error) {
      logger.error(`轮询失败: ${error.message}`);
      await safeNotify(
        `小红书私信监听异常\n错误: ${error.message}`,
        '监听异常通知'
      );
    } finally {
      await saveState(state);
    }

    await sleep(config.xiaohongshu.pollIntervalMs);
  }

  await saveState(state);
  await channel.closeRuntime(runtime);
  logger.info('监听器已退出');
}

export async function monitorOnce(channel, runtime, state) {
  const canSendReplies = channel.capabilities?.sendReply !== false;
  let processedCount = 0;

  while (true) {
    const conversations = await channel.listUnreadConversations(runtime);
    const unreadConversations = conversations.filter((item) => item.unread);
    const conversation = unreadConversations[0];

    if (!conversation) {
      if (processedCount === 0) {
        logger.info('本轮没有发现未读私信');
      } else {
        logger.info(`本轮处理完成，共处理 ${processedCount} 个候选会话`);
      }
      return;
    }

    if (processedCount === 0) {
      logger.info(`发现 ${unreadConversations.length} 个未读会话`);
    } else {
      logger.info(`重新抓取列表后，剩余 ${unreadConversations.length} 个未读会话`);
    }

    await handleConversation(channel, runtime, state, conversation, canSendReplies);
    processedCount += 1;
  }
}

async function handleConversation(
  channel,
  runtime,
  state,
  conversation,
  canSendReplies
) {
  await channel.openConversation(runtime, conversation);
  const context = await channel.readConversationContext(runtime);

  if (!context.latestMessage) {
    logger.warn(`跳过空消息会话: ${conversation.text}`);
    return;
  }

  const conversationStateKey = getConversationStateKey(
    context.title,
    conversation.text
  );
  const record = state.conversations[conversationStateKey];
  const incrementMessages = getMessageIncrement(context, record, {
    unreadCount: conversation.unreadCount
  });

  if (!incrementMessages.length) {
    logger.info(`候选会话没有新增消息，跳过: ${context.title}`);
    state.conversations[conversationStateKey] = buildObservedConversationRecord({
      record,
      context,
      mode: record?.mode || 'draft-only'
    });
    return;
  }

  const aggregatedMessage = incrementMessages.join('\n');
  const replyContext = {
    ...context,
    latestMessage: aggregatedMessage
  };
  const messageHash = getMessageHash(aggregatedMessage, incrementMessages);

  try {
    if (record?.lastHandledMessageHash === messageHash) {
      logger.info(`消息增量已处理，跳过: ${context.title}`);
      state.conversations[conversationStateKey] = buildObservedConversationRecord({
        record,
        context,
        mode: record?.mode || 'draft-only'
      });
      return;
    }

    const manualReason = shouldRequireManualReview(replyContext, record);
    const reply = await generateReply({
      conversationTitle: replyContext.title,
      latestMessage: replyContext.latestMessage,
      history: replyContext.history
    });

    if (manualReason) {
      logger.warn(`转人工检查: ${context.title} - ${manualReason}`);
      await safeNotify(
        formatConversationNotification({
          conversationTitle: replyContext.title,
          latestMessage: replyContext.latestMessage,
          reply,
          outcome: '转人工',
          reason: manualReason
        }),
        '人工转交通知'
      );

      state.conversations[conversationStateKey] = buildConversationRecord({
        record,
        context,
        messageHash,
        reply,
        mode: 'manual-review',
        sendState: {
          result: 'skipped',
          attemptedAt: '',
          failureCode: ''
        }
      });
      return;
    }

    const autoSendDecision = getAutoSendDecision({
      autoSendEnabled: config.xiaohongshu.autoSendReply,
      canSendReplies,
      pageState: 'conversation_detail',
      incrementMessages,
      reply,
      manualReason,
      record,
      messageHash
    });

    let delivery = '仅生成';
    let mode = 'draft-only';
    let sendState = {
      result: 'skipped',
      attemptedAt: '',
      failureCode: ''
    };

    if (autoSendDecision.allowed) {
      sendState.attemptedAt = nowIso();

      try {
        await channel.sendReply(runtime, reply);
        delivery = '已自动发送';
        mode = 'auto-send';
        sendState.result = 'success';
      } catch (sendError) {
        const failureCode = sendError.code || 'SEND_FAILED';
        logger.error(
          `自动发送失败: ${context.title} - ${failureCode}: ${sendError.message}`
        );
        await safeNotify(
          formatConversationNotification({
            conversationTitle: replyContext.title,
            latestMessage: replyContext.latestMessage,
            reply,
            outcome: '转人工',
            reason: `自动发送失败: ${failureCode}`
          }),
          '自动发送失败通知'
        );

        state.conversations[conversationStateKey] = buildConversationRecord({
          record,
          context,
          reply,
          mode: 'auto-send-failed',
          sendState: {
            result: 'failed',
            attemptedAt: sendState.attemptedAt,
            failureCode
          }
        });
        return;
      }
    } else if (config.xiaohongshu.autoSendReply) {
      logger.info(
        `自动发送未命中前置条件，退化为草稿通知: ${context.title} - ${autoSendDecision.code}`
      );
    }

    await safeNotify(
      formatConversationNotification({
        conversationTitle: replyContext.title,
        latestMessage: replyContext.latestMessage,
        reply,
        outcome: delivery
      }),
      '正常回复通知'
    );

    logger.info(`${delivery}: ${context.title}`);
    state.conversations[conversationStateKey] = buildConversationRecord({
      record,
      context,
      messageHash,
      reply,
      mode,
      sendState
    });
  } catch (error) {
    logger.error(`处理会话失败: ${context.title} - ${error.message}`);
    await safeNotify(
      [
        '小红书私信处理异常',
        `会话: ${context.title}`,
        `用户消息: ${aggregatedMessage}`,
        `错误: ${error.message}`
      ].join('\n'),
      '单会话异常通知'
    );
  } finally {
    await saveState(state);
  }
}

function buildConversationRecord({
  record,
  context,
  messageHash,
  reply,
  mode,
  sendState
}) {
  return {
    ...record,
    lastHandledMessageHash: messageHash || record?.lastHandledMessageHash || '',
    lastHandledAt: nowIso(),
    lastReplyText: reply ?? record?.lastReplyText ?? '',
    lastContextMessages: [...(context.history || [])],
    lastSendAttemptAt: sendState?.attemptedAt || record?.lastSendAttemptAt || '',
    lastSendResult: sendState?.result || record?.lastSendResult || 'skipped',
    lastSendFailureCode: sendState?.failureCode || '',
    mode
  };
}

function buildObservedConversationRecord({ record, context, mode }) {
  return {
    ...record,
    lastContextMessages: [...(context.history || [])],
    mode: mode ?? record?.mode
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logger.error(error.message);
    process.exitCode = 1;
  });
}
