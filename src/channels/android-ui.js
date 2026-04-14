import { normalizeText } from '../utils.js';

const ignoredText = new Set([
  '消息',
  '私信',
  '发现',
  '首页',
  '我',
  '商城',
  '发送',
  '输入消息'
]);

const roleLabels = new Set(['群主', '管理员']);

export function extractConversationSummaries(xml) {
  const tree = parseUiHierarchy(xml);
  const screen = getScreenBounds(tree);
  const rows = tree.descendants.filter((node) =>
    isConversationRowCandidate(node, screen)
  );

  return dedupeConversationRows(rows)
    .map((row, index) => {
      const textNodes = collectRowTextNodes(row);
      const title = sanitizeConversationTitle(inferConversationRowTitle(textNodes));
      const summary = inferConversationRowSummary(textNodes, title);
      const parts = [title, summary].filter(Boolean);

      if (!parts.length) {
        return null;
      }

      const unreadDetails = inferUnreadDetails(row, textNodes);

      return {
        id: `android-${index}-${row.bounds.top}`,
        index,
        text: parts.join(' '),
        title: title || summary,
        unread: unreadDetails.unread,
        unreadCount: unreadDetails.unreadCount,
        bounds: row.bounds
      };
    })
    .filter(Boolean);
}

export function extractConversationContext(xml, historyLimit = 8) {
  const tree = parseUiHierarchy(xml);
  const title = inferConversationTitle(tree);
  const messages = inferMessageTexts(tree, title);

  return {
    title,
    history: messages.slice(-historyLimit),
    latestMessage: messages.at(-1) || ''
  };
}

export function summarizeUiTexts(xml, limit = 80) {
  return parseUiHierarchy(xml).descendants
    .map((node) => ({
      text: getDisplayText(node),
      bounds: node.bounds,
      clickable: node.attrs.clickable === 'true'
    }))
    .filter((item) => item.text)
    .slice(0, limit);
}

export function findBottomTabBounds(xml, label) {
  const tree = parseUiHierarchy(xml);
  const screen = getScreenBounds(tree);
  const target = tree.descendants
    .filter((node) => getDisplayText(node) === label)
    .filter((node) => node.bounds.top > screen.height - 420)
    .sort((left, right) => left.bounds.top - right.bounds.top)[0];

  if (!target) {
    return null;
  }

  let current = target;
  while (current) {
    if (current.attrs.clickable === 'true') {
      return current.bounds;
    }

    current = current.parent;
  }

  return target.bounds.width > 0 ? target.bounds : null;
}

export function parseUiHierarchy(xml) {
  const root = {
    type: 'root',
    attrs: {},
    bounds: emptyBounds(),
    children: [],
    parent: null
  };
  const stack = [root];
  const tokenPattern = /<[^>]+>/g;
  let match;

  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];

    if (token.startsWith('<?') || token.startsWith('<!')) {
      continue;
    }

    if (token.startsWith('</')) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    const selfClosing = token.endsWith('/>');
    const tagNameMatch = token.match(/^<\s*([^\s/>]+)/);
    if (!tagNameMatch) {
      continue;
    }

    const attrs = parseAttributes(token);
    const node = {
      type: tagNameMatch[1],
      attrs,
      bounds: parseBounds(attrs.bounds),
      children: [],
      parent: stack.at(-1)
    };

    stack.at(-1).children.push(node);

    if (!selfClosing) {
      stack.push(node);
    }
  }

  const descendants = flatten(root.children);
  return {
    root,
    descendants
  };
}

function flatten(nodes) {
  const result = [];

  for (const node of nodes) {
    result.push(node);
    result.push(...flatten(node.children));
  }

  return result;
}

function parseAttributes(token) {
  const attrs = {};
  const attrPattern = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
  let match;

  while ((match = attrPattern.exec(token))) {
    attrs[match[1]] = decodeXml(match[2]);
  }

  return attrs;
}

function decodeXml(value) {
  return String(value)
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_match, code) => {
      const isHex = String(code).toLowerCase().startsWith('x');
      const parsed = Number.parseInt(isHex ? String(code).slice(1) : code, isHex ? 16 : 10);

      if (!Number.isFinite(parsed)) {
        return '';
      }

      try {
        return String.fromCodePoint(parsed);
      } catch {
        return '';
      }
    });
}

function parseBounds(value) {
  const match = String(value || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) {
    return emptyBounds();
  }

  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    centerX: Math.round((left + right) / 2),
    centerY: Math.round((top + bottom) / 2)
  };
}

function emptyBounds() {
  return {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0
  };
}

function getScreenBounds(tree) {
  return tree.descendants.reduce(
    (screen, node) => ({
      width: Math.max(screen.width, node.bounds.right),
      height: Math.max(screen.height, node.bounds.bottom)
    }),
    { width: 0, height: 0 }
  );
}

function isConversationRowCandidate(node, screen) {
  if (node.type !== 'node') {
    return false;
  }

  if (node.attrs.clickable !== 'true') {
    return false;
  }

  if (node.bounds.width < screen.width * 0.5 || node.bounds.height < 120) {
    return false;
  }

  if (node.bounds.top < 150 || node.bounds.bottom > screen.height - 20) {
    return false;
  }

  const textNodes = collectRowTextNodes(node);

  return (
    textNodes.some((item) => looksLikeConversationTitle(item.text)) &&
    !textNodes.every(
      (item) => isSystemUpdateMarker(item.text) || isInputPlaceholder(item.text)
    )
  );
}

function dedupeConversationRows(rows) {
  const kept = [];

  for (const row of rows) {
    const hasContainerOverlap = kept.some((existing) => {
      const sameTop = Math.abs(existing.bounds.top - row.bounds.top) < 12;
      const sameLeft = Math.abs(existing.bounds.left - row.bounds.left) < 12;
      const contains =
        existing.bounds.left <= row.bounds.left &&
        existing.bounds.top <= row.bounds.top &&
        existing.bounds.right >= row.bounds.right &&
        existing.bounds.bottom >= row.bounds.bottom;

      return sameTop && sameLeft && contains;
    });

    if (!hasContainerOverlap) {
      kept.push(row);
    }
  }

  return kept;
}

function collectRowTextNodes(node) {
  const texts = [];
  const queue = [node];

  while (queue.length) {
    const current = queue.shift();
    const text = getDisplayText(current);

    if (text && !ignoredText.has(text)) {
      texts.push({
        text,
        bounds: current.bounds
      });
    }

    queue.push(...current.children);
  }

  return dedupeTextNodes(texts).sort(compareTextNodes);
}

function dedupeTextNodes(nodes) {
  const seen = new Set();

  return nodes.filter((node) => {
    const key = `${node.text}|${formatBoundsKey(node.bounds)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function compareTextNodes(left, right) {
  if (left.bounds.top !== right.bounds.top) {
    return left.bounds.top - right.bounds.top;
  }

  return left.bounds.left - right.bounds.left;
}

function inferConversationRowTitle(textNodes) {
  const firstNode = textNodes[0];
  if (!firstNode) {
    return '';
  }

  const candidates = textNodes
    .filter((item) => looksLikeConversationTitle(item.text))
    .filter((item) => item.bounds.left < 900)
    .sort(compareTextNodes);

  const sameLineCandidates = candidates.filter(
    (item) => item.bounds.top - firstNode.bounds.top < 56
  );
  const titleCandidates = sameLineCandidates.length
    ? sameLineCandidates
    : candidates;

  return titleCandidates.sort(compareTitleCandidates)[0]?.text || '';
}

function compareTitleCandidates(left, right) {
  const leftScore = getTitleScore(left.text);
  const rightScore = getTitleScore(right.text);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return compareTextNodes(left, right);
}

function getTitleScore(text) {
  let score = 0;

  if (!looksLikeMessageSummary(text)) {
    score += 3;
  }

  if (!text.includes('，')) {
    score += 2;
  }

  if (!text.includes('号')) {
    score += 1;
  }

  if (!isDateLike(text) && !isOnlineStatus(text) && !isUnreadCount(text)) {
    score += 2;
  }

  return score;
}

function inferConversationRowSummary(textNodes, title) {
  const summaryCandidate = textNodes.find((item) => {
    if (item.text === title) {
      return false;
    }

    if (isDateLike(item.text) || isOnlineStatus(item.text) || isUnreadCount(item.text)) {
      return false;
    }

    if (roleLabels.has(item.text)) {
      return false;
    }

    if (isSystemUpdateMarker(item.text)) {
      return false;
    }

    if (sanitizeConversationTitle(item.text) === title) {
      return false;
    }

    return true;
  });

  return summaryCandidate?.text || '';
}

function inferUnreadDetails(node, textNodes) {
  const textUnreadCount = textNodes
    .map((item) => parseUnreadCount(item.text))
    .find((value) => value !== null);

  if (
    textUnreadCount !== undefined ||
    textNodes.some((item) => item.text.includes('未读'))
  ) {
    return {
      unread: true,
      unreadCount: textUnreadCount ?? null
    };
  }

  const queue = [node];

  while (queue.length) {
    const current = queue.shift();
    const token = getDisplayText(current);
    const unreadCount = parseUnreadCount(token);

    if (unreadCount !== null || token.includes('未读') || token.includes('new')) {
      return {
        unread: true,
        unreadCount
      };
    }

    queue.push(...current.children);
  }

  return {
    unread: false,
    unreadCount: null
  };
}

function inferConversationTitle(tree) {
  const topTexts = tree.descendants
    .filter((node) => {
      const text = getDisplayText(node);
      return (
        text &&
        node.bounds.top < 300 &&
        node.bounds.width > 100 &&
        node.bounds.height < 140 &&
        !ignoredText.has(text) &&
        !isDateLike(text) &&
        !isOnlineStatus(text) &&
        !isUnreadCount(text)
      );
    })
    .sort((left, right) => left.bounds.top - right.bounds.top);

  return topTexts[0] ? getDisplayText(topTexts[0]) : '未知会话';
}

function inferMessageTexts(tree, title = '') {
  const screen = getScreenBounds(tree);
  const messages = tree.descendants
    .map((node) => ({
      text: getDisplayText(node),
      top: node.bounds.top,
      width: node.bounds.width,
      left: node.bounds.left,
      bottom: node.bounds.bottom
    }))
    .filter((item) => item.text)
    .filter((item) => item.top > 140)
    .filter((item) => item.width < 1000)
    .filter((item) => item.left < 850)
    .filter((item) => !ignoredText.has(item.text))
    .filter((item) => !isDateLike(item.text))
    .filter((item) => !isInputPlaceholder(item.text))
    .filter((item) => !isOnlineStatus(item.text))
    .filter((item) => !roleLabels.has(item.text))
    .filter((item) => !isUnreadCount(item.text))
    .filter((item) => !isSystemUpdateMarker(item.text))
    .filter((item) => !isActionButtonText(item.text))
    .filter((item) => !isRelationshipMarker(item.text))
    .filter((item) => !isBottomReactionLabel(item, screen))
    .filter((item) => normalizeText(item.text) !== normalizeText(title))
    .map((item) => normalizeText(item.text));

  return [...new Set(messages.filter(Boolean))];
}

function looksLikeConversationTitle(text) {
  return (
    !isDateLike(text) &&
    !isOnlineStatus(text) &&
    !isUnreadCount(text) &&
    !roleLabels.has(text) &&
    !isSystemUpdateMarker(text) &&
    !isInputPlaceholder(text)
  );
}

function sanitizeConversationTitle(text) {
  let value = normalizeText(text);

  if (!value) {
    return '';
  }

  value = value.replace(/&#\d+;/g, '');
  value = value.replace(/^\[[^\]]+\]\s*/g, '');
  value = value.replace(/，{2,}/g, '，');

  const segments = value
    .split('，')
    .map((item) => item.trim())
    .filter(Boolean);

  const candidate = segments.find((item) => {
    return (
      !isDateLike(item) &&
      !isOnlineStatus(item) &&
      !isUnreadCount(item) &&
      !isSystemUpdateMarker(item) &&
      !looksLikeMessageSummary(item)
    );
  });

  if (candidate) {
    return candidate;
  }

  return value
    .replace(
      /，?(今天在线|昨天|前天|刚刚在线|\d+分钟内在线|\d+小时内在线).*$/g,
      ''
    )
    .replace(/，?\d{2}月\d{2}号/g, '')
    .replace(/，?\d{4}年\d{2}月\d{2}号/g, '')
    .replace(/^\[[^\]]+\]\s*/g, '')
    .trim();
}

function looksLikeMessageSummary(text) {
  return text.length >= 8 || text.includes(':') || text.includes('，');
}

function isUnreadCount(text) {
  return parseUnreadCount(text) !== null;
}

function parseUnreadCount(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const countMatch =
    normalized.match(/^\(?(\d+)\)?$/) || normalized.match(/^(\d+)条未读$/);
  if (!countMatch) {
    return null;
  }

  const count = Number(countMatch[1]);
  return Number.isFinite(count) ? count : null;
}

function isOnlineStatus(text) {
  return (
    /在线$/.test(text) ||
    /人在线$/.test(text) ||
    /分钟内在线$/.test(text) ||
    /小时内在线$/.test(text) ||
    /今天在线$/.test(text)
  );
}

function isInputPlaceholder(text) {
  return text.startsWith('发消息');
}

function isSystemUpdateMarker(text) {
  return /^(\d+条新消息|\d+条更新)$/.test(text);
}

function isActionButtonText(text) {
  return text === '逛逛橱窗';
}

function isRelationshipMarker(text) {
  return text.includes('已相互关注') || text.includes('加入了群聊');
}

function isBottomReactionLabel(item, screen) {
  return (
    item.top > screen.height - 320 &&
    item.bottom < screen.height - 120 &&
    item.width <= 120 &&
    item.text.length <= 4
  );
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

function formatBoundsKey(bounds) {
  return `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
}

function getDisplayText(node) {
  const raw = node.attrs.text || node.attrs['content-desc'] || '';
  return normalizeText(raw);
}
