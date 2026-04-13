import crypto from 'node:crypto';
import { config, resolveFeishuMode } from './config.js';

const tokenCache = {
  value: '',
  expiresAt: 0
};

function buildSignature(secret, timestamp) {
  const content = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', content).digest('base64');
}

export async function sendFeishuText(text) {
  const mode = resolveFeishuMode();

  if (mode === 'app') {
    await sendFeishuAppMessage(text);
    return;
  }

  if (mode === 'webhook') {
    await sendFeishuWebhook(text);
  }
}

async function sendFeishuWebhook(text) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = {
    msg_type: 'text',
    content: {
      text
    }
  };

  if (config.feishu.webhookSecret) {
    payload.timestamp = timestamp;
    payload.sign = buildSignature(config.feishu.webhookSecret, timestamp);
  }

  const response = await fetch(config.feishu.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`飞书通知失败: ${response.status} ${body}`);
  }
}

async function sendFeishuAppMessage(text) {
  const tenantAccessToken = await getTenantAccessToken();
  const response = await fetch(
    `${config.feishu.apiBaseUrl.replace(/\/$/, '')}/im/v1/messages?receive_id_type=${config.feishu.receiveIdType}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${tenantAccessToken}`
      },
      body: JSON.stringify({
        receive_id: config.feishu.receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text })
      })
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`飞书应用消息发送失败: ${response.status} ${body}`);
  }

  const data = parseJson(body);
  if (data.code && data.code !== 0) {
    throw new Error(`飞书应用消息发送失败: ${data.code} ${data.msg || body}`);
  }
}

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.value;
  }

  const response = await fetch(
    `${config.feishu.apiBaseUrl.replace(/\/$/, '')}/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret
      })
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`飞书租户令牌获取失败: ${response.status} ${body}`);
  }

  const data = parseJson(body);
  if (!data.tenant_access_token) {
    throw new Error(`飞书租户令牌获取失败: ${data.code || ''} ${data.msg || body}`.trim());
  }

  tokenCache.value = data.tenant_access_token;
  tokenCache.expiresAt = Date.now() + (Number(data.expire || 7200) * 1000);
  return tokenCache.value;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
