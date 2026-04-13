import { config } from './config.js';

function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || '')
      .join('\n')
      .trim();
  }

  return '';
}

export async function generateReply({ conversationTitle, latestMessage, history }) {
  const response = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: config.llm.temperature,
      messages: [
        {
          role: 'system',
          content: config.llm.systemPrompt
        },
        {
          role: 'user',
          content: [
            `会话标题：${conversationTitle || '未知用户'}`,
            `最近用户消息：${latestMessage}`,
            '最近对话历史：',
            history.map((item, index) => `${index + 1}. ${item}`).join('\n'),
            '',
            '请直接给出一条适合发送的中文回复，不要解释。'
          ].join('\n')
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM 调用失败: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = extractAssistantText(data);

  if (!text) {
    throw new Error('LLM 返回内容为空');
  }

  return text;
}
