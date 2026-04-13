import test from 'node:test';
import assert from 'node:assert/strict';
import { config, resolveFeishuMode } from '../src/config.js';
import { sendFeishuText } from '../src/feishu.js';

test('resolveFeishuMode prefers app when app credentials are present', () => {
  const snapshot = { ...config.feishu };
  config.feishu.mode = 'auto';
  config.feishu.appId = 'cli_test';
  config.feishu.appSecret = 'secret';
  config.feishu.receiveId = 'ou_test';
  config.feishu.webhookUrl = 'https://example.com/webhook';

  assert.equal(resolveFeishuMode(), 'app');

  Object.assign(config.feishu, snapshot);
});

test('sendFeishuText uses app message api in app mode', async () => {
  const snapshot = { ...config.feishu };
  const calls = [];
  const originalFetch = global.fetch;

  config.feishu.mode = 'app';
  config.feishu.apiBaseUrl = 'https://open.feishu.cn/open-apis';
  config.feishu.appId = 'cli_test';
  config.feishu.appSecret = 'secret';
  config.feishu.receiveId = 'ou_test';
  config.feishu.receiveIdType = 'open_id';
  config.feishu.webhookUrl = '';

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            msg: 'ok',
            tenant_access_token: 'tenant_token',
            expire: 7200
          })
      };
    }

    return {
      ok: true,
      text: async () => JSON.stringify({ code: 0, msg: 'ok', data: {} })
    };
  };

  try {
    await sendFeishuText('测试通知');
    assert.equal(calls.length, 2);
    assert.match(String(calls[1].url), /im\/v1\/messages\?receive_id_type=open_id/);
    assert.match(String(calls[1].options.headers.Authorization), /tenant_token/);
    const payload = JSON.parse(String(calls[1].options.body));
    assert.equal(payload.receive_id, 'ou_test');
    assert.equal(payload.msg_type, 'text');
    assert.equal(JSON.parse(payload.content).text, '测试通知');
  } finally {
    global.fetch = originalFetch;
    Object.assign(config.feishu, snapshot);
  }
});
