import { config } from './config.js';
import { hashContent, hasKeyword, minutesBetween, normalizeText } from './utils.js';

const defaultRiskGroups = {
  business: ['合作', '商务', '联名', '置换', '达人', '投放'],
  pricing: ['报价', '多少钱', '怎么收费', '收费标准', '预算', '价格'],
  complaint: ['退款', '投诉', '举报', '侵权', '律师', '起诉', '维权', '差评'],
  offPlatform: ['加微信', '微信', 'vx', '手机号', '电话', '联系方式']
};

export function getRiskGroups() {
  const manualKeywords = config.xiaohongshu.manualReviewKeywords;

  return {
    business: dedupeKeywords(defaultRiskGroups.business),
    pricing: dedupeKeywords(defaultRiskGroups.pricing),
    complaint: dedupeKeywords(defaultRiskGroups.complaint),
    offPlatform: dedupeKeywords(defaultRiskGroups.offPlatform),
    custom: dedupeKeywords(manualKeywords)
  };
}

export function getConversationStateKey(title, fallbackText = '') {
  return hashContent(`${title || ''}|${fallbackText || ''}`);
}

export function getMessageHash(latestMessage, history = []) {
  return hashContent(`${latestMessage || ''}|${history.slice(-2).join('|')}`);
}

export function getMessageIncrement(context, record, options = {}) {
  const currentHistory = normalizeMessages(context?.history || []);
  const previousHistory = normalizeMessages(record?.lastContextMessages || []);
  const unreadCount = normalizeUnreadCount(options.unreadCount);

  if (!currentHistory.length) {
    return [];
  }

  if (!previousHistory.length) {
    return limitIncrementByUnreadCount(currentHistory, unreadCount);
  }

  const overlap = findTailOverlap(previousHistory, currentHistory);
  if (overlap > 0) {
    return currentHistory.slice(overlap);
  }

  return limitIncrementByUnreadCount(currentHistory, unreadCount);
}

export function shouldRequireManualReview(
  context,
  record,
  now = new Date().toISOString()
) {
  const haystack = [context.title, context.latestMessage, ...(context.history || [])]
    .filter(Boolean)
    .join('\n');

  const riskGroups = getRiskGroups();
  const matchedGroup = Object.entries(riskGroups).find(([, keywords]) =>
    hasKeyword(haystack, keywords)
  );

  if (matchedGroup) {
    const [groupName, keywords] = matchedGroup;
    const matchedKeyword = hasKeyword(haystack, keywords);
    return `命中人工审核分类: ${groupName} / ${matchedKeyword}`;
  }

  if (
    record?.lastHandledAt &&
    minutesBetween(record.lastHandledAt, now) < config.xiaohongshu.replyCooldownMinutes
  ) {
    return `命中冷却时间，距离上次处理不足 ${config.xiaohongshu.replyCooldownMinutes} 分钟`;
  }

  return null;
}

function normalizeMessages(messages) {
  return messages.map((item) => normalizeText(item)).filter(Boolean);
}

function findTailOverlap(previousHistory, currentHistory) {
  const maxOverlap = Math.min(previousHistory.length, currentHistory.length);

  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previousHistory.slice(-size);
    const currentHead = currentHistory.slice(0, size);

    if (arraysEqual(previousTail, currentHead)) {
      return size;
    }
  }

  return 0;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function dedupeKeywords(keywords) {
  return [...new Set(keywords.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeUnreadCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function limitIncrementByUnreadCount(messages, unreadCount) {
  if (!unreadCount || messages.length <= unreadCount) {
    return messages;
  }

  return messages.slice(-unreadCount);
}
