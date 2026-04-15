# 线程任务卡

### 线程
代码编写

### 编号
CW-002

### 目标
基于 `TP-002` 技术结论，完成本轮最小可落地方案：默认通道切换到 Android、串行重抓主链路收口、用例 3 对应分支的保护性修正，以及最小调度参数入口预留。

### 范围
- 要做：
  - 将默认通道从 `web` 切换到 `android`
  - 保持并收口现有“处理一个候选 -> 返回列表 -> 重抓列表 -> 处理下一个候选”的串行模型
  - 修正“候选存在但无新增消息”分支，确保其行为稳定且不污染 cooldown
  - 保持详情页标题 canonical 化和列表标题降级处理逻辑不回退
  - 为最小调度参数补充配置入口，但不接入真实深扫
  - 补充必要测试，覆盖本轮改动
- 不要做：
  - 不实现真实 Tier 2 深扫
  - 不新增滚动扫描逻辑
  - 不扩展 Android 自动发送
  - 不恢复 Web 主链路
  - 不扩展多账号、后台、交付系统

### 输入材料
- `docs/technical-planning-tp-002-result.md`
- `docs/thread-status.md`
- `docs/technical-design.md`
- `docs/android-increment-test-report.md`
- `src/config.js`
- `src/index.js`
- `src/policy.js`
- `src/channels/android.js`
- `src/channels/android-ui.js`

### 输出要求
- 可运行代码
- 变更文件清单
- 测试说明
- 对用例 3 的修正说明
- 回归风险说明

### 明确实现要求

#### 1. 默认通道切换

- 在 `src/config.js` 中将默认 `channel.provider` 从 `web` 改为 `android`
- 保留显式环境变量覆盖能力
- 不删除 `web` 通道抽象

#### 2. 无新增消息分支收口

- 在 `src/index.js` / `src/policy.js` 中确保：
  - 候选无新增消息时不调用 LLM
  - 不发送业务通知
  - 不更新 `lastHandledAt`
  - 不更新 `lastHandledMessageHash`
  - 能返回列表并继续处理后续候选
- 该分支必须可支持用例 3 的稳定验证

#### 3. 标题确认逻辑不回退

- 保持 `src/channels/android.js` 中“详情页标题作为 canonical title”的处理
- 保持“列表标题与详情标题不一致时降级为 warning，而不是 fatal”逻辑
- 仅在点击后仍停留在列表页时，才视为真正导航失败

#### 4. 参数入口预留

- 在 `src/config.js` 或合适位置补充最小调度参数入口
- 默认值按 `TP-002`：
  - `tier1VisibleScreens = 1`
  - `tier2ExtraScreens = 1`
  - `tier1ToTier2Quota = 4`
- 本轮只允许参数入口存在，不允许接入真实深扫执行逻辑

### 文件级改动边界

本轮建议仅修改以下文件：

- `src/config.js`
- `src/index.js`
- `src/policy.js`
- `src/channels/android.js`
- `src/channels/android-ui.js`
- `test/monitor.test.js`
- `test/policy.test.js`

如无明确必要，不要扩大到其他文件。

### 验收映射

- 默认通道切换：
  - 不设置 `XHS_CHANNEL` 时默认走 `android`
  - 显式设置 `XHS_CHANNEL=web` 时仍可覆盖
- 用例 3：
  - 候选存在但无新增消息时，不调用 LLM、不发通知、不推进 cooldown，并继续后续候选
- 回归保护：
  - 用例 2 不回退
  - 用例 5 不回退
  - 用例 6 不回退
  - 不引入因新调度逻辑导致的导航失败

### 完成标准
- 默认通道与当前产品口径一致
- 用例 3 对应分支完成收口
- 现有串行重抓链路不回退
- 本轮未接入真实 Tier 2 深扫
- 输出结果可直接交给代码测试线程继续验证
