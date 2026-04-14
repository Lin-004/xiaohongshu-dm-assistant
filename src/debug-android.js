import { getChannel } from './channel.js';
import { logger } from './logger.js';

async function main() {
  const channel = getChannel();
  if (channel.name !== 'android') {
    throw new Error('Android 调试工具只支持 android 通道。请先设置 XHS_CHANNEL=android。');
  }

  const runtime = await channel.createRuntime();
  logger.info(`Android 设备已连接: ${runtime.deviceId}`);
  logger.info('请确认小红书已经停留在消息列表页，然后按回车开始抓取。');

  await waitForEnter();
  const conversations = await channel.listUnreadConversations(runtime);

  logger.info(`识别到 ${conversations.length} 个会话候选`);
  conversations.forEach((conversation, index) => {
    logger.info(
      [
        `#${index + 1}`,
        `title=${conversation.title || ''}`,
        `unread=${conversation.unread}`,
        `text=${conversation.text || ''}`,
        `bounds=${formatBounds(conversation.bounds)}`
      ].join(' | ')
    );
  });

  const targetConversation = conversations.find((item) => item.unread) || conversations[0];
  if (!targetConversation) {
    logger.warn('当前列表没有解析到任何会话，已保留最近一次 UI dump 到 .data/android-ui-latest.xml');
    return;
  }

  logger.info(`准备打开会话: ${targetConversation.title || targetConversation.text}`);
  await channel.openConversation(runtime, targetConversation);
  await sleep(1200);

  const context = await channel.readConversationContext(runtime);
  logger.info(`会话标题: ${context.title}`);
  logger.info(`最近消息数: ${context.history.length}`);
  context.history.forEach((item, index) => {
    logger.info(`  ${index + 1}. ${item}`);
  });
  logger.info(`最新消息: ${context.latestMessage || '(空)'}`);
  logger.info('最近一次 Android UI dump 已保存到 .data/android-ui-latest.xml');
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

function formatBounds(bounds) {
  if (!bounds) {
    return 'none';
  }

  return `[${bounds.left},${bounds.top}][${bounds.right},${bounds.bottom}]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
