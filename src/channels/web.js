import { chromium } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ensureDataDir } from '../state-store.js';
import { normalizeText, shortText, sleep } from '../utils.js';

export const webChannel = {
  name: 'web',
  capabilities: {
    sendReply: true
  },
  async createRuntime() {
    await ensureDataDir();

    const context = await chromium.launchPersistentContext(
      config.paths.browserUserDataDir,
      {
        channel: config.xiaohongshu.browserChannel || undefined,
        headless: config.xiaohongshu.headless,
        viewport: { width: 1440, height: 960 }
      }
    );
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(config.xiaohongshu.inboxUrl, { waitUntil: 'domcontentloaded' });

    return {
      context,
      page
    };
  },
  async closeRuntime(runtime) {
    await runtime.context.close();
  },
  async listUnreadConversations(runtime) {
    const result = await findConversationLocators(runtime.page);

    if (!result) {
      throw new Error('没有找到会话列表，请先手动进入小红书私信页面，或调整选择器。');
    }

    logger.info(`使用会话选择器: ${result.selector}`);

    const conversations = [];
    const total = Math.min(
      await result.locator.count(),
      config.xiaohongshu.maxConversations
    );

    for (let index = 0; index < total; index += 1) {
      const item = result.locator.nth(index);
      const text = normalizeText(await item.innerText().catch(() => ''));
      if (!text) {
        continue;
      }

      const unread = await hasUnreadBadge(item);
      conversations.push({
        id: `web-${index}`,
        index,
        text,
        unread
      });
    }

    return conversations;
  },
  async openConversation(runtime, conversation) {
    const result = await findConversationLocators(runtime.page);
    if (!result) {
      throw new Error('无法打开会话，因为会话列表未找到。');
    }

    const item = result.locator.nth(conversation.index);
    await item.click({ delay: 80 });
    await sleep(1200);
  },
  async readConversationContext(runtime) {
    const rows = await readMessageRows(runtime.page);
    const title = await readConversationTitle(runtime.page);

    return {
      title,
      history: rows.slice(-config.xiaohongshu.messageHistoryLimit),
      latestMessage: rows.at(-1) || ''
    };
  },
  async sendReply(runtime, reply) {
    const inputResult = await findFirstVisible(
      runtime.page,
      config.selectors.messageInput,
      800
    );
    if (!inputResult) {
      throw new Error('没有找到私信输入框，请调整输入框选择器。');
    }

    const input = inputResult.locator;
    await input.click();
    await input.fill('');
    await input.type(reply, { delay: 15 });

    const sendResult = await findFirstVisible(
      runtime.page,
      config.selectors.sendButton,
      800
    );
    if (!sendResult) {
      throw new Error('没有找到发送按钮，请调整发送按钮选择器。');
    }

    await sendResult.locator.click({ delay: 60 });
    await sleep(800);
  },
  async collectDebugStats(runtime) {
    const stats = {};

    for (const [key, selectors] of Object.entries(config.selectors)) {
      stats[key] = [];

      for (const selector of selectors) {
        try {
          const count = await runtime.page.locator(selector).count();
          stats[key].push({ selector, count });
        } catch {
          stats[key].push({ selector, count: -1 });
        }
      }
    }

    return stats;
  },
  async getCurrentLocation(runtime) {
    return runtime.page.url();
  }
};

async function findFirstVisible(scope, selectors, timeout = 600) {
  for (const selector of selectors) {
    const locator = scope.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      if (await locator.isVisible()) {
        return { selector, locator };
      }
    } catch {
      // Ignore selector misses and try the next candidate.
    }
  }

  return null;
}

async function findConversationLocators(page) {
  for (const selector of config.selectors.conversationItems) {
    const locator = page.locator(selector);
    try {
      const count = await locator.count();
      if (count > 0) {
        return { selector, locator };
      }
    } catch {
      // Ignore selector misses and try the next candidate.
    }
  }

  return null;
}

async function hasUnreadBadge(item) {
  for (const selector of config.selectors.unreadBadge) {
    try {
      const locator = item.locator(selector).first();
      if (await locator.count()) {
        return true;
      }
    } catch {
      // Ignore.
    }
  }

  return false;
}

async function readMessageRows(page) {
  for (const selector of config.selectors.messageRows) {
    const locator = page.locator(selector);
    try {
      const count = await locator.count();
      if (!count) {
        continue;
      }

      const rows = [];
      for (let index = 0; index < count; index += 1) {
        const text = normalizeText(
          await locator.nth(index).innerText().catch(() => '')
        );
        if (text) {
          rows.push(text);
        }
      }

      if (rows.length) {
        return rows;
      }
    } catch {
      // Ignore.
    }
  }

  const fallback = normalizeText(await page.innerText('body').catch(() => ''));
  return fallback ? [shortText(fallback, 400)] : [];
}

async function readConversationTitle(page) {
  const titleSelectors = ['h1', 'h2', 'header', '[class*="title"]'];

  for (const selector of titleSelectors) {
    try {
      const text = normalizeText(
        await page
          .locator(selector)
          .first()
          .innerText({ timeout: 300 })
          .catch(() => '')
      );
      if (text) {
        return shortText(text, 80);
      }
    } catch {
      // Ignore.
    }
  }

  return '未知会话';
}
