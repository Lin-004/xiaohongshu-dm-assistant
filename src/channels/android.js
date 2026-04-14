import { config } from '../config.js';
import { logger } from '../logger.js';
import { normalizeText, sleep } from '../utils.js';
import {
  dumpUiHierarchy,
  ensureDeviceConnected,
  launchApp,
  pressBack,
  tap
} from './android-adb.js';
import { AndroidChannelError, androidErrorCodes } from './android-errors.js';
import { detectAndroidPageState } from './android-page-state.js';
import {
  extractConversationContext,
  extractConversationSummaries,
  findBottomTabBounds
} from './android-ui.js';

const listRecoveryAttempts = 3;
const detailConfirmAttempts = 4;
const navigationDelayMs = 900;

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
    const xml = await ensureConversationListPage(runtime);
    const conversations = extractConversationSummaries(xml);

    if (!conversations.length) {
      throw new AndroidChannelError(
        androidErrorCodes.listParseFailed,
        '当前页面已识别为会话列表，但没有解析到任何会话。',
        { pageState: detectAndroidPageState(xml) }
      );
    }

    logger.info(`Android 通道识别到 ${conversations.length} 个会话候选`);
    return conversations;
  },
  async openConversation(runtime, conversation) {
    if (!conversation?.bounds) {
      throw new AndroidChannelError(
        androidErrorCodes.clickNavigationFailed,
        'Android 会话缺少可点击区域，无法打开。'
      );
    }

    await ensureConversationListPage(runtime);
    await tap(runtime, conversation.bounds.centerX, conversation.bounds.centerY);
    await confirmConversationDetailPage(runtime, conversation);
  },
  async readConversationContext(runtime) {
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);

    if (pageState.state !== 'conversation_detail') {
      throw new AndroidChannelError(
        androidErrorCodes.detailParseFailed,
        `当前页面不是会话详情页，实际状态: ${pageState.state}`,
        { pageState }
      );
    }

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

async function ensureConversationListPage(runtime) {
  let lastState = null;

  for (let attempt = 0; attempt < listRecoveryAttempts; attempt += 1) {
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);
    lastState = pageState;

    if (pageState.state === 'conversation_list') {
      return xml;
    }

    if (
      pageState.state === 'conversation_detail' ||
      pageState.state === 'blocked_by_popup'
    ) {
      logger.warn(`Android 当前不在会话列表页，尝试恢复: ${pageState.state}`);
      await pressBack(runtime);
      await sleep(800);
      continue;
    }

    if (pageState.state === 'unknown') {
      const messageTabBounds = findBottomTabBounds(xml, '消息');
      if (messageTabBounds) {
        logger.warn('Android 当前不在消息列表页，尝试点击底部消息 Tab');
        await tap(runtime, messageTabBounds.centerX, messageTabBounds.centerY);
        await sleep(1000);
        continue;
      }
    }

    break;
  }

  throw new AndroidChannelError(
    lastState?.state === 'unknown'
      ? androidErrorCodes.unknownPage
      : androidErrorCodes.listParseFailed,
    `无法进入会话列表页，当前状态: ${lastState?.state || 'unknown'}`,
    { pageState: lastState }
  );
}

async function confirmConversationDetailPage(runtime, conversation) {
  const expectedTitle = normalizeConversationTitleForMatch(
    conversation.title || conversation.text
  );
  let lastState = null;

  for (let attempt = 0; attempt < detailConfirmAttempts; attempt += 1) {
    await sleep(navigationDelayMs);
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);
    const context = extractConversationContext(
      xml,
      config.xiaohongshu.messageHistoryLimit
    );
    lastState = {
      ...pageState,
      contextTitle: context.title
    };

    if (
      pageState.state === 'conversation_detail' &&
      isExpectedConversationTitle(expectedTitle, context.title)
    ) {
      return;
    }

    if (pageState.state === 'blocked_by_popup') {
      await pressBack(runtime);
      await sleep(600);
      await tap(runtime, conversation.bounds.centerX, conversation.bounds.centerY);
      continue;
    }

    if (pageState.state === 'conversation_list') {
      const latestBounds = findConversationBounds(xml, conversation, expectedTitle);
      const targetBounds = latestBounds || conversation.bounds;
      await tap(runtime, targetBounds.centerX, targetBounds.centerY);
    }
  }

  throw new AndroidChannelError(
    androidErrorCodes.clickNavigationFailed,
    `打开会话失败: ${expectedTitle || '未知会话'}`,
    { pageState: lastState, conversation }
  );
}

function isExpectedConversationTitle(expectedTitle, actualTitle) {
  const expected = normalizeConversationTitleForMatch(expectedTitle);
  const actual = normalizeConversationTitleForMatch(actualTitle);

  if (!expected || !actual) {
    return false;
  }

  return actual.includes(expected) || expected.includes(actual);
}

function findConversationBounds(xml, conversation, expectedTitle) {
  const conversations = extractConversationSummaries(xml);
  const expected = expectedTitle || normalizeConversationTitleForMatch(conversation.title);
  const expectedText = normalizeConversationTitleForMatch(conversation.text);

  const matchedConversation = conversations.find((item) => {
    const itemTitle = normalizeConversationTitleForMatch(item.title);
    const itemText = normalizeConversationTitleForMatch(item.text);

    return (
      (expected && (itemTitle.includes(expected) || expected.includes(itemTitle))) ||
      (expectedText &&
        (itemText.includes(expectedText) || expectedText.includes(itemText)))
    );
  });

  return matchedConversation?.bounds || null;
}

function normalizeConversationTitleForMatch(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/&#(x?[0-9a-fA-F]+);/g, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}
