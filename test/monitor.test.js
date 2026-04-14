import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorOnce } from '../src/index.js';
import { getConversationStateKey } from '../src/policy.js';

test('monitorOnce rescans list after handling one conversation', async () => {
  const originalFetch = global.fetch;
  const listedSnapshots = [
    [
      { id: 'a', title: 'A', text: 'A', unread: true, bounds: {} },
      { id: 'b', title: 'B', text: 'B', unread: true, bounds: {} }
    ],
    [{ id: 'b', title: 'B', text: 'B', unread: true, bounds: {} }],
    []
  ];
  const opened = [];
  const contexts = [
    { title: 'A', latestMessage: 'msg-a', history: ['msg-a'] },
    { title: 'B', latestMessage: 'msg-b', history: ['msg-b'] }
  ];
  let readCount = 0;
  let listCount = 0;

  const channel = {
    capabilities: {
      sendReply: false
    },
    async listUnreadConversations() {
      const snapshot = listedSnapshots[listCount] || [];
      listCount += 1;
      return snapshot;
    },
    async openConversation(_runtime, conversation) {
      opened.push(conversation.title);
    },
    async readConversationContext() {
      const context = contexts[readCount];
      readCount += 1;
      return context;
    }
  };

  const state = {
    conversations: {}
  };

  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'mock-reply'
                }
              }
            ]
          };
        }
      };
    }

    if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            tenant_access_token: 'token',
            expire: 7200
          });
        }
      };
    }

    if (String(url).includes('/im/v1/messages')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({ code: 0 });
        }
      };
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    await monitorOnce(channel, {}, state);
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(opened, ['A', 'B']);
  assert.equal(listCount, 3);
  assert.equal(Object.keys(state.conversations).length, 2);
});

test('monitorOnce skips candidate without message increment and continues rescanning', async () => {
  const originalFetch = global.fetch;
  const listedSnapshots = [
    [
      { id: 'a', title: 'A', text: 'A', unread: true, bounds: {} },
      { id: 'b', title: 'B', text: 'B', unread: true, bounds: {} }
    ],
    [{ id: 'b', title: 'B', text: 'B', unread: true, bounds: {} }],
    []
  ];
  const opened = [];
  const contexts = [
    { title: 'A', latestMessage: 'old-2', history: ['old-1', 'old-2'] },
    { title: 'B', latestMessage: 'new-1', history: ['new-1'] }
  ];
  let readCount = 0;
  let listCount = 0;

  const channel = {
    capabilities: {
      sendReply: false
    },
    async listUnreadConversations() {
      const snapshot = listedSnapshots[listCount] || [];
      listCount += 1;
      return snapshot;
    },
    async openConversation(_runtime, conversation) {
      opened.push(conversation.title);
    },
    async readConversationContext() {
      const context = contexts[readCount];
      readCount += 1;
      return context;
    }
  };

  const state = {
    conversations: {
      [getConversationStateKey('A', 'A')]: {
        lastHandledMessageHash: 'old-hash',
        lastContextMessages: ['old-1', 'old-2'],
        mode: 'draft-only'
      }
    }
  };

  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'mock-reply'
                }
              }
            ]
          };
        }
      };
    }

    if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            tenant_access_token: 'token',
            expire: 7200
          });
        }
      };
    }

    if (String(url).includes('/im/v1/messages')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({ code: 0 });
        }
      };
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    await monitorOnce(channel, {}, state);
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(opened, ['A', 'B']);
  assert.equal(listCount, 3);
  assert.equal(Object.keys(state.conversations).length, 2);
});

test('monitorOnce limits first notification input to unread-count tail', async () => {
  const originalFetch = global.fetch;
  const listedSnapshots = [[{ id: 'a', title: 'A', text: 'A', unread: true, unreadCount: 1, bounds: {} }], []];
  const contexts = [
    {
      title: 'A',
      latestMessage: '最新消息',
      history: ['hello', 'hi', '怎么不回我信息', '刚刚', '最新消息']
    }
  ];
  const llmRequests = [];
  const notifications = [];
  let readCount = 0;
  let listCount = 0;

  const channel = {
    capabilities: {
      sendReply: false
    },
    async listUnreadConversations() {
      const snapshot = listedSnapshots[listCount] || [];
      listCount += 1;
      return snapshot;
    },
    async openConversation() {},
    async readConversationContext() {
      const context = contexts[readCount];
      readCount += 1;
      return context;
    }
  };

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      llmRequests.push(JSON.parse(String(options.body)));
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'mock-reply'
                }
              }
            ]
          };
        }
      };
    }

    if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            tenant_access_token: 'token',
            expire: 7200
          });
        }
      };
    }

    if (String(url).includes('/im/v1/messages')) {
      notifications.push(JSON.parse(String(options.body)));
      return {
        ok: true,
        async text() {
          return JSON.stringify({ code: 0 });
        }
      };
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    await monitorOnce(channel, {}, { conversations: {} });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(llmRequests.length, 1);
  assert.match(llmRequests[0].messages[1].content, /最近用户消息：最新消息/);
  assert.equal(notifications.length, 1);
  assert.match(JSON.parse(notifications[0].content).text, /用户消息: 最新消息/);
  assert.doesNotMatch(JSON.parse(notifications[0].content).text, /hello/);
});
