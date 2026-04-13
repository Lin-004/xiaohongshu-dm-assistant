import { sendFeishuText } from './feishu.js';
import { logger } from './logger.js';
import { shortText } from './utils.js';

export function formatConversationNotification({
  conversationTitle,
  latestMessage,
  reply,
  outcome,
  reason
}) {
  const lines = [
    '小红书新私信',
    `会话: ${conversationTitle}`,
    `用户消息: ${shortText(latestMessage, 100)}`,
    `AI 回复: ${shortText(reply, 120)}`,
    `处理方式: ${outcome}`
  ];

  if (reason) {
    lines.push(`原因: ${reason}`);
  }

  return lines.join('\n');
}

export async function safeNotify(text, context = '飞书通知') {
  try {
    await sendFeishuText(text);
    return true;
  } catch (error) {
    logger.error(`${context}失败: ${error.message}`);
    return false;
  }
}
