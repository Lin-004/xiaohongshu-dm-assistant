# Xiaohongshu DM Assistant

一个面向个人小红书账号的首版自动化助手：

- 监听私信页的新消息
- 调用兼容 OpenAI Chat Completions 的大模型生成回复
- 可选自动发送回复
- 通过飞书机器人把新私信、AI 回复和发送结果通知给你

## 为什么这样做

小红书面向个人账号私信的公开开放 API 并不明确，首版采用浏览器自动化方案。这样可以先验证需求闭环，再决定是否继续做更稳的专业号/客服系统版本。

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
copy .env.example .env
```

3. 填写 `.env`

- `LLM_API_KEY`
- `LLM_MODEL`
- 飞书长连接应用机器人优先填写：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_RECEIVE_ID`
  - `FEISHU_RECEIVE_ID_TYPE`
- 如果你仍然使用自定义机器人 webhook，也可以只填 `FEISHU_WEBHOOK_URL`
- 如果你希望自动发送，把 `XHS_AUTO_SEND_REPLY=true`

4. 登录小红书网页并保存会话

```bash
npm run login
```

按提示在浏览器里登录，并进入私信页面。

5. 启动监听器

```bash
npm start
```

6. 运行基础测试

```bash
npm test
```

## 推荐上线顺序

1. `XHS_AUTO_SEND_REPLY=false`
先只跑“监控 + AI 生成 + 飞书通知”

2. 观察 1 到 2 天
确认选择器、消息抓取、提示词和通知都稳定

3. 再打开自动发送

## 选择器调试

小红书页面结构可能变化。如果首版默认选择器失效，可以运行：

```bash
npm run debug:selectors
```

脚本会输出每组候选选择器的命中数量，方便你微调 `.env` 里的覆盖项。

## 安全保护

- 默认不开自动发送
- 命中合作、报价、高风险或站外联系方式关键词时只通知，不自动回复
- 同一会话有冷却时间，避免高频轰炸
- 本地状态文件会避免对同一条新消息重复回复
- 飞书通知失败不会中断主流程，但会在本地日志里记录错误

## 飞书说明

- 如果你的飞书机器人是“长连接应用机器人”，本项目的通知发送会走飞书应用消息 API，而不是 webhook。
- 长连接通常用于事件接收和机器人在线交互；本项目当前只需要“主动通知你”，所以不需要在本地额外启动飞书长连接客户端。
- 如果后面你希望支持“在飞书里回复指令、人工接管、批准发送”，再补长连接事件监听即可。

## 目录

- `docs/product-plan.md`
产品方案、MVP 和后续演进
- `src/login.js`
手动登录并保存会话
- `src/index.js`
主监听器
- `src/debug-selectors.js`
选择器调试工具
