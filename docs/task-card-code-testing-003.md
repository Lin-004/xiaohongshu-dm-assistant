# 线程任务卡

### 线程
代码测试

### 编号
CT-003

### 目标
在主线程修正 `docs/thread-status.md` 后，复验完整测试套件与 GitHub Project 同步 dry-run，确认共享状态板解析是否恢复，并给出是否具备进入上传阶段前置条件的结论。

### 范围
- 要做：
  - 重新执行 `npm.cmd test`
  - 重点确认 `test/thread-status-project-sync.test.js` 是否恢复通过
  - 执行 `npm run sync:project -- --dry-run`
  - 确认 dry-run 能解析出 10 个 draft items，且标题集合完整
  - 如果仍失败，明确问题位于 `docs/thread-status.md`、同步脚本解析，还是测试假设本身
  - 基于复验结果更新是否建议进入上传阶段
- 不要做：
  - 不重构业务代码
  - 不扩展到 Android 自动发送
  - 不恢复 Web 主链路
  - 不替代主线程做最终发布决定

### 输入材料
- `docs/thread-status.md`
- `docs/code-testing-ct-002-result.md`
- `src/thread-status-project-sync.js`
- `scripts/sync-thread-status.js`
- `test/thread-status-project-sync.test.js`
- `package.json`

### 输出要求
- 一份测试结果报告
- 明确列出：
  - 完整测试套件结果
  - `thread-status-project-sync` 相关验证结果
  - 失败项或风险项
  - 是否建议进入上传阶段

### 明确测试要求

#### 1. 完整测试套件

- 执行 `npm.cmd test`
- 记录总通过数 / 总失败数
- 如仍存在失败项，列出失败用例名称和直接原因

#### 2. 状态板解析与同步 dry-run

- 执行 `npm run sync:project -- --dry-run`
- 重点验证：
  - `draftCount = 10`
  - 标题集合仍为：
    - `[Current] Main / Product Planning`
    - `[Next] Main / Product Planning`
    - `[Current] Technical Planning`
    - `[Next] Technical Planning`
    - `[Current] Coding`
    - `[Next] Coding`
    - `[Current] Testing`
    - `[Next] Testing`
    - `[Current] Delivery`
    - `[Next] Delivery`
- 若 dry-run 输出与当前状态板口径不一致，直接记为失败项或风险项

#### 3. 上传前置条件判断

- 只有在以下条件同时成立时，才可建议进入上传阶段：
  - `npm.cmd test` 全绿
  - `thread-status-project-sync` 相关测试通过
  - `npm run sync:project -- --dry-run` 输出正常，且与当前状态板一致
- 如任一条件不满足，结论必须为“不建议进入上传阶段”

### 完成标准
- 有明确的完整测试结果
- 有明确的 dry-run 验证结果
- 有明确的失败项或风险项
- 有明确的上传建议结论
