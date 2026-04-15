# CT-002 测试结果报告

| 字段 | 值 |
| --- | --- |
| 线程 | 代码测试 |
| 任务卡 | CT-002 |
| 状态 | Completed |
| Created | 2026-04-15 |
| Last Updated | 2026-04-15 12:43 |

## 1. 测试目标

验证以下结论是否成立：

- 默认通道已切换到 Android
- 用例 3 对应“无新增消息”分支已稳定收口
- 用例 2、5、6 未回退
- 本轮仅引入调度参数入口，未接入真实 Tier 2 深扫
- 当前是否具备进入上传阶段前置条件

## 2. 输入材料

- `docs/technical-planning-tp-002-result.md`
- `docs/task-card-code-writing-002.md`
- `docs/thread-status.md`
- `docs/technical-design.md`
- `docs/android-increment-test-report.md`
- 本轮代码与测试文件：
  - `src/config.js`
  - `src/index.js`
  - `src/policy.js`
  - `src/channel.js`
  - `src/channels/android.js`
  - `test/channel.test.js`
  - `test/monitor.test.js`
  - `test/policy.test.js`

## 3. 执行方式

### 3.1 代码检查

- 检查默认通道配置与运行时入口
- 检查“无新增消息”分支是否仍推进处理状态
- 检查 Android 标题确认逻辑是否仍以详情页标题为准
- 检查是否只新增调度参数入口，没有真实深扫实现

### 3.2 本地测试

- 执行 `npm.cmd test`
- 重点关注：
  - `test/channel.test.js`
  - `test/monitor.test.js`
  - `test/policy.test.js`
  - 回归失败项

## 4. 通过项

- 默认通道切换通过：
  - `src/config.js` 默认 `channel.provider` 已为 `android`
  - `test/channel.test.js` 覆盖了“未设置 `XHS_CHANNEL` 默认走 `android`”和“显式设置 `XHS_CHANNEL=web` 仍可覆盖”
- 用例 3 分支逻辑通过：
  - `src/index.js` 在 `incrementMessages.length === 0` 时直接跳过
  - 该分支调用 `buildObservedConversationRecord()`，不会更新 `lastHandledAt`、`lastHandledMessageHash`
  - `test/monitor.test.js` 验证了：
    - 不调用额外 LLM
    - 不发送额外业务通知
    - 原有 cooldown 相关状态不被污染
    - 返回列表后继续处理后续真实候选
- 用例 2 回归保护通过：
  - `src/index.js` 将 `conversation.unreadCount` 传入 `getMessageIncrement()`
  - `src/policy.js` 新增首轮按 `unreadCount` 截取尾部增量逻辑
  - `test/monitor.test.js` 和 `test/policy.test.js` 覆盖“首次处理只取未读条数对应尾部消息”
- 用例 5 / 6 代码级保护通过：
  - `src/channels/android.js` 仍以详情页标题作为确认依据
  - 在仍停留列表页时会重试点击，不是立即 fatal
  - `test/monitor.test.js` 继续覆盖串行“处理一个 -> 重抓列表 -> 处理下一个”的主链路
- 参数入口边界通过：
  - 仅在 `src/config.js` 发现 `tier1VisibleScreens`、`tier2ExtraScreens`、`tier1ToTier2Quota`
  - 未发现真实 Tier 2 深扫、滚动扫描、深层候选池等实现代码

## 5. 失败项

- 完整本地测试套件未全部通过：
  - 实际结果为 `29/30`
  - 失败用例：`test/thread-status-project-sync.test.js`
  - 失败原因：`docs/thread-status.md` 中 `### 7.3 代码编写` 标题发生编码错乱，测试无法解析出“代码编写”分线程详情
- 因此，代码编写线程在共享状态板中写的“`npm.cmd test` 30/30 通过”与当前测试结果不一致

## 6. 风险项

- 用例 3 当前结论为“组合场景验证通过”，不是“独立构造稳定通过”
- `docs/thread-status.md` 当前存在结构/编码异常，不属于 Android 主链路逻辑，但会影响项目同步类测试与共享状态解析
- 共享状态板中的部分统一结论与最新测试事实不完全同步，例如：
  - “用例 2 和用例 5 已修复并验证通过”未在本线程本轮真机回归中重新确认
  - “默认通道仍偏向 web”已与当前代码状态不符

## 7. 用例 3 最终测试结论

- 结论：**仅在组合场景中验证通过**
- 依据：
  - 代码级测试已验证该分支在无新增消息时：
    - 不调用额外 LLM
    - 不发送额外业务通知
    - 不推进 cooldown
    - 会继续处理后续真实候选
  - 真机侧独立场景仍较难稳定人工构造
- 判定：
  - 满足 `TP-002` 中“允许通过组合场景验证该分支”的验收口径
  - 但不应表述为“独立构造通过”

## 8. 是否具备进入上传阶段前置条件

- 结论：**否**

原因：

1. 完整本地测试套件当前不是全绿，`npm.cmd test` 为 `29/30`
2. 失败项虽非 Android 主链路功能回退，但属于当前仓库的真实阻塞项
3. 用例 2、5 虽在代码级保护上已补齐，但本线程本轮未重新做真机回归确认，不应越权替代历史或其他线程结论

## 9. 建议下一步

- 由主线程决定是否要求修复 `docs/thread-status.md` 的结构/编码问题，使项目同步测试恢复通过
- 修复共享状态板解析失败后，重新执行 `npm.cmd test`
- 若主线程要求进入更严格上传前验收，建议补一轮真机回归：
  - 用例 2：消息增量边界
  - 用例 5：标题识别不阻断聚合
  - 用例 6：串行重抓链路

## 10. 线程结果

### 结论

已完成 `CT-002`：默认通道切换、用例 3 代码级收口和参数入口边界均验证成立，但当前完整测试套件仍有 1 项失败，因此不建议进入上传阶段。

### 关键结果

- 默认通道已切到 `android`，且保留 `web` 显式覆盖
- 用例 3 已以“组合场景验证通过”的口径收口
- 用例 2、5、6 在代码级保护上未见回退
- 未发现真实 Tier 2 深扫实现

### 风险/问题

- `docs/thread-status.md` 结构/编码异常导致项目同步测试失败
- 当前共享状态板有部分口径落后于真实代码和测试状态

### 建议下一步

- 先修复共享状态板解析失败，再重新跑完整测试
- 如需更高置信度，再补一轮真机回归用例 2、5、6

### 需要主线程决策

- 是否要求先修复共享状态板解析问题，再进入上传阶段
- 是否要求本线程补做一轮 `CT-002` 真机回归验证
