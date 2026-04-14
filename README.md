# Xiaohongshu DM Assistant

一个面向个人创作者和轻运营团队的小红书私信辅助原型。当前版本以 **Android 真机链路** 为主，不再把 Web 端视为可用主链路。

当前版本的能力边界：

- 连接 Android 设备并唤起小红书 App
- 读取消息列表和会话上下文
- 调用兼容 OpenAI Chat Completions 的大模型生成回复草稿
- 通过飞书通知你用户消息、AI 草稿和处理结果
- 由人工在手机上完成最终发送

当前版本**不包含**：

- Web 私信处理
- Android 自动发送
- 多账号管理
- 后台管理系统

## 当前状态

请先明确当前项目状态：

- Android 通道是当前唯一真实可用的主链路
- Web 通道只作为后续接口抽象保留
- 当前 MVP 是“监控 + 草稿 + 通知 + 人工发送”
- 下一阶段核心研发目标是 Android 自动发送

## 为什么这样做

小红书网页版当前无法承载私信主流程，因此不能作为当前产品基础能力。现阶段采用 Android 真机链路，是为了先把“发现私信 -> 生成草稿 -> 通知运营 -> 人工发送”这条链路打通并稳定下来。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 复制环境变量

```bash
copy .env.example .env
```

### 3. 填写 `.env`

至少需要配置：

- `LLM_API_KEY`
- `LLM_MODEL`
- `XHS_CHANNEL=android`

飞书通知二选一：

- 飞书应用消息：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_RECEIVE_ID`
  - `FEISHU_RECEIVE_ID_TYPE`
- 或 webhook：
  - `FEISHU_WEBHOOK_URL`

Android 相关可选配置：

- `ANDROID_ADB_PATH`
- `ANDROID_DEVICE_ID`
- `ANDROID_PACKAGE_NAME`
- `ANDROID_LAUNCHER_ACTIVITY`

## Android 调试

### 1. 连接设备

- 连接 Android 真机或模拟器
- 确保 `adb` 可用
- 手机开启开发者模式和 USB 调试

### 2. 手动打开小红书

在手机上手动打开小红书，并进入消息列表页。

### 3. 运行调试脚本

```bash
npm run debug:android
```

脚本会：

- 检查设备连接
- 启动或唤起小红书 App
- 抓取当前 UI dump
- 打印解析到的会话列表
- 自动点开一个会话并打印最近消息
- 把最近一次原始 XML 保存到 `.data/android-ui-latest.xml`

如果解析结果不对，后续就基于这份 XML 微调 `src/channels/android-ui.js` 的规则。

## 启动监听器

确认 Android 调试链路正常后，运行：

```bash
npm start
```

## 测试

```bash
npm test
```

## 推荐使用顺序

1. 先只跑“Android 监控 + AI 草稿 + 飞书通知”
2. 连续观察 1 到 2 天，确认消息识别、草稿质量和通知稳定
3. 修正 UI 解析规则、提示词和异常处理
4. 在链路稳定后，再进入 Android 自动发送开发

## Web 通道说明

`web` 通道当前**不属于可用能力**。之所以仍保留相关代码，是为了后续在平台能力变化后复用统一通道抽象，而不是因为当前已经能跑通。

如果未来 Web 私信流程重新可用，再恢复该通道的产品化接入。

## 选择器调试

`npm run debug:selectors` 仅保留给未来 Web 通道调试使用，不属于当前 MVP 主链路。

## 安全保护

- 当前版本默认不自动发送
- 命中合作、报价、高风险或站外联系方式关键词时，只通知，不进入自动处理
- 同一会话有冷却时间，避免高频重复处理
- 本地状态文件会避免对同一条新消息重复生成处理结果
- 飞书通知失败不会中断主流程，但会在本地日志中记录错误

## 飞书说明

- 如果使用的是“长连接应用机器人”，通知会走飞书应用消息 API，而不是 webhook
- 当前项目只需要主动通知，不需要额外启动飞书长连接事件客户端
- 如果后续要支持“飞书内批准发送、人工接管、回复命令”，再补事件监听链路

## 目录

- `docs/product-plan.md`
  当前产品规划、MVP 边界和阶段路线图
- `src/index.js`
  主监听器
- `src/channels/android.js`
  Android 通道入口
- `src/channels/android-ui.js`
  Android UI 解析逻辑
- `src/debug-android.js`
  Android 调试工具
