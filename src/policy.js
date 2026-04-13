import { config } from './config.js';
import { hashContent, hasKeyword, minutesBetween } from './utils.js';

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

export function shouldRequireManualReview(context, record, now = new Date().toISOString()) {
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

function dedupeKeywords(keywords) {
  return [...new Set(keywords.map((item) => String(item).trim()).filter(Boolean))];
}
