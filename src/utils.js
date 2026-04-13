import crypto from 'node:crypto';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortText(value, limit = 160) {
  const normalized = normalizeText(value);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1)}…`;
}

export function hashContent(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

export function hasKeyword(text, keywords) {
  const content = normalizeText(text);
  return keywords.find((keyword) => content.includes(keyword)) || null;
}

export function minutesBetween(leftIso, rightIso = new Date().toISOString()) {
  if (!leftIso) {
    return Number.POSITIVE_INFINITY;
  }

  const left = new Date(leftIso).getTime();
  const right = new Date(rightIso).getTime();
  return Math.abs(right - left) / 1000 / 60;
}
