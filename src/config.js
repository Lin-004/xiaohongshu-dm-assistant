import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defaultSelectors } from './selectors.js';

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return value
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsv(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnum(value, allowedValues, fallback) {
  if (!value) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

const dataDir = path.resolve('.data');
const inboxUrlFile = path.join(dataDir, 'last-inbox-url.txt');

function resolveInboxUrl() {
  if (process.env.XHS_INBOX_URL) {
    return process.env.XHS_INBOX_URL;
  }

  try {
    const storedUrl = fs.readFileSync(inboxUrlFile, 'utf8').trim();
    if (storedUrl) {
      return storedUrl;
    }
  } catch {
    // Ignore missing runtime file and fall back to the homepage.
  }

  return 'https://www.xiaohongshu.com';
}

export const config = {
  paths: {
    dataDir,
    browserUserDataDir: path.join(dataDir, 'browser-profile'),
    stateFile: path.join(dataDir, 'state.json'),
    inboxUrlFile
  },
  channel: {
    provider: parseEnum(process.env.XHS_CHANNEL, ['web', 'android'], 'android')
  },
  xiaohongshu: {
    inboxUrl: resolveInboxUrl(),
    browserChannel: process.env.XHS_BROWSER_CHANNEL || 'msedge',
    headless: parseBoolean(process.env.XHS_HEADLESS, false),
    pollIntervalMs: parseNumber(process.env.XHS_POLL_INTERVAL_MS, 20000),
    maxConversations: parseNumber(process.env.XHS_MAX_CONVERSATIONS, 20),
    autoSendReply: parseBoolean(process.env.XHS_AUTO_SEND_REPLY, false),
    minReplyIntervalMinutes: parseNumber(
      process.env.XHS_MIN_REPLY_INTERVAL_MINUTES,
      30
    ),
    replyCooldownMinutes: parseNumber(
      process.env.XHS_REPLY_COOLDOWN_MINUTES,
      30
    ),
    messageHistoryLimit: parseNumber(process.env.XHS_MESSAGE_HISTORY_LIMIT, 8),
    manualReviewKeywords: parseCsv(process.env.XHS_MANUAL_REVIEW_KEYWORDS, [
      '合作',
      '商务',
      '联名',
      '达人',
      '投放',
      '报价',
      '多少钱',
      '怎么收费',
      '收费标准',
      '预算',
      '价格',
      '退款',
      '投诉',
      '举报',
      '侵权',
      '律师',
      '起诉',
      '维权',
      '差评',
      '加微信',
      '微信',
      'vx',
      '手机号'
    ])
  },
  android: {
    adbPath: process.env.ANDROID_ADB_PATH || 'adb',
    deviceId: process.env.ANDROID_DEVICE_ID || '',
    packageName: process.env.ANDROID_PACKAGE_NAME || 'com.xingin.xhs',
    launcherActivity: process.env.ANDROID_LAUNCHER_ACTIVITY || '',
    inputStrategy: parseEnum(
      process.env.ANDROID_INPUT_STRATEGY,
      ['adb_keyboard'],
      'adb_keyboard'
    ),
    adbKeyboardEnabled: parseBoolean(
      process.env.ANDROID_ADB_KEYBOARD_ENABLED,
      true
    ),
    adbKeyboardIme:
      process.env.ANDROID_ADB_KEYBOARD_IME || 'com.android.adbkeyboard/.AdbIME',
    tier1VisibleScreens: parseNumber(process.env.ANDROID_TIER1_VISIBLE_SCREENS, 1),
    tier2ExtraScreens: parseNumber(process.env.ANDROID_TIER2_EXTRA_SCREENS, 1),
    tier1ToTier2Quota: parseNumber(process.env.ANDROID_TIER1_TO_TIER2_QUOTA, 4)
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4.1-mini',
    temperature: parseNumber(process.env.LLM_TEMPERATURE, 0.4),
    systemPrompt:
      process.env.LLM_SYSTEM_PROMPT ||
      '你是个人小红书账号的私信助理。请用简洁、礼貌、像真人的中文回复，不承诺做不到的事，不输出 markdown，不要显得像机器人。'
  },
  feishu: {
    mode: parseEnum(process.env.FEISHU_MODE, ['auto', 'app', 'webhook'], 'auto'),
    apiBaseUrl: process.env.FEISHU_API_BASE_URL || 'https://open.feishu.cn/open-apis',
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    receiveId: process.env.FEISHU_RECEIVE_ID || '',
    receiveIdType: parseEnum(
      process.env.FEISHU_RECEIVE_ID_TYPE,
      ['open_id', 'user_id', 'union_id', 'email', 'chat_id'],
      'open_id'
    ),
    webhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
    webhookSecret: process.env.FEISHU_WEBHOOK_SECRET || ''
  },
  selectors: {
    conversationItems: parseList(
      process.env.XHS_CONVERSATION_ITEM_SELECTORS,
      defaultSelectors.conversationItems
    ),
    unreadBadge: parseList(
      process.env.XHS_UNREAD_BADGE_SELECTORS,
      defaultSelectors.unreadBadge
    ),
    messageRows: parseList(
      process.env.XHS_MESSAGE_ROW_SELECTORS,
      defaultSelectors.messageRows
    ),
    messageInput: parseList(
      process.env.XHS_MESSAGE_INPUT_SELECTORS,
      defaultSelectors.messageInput
    ),
    sendButton: parseList(
      process.env.XHS_SEND_BUTTON_SELECTORS,
      defaultSelectors.sendButton
    )
  }
};

export function validateRuntimeConfig() {
  const errors = [];

  if (!config.llm.apiKey) {
    errors.push('缺少 LLM_API_KEY');
  }

  const feishuMode = resolveFeishuMode();

  if (feishuMode === 'app') {
    if (!config.feishu.appId) {
      errors.push('缺少 FEISHU_APP_ID');
    }

    if (!config.feishu.appSecret) {
      errors.push('缺少 FEISHU_APP_SECRET');
    }

    if (!config.feishu.receiveId) {
      errors.push('缺少 FEISHU_RECEIVE_ID');
    }
  } else if (feishuMode === 'webhook') {
    if (!config.feishu.webhookUrl) {
      errors.push('缺少 FEISHU_WEBHOOK_URL');
    }
  } else {
    errors.push(
      '缺少飞书通知配置：请配置 FEISHU_APP_ID/FEISHU_APP_SECRET/FEISHU_RECEIVE_ID，或配置 FEISHU_WEBHOOK_URL'
    );
  }

  return errors;
}

export function resolveFeishuMode() {
  if (config.feishu.mode === 'app' || config.feishu.mode === 'webhook') {
    return config.feishu.mode;
  }

  if (config.feishu.appId && config.feishu.appSecret && config.feishu.receiveId) {
    return 'app';
  }

  if (config.feishu.webhookUrl) {
    return 'webhook';
  }

  return 'unconfigured';
}
