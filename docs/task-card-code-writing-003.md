# 线程任务卡

### 线程
代码编写

### 编号
CW-003

### 目标
基于 `TP-003` 技术结论，在现有 Android 主链路上实现“默认关闭、显式开启、仅覆盖低风险单轮标准回复场景”的自动发送 Beta 最小闭环，完成发送前校验、输入框写入、发送按钮点击、发送结果确认、失败回退和最小状态记录。

### 范围
- 要做：
  - 接入自动发送唯一业务开关，默认关闭、显式开启才生效
  - 实现自动发送前置条件判断和高风险硬阻断
  - 实现 Android 输入框写入、发送按钮点击和发送结果确认
  - 实现发送失败回退到人工通知
  - 实现最小状态记录、日志字段和重复发送保护接线
  - 补充必要测试，覆盖本轮自动发送 Beta 改动
- 不要做：
  - 不引入人工审批流
  - 不扩展到多账号、后台、CRM、纯云端 SaaS
  - 不恢复 Web 通道自动发送
  - 不把自动发送扩展为多轮策略或批量回复
  - 不新增未经主线程确认的文件级扩张

### 输入材料
- `docs/thread-status.md`
- `docs/technical-planning-tp-003-result.md`
- `docs/product-plan.md`
- `docs/code-testing-ct-003-result.md`
- `src/config.js`
- `src/index.js`
- `src/policy.js`
- `src/channels/android.js`
- `src/channels/android-ui.js`
- `test/monitor.test.js`
- `test/policy.test.js`
- `test/android-ui.test.js`

### 输出要求
- 可运行代码
- 变更文件清单
- 测试说明
- 自动发送成功路径说明
- 自动发送失败回退说明
- 回归风险说明

### 明确实现要求

#### 1. 自动发送唯一业务开关

- 本轮只允许一个自动发送业务开关作为运行时判断入口
- 主线程指定以 `XHS_AUTO_SEND_REPLY` / `config.xiaohongshu.autoSendReply` 为唯一业务开关
- 不允许继续把 `config.android.autoSendReply` 扩展为并行第二开关
- 如现有代码中存在 Android 侧重复开关配置，本轮应收口为不参与业务判断，避免口径继续分叉

#### 2. 自动发送前置条件与风险阻断

- 在 `src/policy.js` 中补充自动发送 Beta 的前置条件判断
- 至少覆盖以下硬阻断：
  - 自动发送开关未开启
  - 当前通道不支持发送
  - 当前页面不在 `conversation_detail`
  - 当前无有效消息增量
  - 草稿为空或草稿基础内容校验失败
  - 命中高风险分类
  - 命中重复发送保护
  - 命中 cooldown
- 草稿基础内容校验至少包含：
  - `trim()` 后不能为空
  - 长度范围建议 `2 <= len <= 120`
  - 不能只包含表情或标点

#### 3. Android 发送执行器

- 在 `src/channels/android.js` 中实现最小发送闭环：
  - 定位输入框
  - 点击输入框
  - 清空旧内容
  - 写入草稿
  - 定位发送按钮
  - 点击发送
  - 重新抓取详情页 UI 做发送结果确认
- 发送结果确认采用 `TP-003` 的最小双重确认：
  - 草稿文本已以出站消息形式出现在消息尾部
  - 或输入框被清空，且消息尾部新增与草稿高度相似的出站文本
- 不允许把“按钮点击成功”直接视为“发送成功”

#### 4. 发送失败回退与错误码

- 输入框缺失时，输出 `SEND_INPUT_NOT_FOUND`
- 发送按钮缺失时，输出 `SEND_BUTTON_NOT_FOUND`
- 发送后无法确认成功时，输出 `SEND_CONFIRM_FAILED`
- 本轮默认规则：
  - 发送失败只影响当前会话
  - 当前会话回退为人工通知
  - 主循环继续处理后续候选
- 仅页面级异常可视情况抛出通道异常，不要求本轮额外设计复杂状态机

#### 5. 主循环接线

- 在 `src/index.js` 中把自动发送作为可选分支接入现有主循环
- 自动发送成功时：
  - 记录 `mode = auto-send`
  - 更新 `lastHandledMessageHash`
  - 更新 `lastHandledAt`
  - 更新 `lastReplyText`
  - 更新 `lastSendAttemptAt`
  - 更新 `lastSendResult = success`
- 自动发送失败并回退人工时：
  - 记录 `mode = auto-send-failed`
  - 更新 `lastSendAttemptAt`
  - 更新 `lastSendResult = failed`
  - 更新 `lastSendFailureCode`
  - 发送人工通知，通知中带上 AI 草稿和失败原因
- 命中高风险强制转人工时：
  - 保持 `manual-review`
  - 不进入自动发送执行器

#### 6. 文件级改动边界

本轮建议只改以下文件：

- `src/config.js`
- `src/index.js`
- `src/policy.js`
- `src/channels/android.js`
- `src/channels/android-ui.js`
- `test/monitor.test.js`
- `test/policy.test.js`
- `test/android-ui.test.js`

如无明确必要，不要扩散到其他文件。

### 验收映射

- 默认关闭：
  - 未显式开启 `XHS_AUTO_SEND_REPLY` 时，不自动发送
- 显式开启：
  - 低风险标准回复场景可自动发送
- 结果确认：
  - 自动发送成功必须确认消息真实发出，而不是仅完成点击
- 回退：
  - 发送失败时回退到人工通知
- 风险阻断：
  - 命中高风险分类时，强制转人工
- 幂等保护：
  - 同一消息增量不重复发送
- 页面保护：
  - 页面不在详情页、输入框缺失、发送按钮缺失时，不自动发送

### 完成标准
- 自动发送唯一业务开关口径清楚
- 低风险自动发送最小闭环可运行
- 发送成功确认逻辑已落地
- 失败回退和错误码已落地
- 高风险转人工、重复发送保护和 cooldown 关系未回退
- 输出结果可直接交给代码测试线程继续验收
