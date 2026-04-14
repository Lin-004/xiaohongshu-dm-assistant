import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  dumpUiHierarchy,
  ensureDeviceConnected,
  launchApp,
  tap
} from './android-adb.js';
import {
  extractConversationContext,
  extractConversationSummaries
} from './android-ui.js';

export const androidChannel = {
  name: 'android',
  capabilities: {
    sendReply: false
  },
  async createRuntime() {
    const runtime = {
      adbPath: config.android.adbPath,
      deviceId: config.android.deviceId,
      packageName: config.android.packageName,
      launcherActivity: config.android.launcherActivity
    };

    await ensureDeviceConnected(runtime);
    await launchApp(runtime);
    return runtime;
  },
  async closeRuntime() {},
  async listUnreadConversations(runtime) {
    const xml = await dumpUiHierarchy(runtime);
    const conversations = extractConversationSummaries(xml);

    logger.info(`Android 通道识别到 ${conversations.length} 个会话候选`);
    return conversations;
  },
  async openConversation(runtime, conversation) {
    if (!conversation?.bounds) {
      throw new Error('Android 会话缺少可点击区域，无法打开。');
    }

    await tap(runtime, conversation.bounds.centerX, conversation.bounds.centerY);
  },
  async readConversationContext(runtime) {
    const xml = await dumpUiHierarchy(runtime);
    return extractConversationContext(
      xml,
      config.xiaohongshu.messageHistoryLimit
    );
  },
  async sendReply() {
    throw new Error(
      'Android 通道当前处于第二阶段，仅支持监控、读取和生成草稿，不支持自动发送。'
    );
  }
};
