import { normalizeText } from '../utils.js';
import { extractConversationSummaries, parseUiHierarchy } from './android-ui.js';

const popupKeywords = [
  '允许',
  '暂不开启',
  '以后再说',
  '仅在使用中允许',
  '我知道了',
  '去设置',
  '取消',
  '确定'
];

const navKeywords = new Set(['消息', '发现', '首页', '我', '商城', '发送']);

export function detectAndroidPageState(xml) {
  const tree = parseUiHierarchy(xml);
  const texts = collectTexts(tree);
  const listItems = extractConversationSummaries(xml);
  const hasInput = texts.some((item) => isInputPlaceholder(item.text));
  const topTitle = inferTopTitle(texts);
  const messageTexts = inferDetailMessageTexts(texts, topTitle);
  const popupTexts = texts.filter((item) => popupKeywords.includes(item.text));

  if (isBlockedByPopup(texts, popupTexts)) {
    return {
      state: 'blocked_by_popup',
      topTitle,
      signals: {
        popupTexts: popupTexts.map((item) => item.text),
        textCount: texts.length
      }
    };
  }

  if (hasInput && topTitle && messageTexts.length > 0) {
    return {
      state: 'conversation_detail',
      topTitle,
      signals: {
        hasInput,
        messageCount: messageTexts.length
      }
    };
  }

  if (listItems.length > 0) {
    return {
      state: 'conversation_list',
      topTitle: texts.find((item) => item.text === '消息')?.text || topTitle,
      signals: {
        conversationCount: listItems.length,
        hasMessageTab: texts.some((item) => item.text === '消息')
      }
    };
  }

  return {
    state: 'unknown',
    topTitle,
    signals: {
      hasInput,
      textCount: texts.length
    }
  };
}

function collectTexts(tree) {
  return tree.descendants
    .map((node) => ({
      text: normalizeText(node.attrs.text || node.attrs['content-desc'] || ''),
      bounds: node.bounds,
      clickable: node.attrs.clickable === 'true'
    }))
    .filter((item) => item.text);
}

function inferTopTitle(texts) {
  const candidate = texts
    .filter((item) => item.bounds.top < 260)
    .filter((item) => item.bounds.width > 120)
    .filter((item) => item.bounds.height < 140)
    .filter((item) => !navKeywords.has(item.text))
    .filter((item) => !isDateLike(item.text))
    .filter((item) => !isInputPlaceholder(item.text))
    .sort((left, right) => {
      if (left.bounds.top !== right.bounds.top) {
        return left.bounds.top - right.bounds.top;
      }

      return Math.abs(left.bounds.centerX - 540) - Math.abs(right.bounds.centerX - 540);
    })[0];

  return candidate?.text || '';
}

function inferDetailMessageTexts(texts, title) {
  return texts
    .filter((item) => item.bounds.top > 180)
    .filter((item) => item.bounds.bottom < 2200)
    .filter((item) => item.bounds.width < 980)
    .filter((item) => !navKeywords.has(item.text))
    .filter((item) => !isInputPlaceholder(item.text))
    .filter((item) => !isDateLike(item.text))
    .filter((item) => item.text !== title);
}

function isBlockedByPopup(texts, popupTexts) {
  if (popupTexts.length < 2) {
    return false;
  }

  return texts.some((item) => item.bounds.top > 300 && item.bounds.bottom < 2000);
}

function isInputPlaceholder(text) {
  return text.startsWith('发消息');
}

function isDateLike(text) {
  return (
    /^(昨天|今天|前天)(\s+\d{1,2}:\d{2})?$/.test(text) ||
    /^\d{1,2}:\d{2}$/.test(text) ||
    /^\d{2}-\d{2}$/.test(text) ||
    /^\d{2}月\d{2}号$/.test(text) ||
    /^\d{4}年\d{2}月\d{2}号$/.test(text)
  );
}
