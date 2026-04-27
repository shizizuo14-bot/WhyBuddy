# 任务清单：自动驾驶空状态与新手引导

- [x] 设计 launch 入口空状态。
- [x] 增加快速、标准、深度、补路标、高级执行五类示例目的地。
- [x] 示例点击后填入输入框并触发路线预览。
- [x] 增加“为什么这样输入”的简短说明。
- [x] 增加首次进入 cockpit 的轻量引导。
- [x] 增加帮助入口，可重新打开引导。
- [x] 为熟练用户提供关闭/折叠引导能力。
- [x] 回补 `task-autopilot-platform-positioning` 中用户态示例表达。
- [x] 检查 README / README.zh-CN 示例与前端示例是否一致。
- [x] 避免示例触发当前不支持的执行能力。
- [x] 为示例输入触发 route plan 增加测试。
- [x] 为中文/英文 onboarding 文案补齐一致性检查。

## 代码侧一致性标记

- `AUTOPILOT_LAUNCH_EXAMPLE_CONSISTENCY_MARKER` 标记当前前端示例集为 `code-side-autopilot-launch-examples-v1`，用于在不编辑 README / ROADMAP 的前提下锚定代码侧示例一致性。
