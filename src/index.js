import { config, validateRuntimeConfig } from './config.js';
import { generateReply } from './llm.js';
import { logger } from './logger.js';
import { loadState, saveState } from './state-store.js';
import {
  formatConversationNotification,
  safeNotify
} from './notifier.js';
import {
  getConversationStateKey,
  getMessageHash,
  shouldRequireManualReview
} from './policy.js';
import {
  createInboxPage,
  launchBrowser,
  openConversation,
  readConversationContext,
  readUnreadConversations,
  sendReply
} from './xiaohongshu.js';
import {
  nowIso,
  sleep
} from './utils.js';

async function main() {
  const configErrors = validateRuntimeConfig();
  if (configErrors.length) {
    throw new Error(`配置缺失: ${configErrors.join('，')}`);
  }

  const state = await loadState();
  const context = await launchBrowser();
  const page = await createInboxPage(context);
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

  logger.info('小红书私信监听已启动');
  logger.info(`自动发送: ${config.xiaohongshu.autoSendReply ? '开启' : '关闭'}`);

  while (!stopped) {
    try {
      await monitorOnce(page, state);
    } catch (error) {
      logger.error(`轮询失败: ${error.message}`);
      await safeNotify(`小红书私信监听异常\n错误: ${error.message}`, '监听异常通知');
    } finally {
      await saveState(state);
    }

    await sleep(config.xiaohongshu.pollIntervalMs);
  }

  await saveState(state);
  await context.close();
  logger.info('监听器已退出');
}

async function monitorOnce(page, state) {
  const conversations = await readUnreadConversations(page);
  const unreadConversations = conversations.filter((item) => item.unread);

  if (!unreadConversations.length) {
    logger.info('本轮没有发现未读私信');
    return;
  }

  logger.info(`发现 ${unreadConversations.length} 个未读会话`);

  for (const conversation of unreadConversations) {
    await openConversation(page, conversation.index);
    const context = await readConversationContext(page);

    if (!context.latestMessage) {
      logger.warn(`跳过空消息会话: ${conversation.text}`);
      continue;
    }

    const conversationStateKey = getConversationStateKey(context.title, conversation.text);
    const messageHash = getMessageHash(context.latestMessage, context.history);
    const record = state.conversations[conversationStateKey];

    try {
      if (record?.lastHandledMessageHash === messageHash) {
        logger.info(`消息已处理，跳过: ${context.title}`);
        continue;
      }

      const manualReason = shouldRequireManualReview(context, record);
      const reply = await generateReply({
        conversationTitle: context.title,
        latestMessage: context.latestMessage,
        history: context.history
      });

      if (manualReason) {
        logger.warn(`转人工检查: ${context.title} - ${manualReason}`);
        await safeNotify(
          formatConversationNotification({
            conversationTitle: context.title,
            latestMessage: context.latestMessage,
            reply,
            outcome: '转人工',
            reason: manualReason
          }),
          '人工转交通知'
        );

        state.conversations[conversationStateKey] = {
          lastHandledMessageHash: messageHash,
          lastHandledAt: nowIso(),
          lastReplyText: reply,
          mode: 'manual-review'
        };
        continue;
      }

      let delivery = '仅生成';
      let mode = 'draft-only';

      if (config.xiaohongshu.autoSendReply) {
        await sendReply(page, reply);
        delivery = '已自动发送';
        mode = 'auto-send';
      }

      await safeNotify(
        formatConversationNotification({
          conversationTitle: context.title,
          latestMessage: context.latestMessage,
          reply,
          outcome: delivery
        }),
        '正常回复通知'
      );

      logger.info(`${delivery}: ${context.title}`);
      state.conversations[conversationStateKey] = {
        lastHandledMessageHash: messageHash,
        lastHandledAt: nowIso(),
        lastReplyText: reply,
        mode
      };
    } catch (error) {
      logger.error(`处理会话失败: ${context.title} - ${error.message}`);
      await safeNotify(
        `小红书私信处理异常\n会话: ${context.title}\n用户消息: ${context.latestMessage}\n错误: ${error.message}`,
        '单会话异常通知'
      );
    } finally {
      await saveState(state);
    }
  }
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
