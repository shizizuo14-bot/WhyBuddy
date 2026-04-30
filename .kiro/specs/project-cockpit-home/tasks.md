# 任务清单：Project Cockpit Home

- [x] 在 Home 中接入当前项目状态
- [x] 实现无项目首页空状态：创建项目、模板、导入资料
- [x] 实现当前项目 header：项目选择、状态、目标摘要
- [x] 将首页主文案从“发起任务”调整为“推进当前项目”
- [x] 将 `UnifiedLaunchComposer` 嵌入当前项目上下文
- [x] 为项目阶段实现不同的主面板展示
- [x] 将任务中心入口改为“查看执行明细 / 接管任务”
- [x] 将 3D Office / HUD 文案和视觉权重调整为状态可视化
- [x] 增加项目沉淀摘要：Spec、Route、Missions、Artifacts、Evidence
- [x] 确保窄屏下当前项目、下一步建议和输入框优先展示
- [x] 补充 Home / OfficeTaskCockpit 测试，覆盖无项目、有项目、执行中状态

## 审计说明（2026-04-30）

- Home 首屏已切换为 Project Cockpit 叙事：无项目时显示创建第一个项目的主引导，有项目时显示当前项目名称、状态、目标摘要。
- 首页 hero 已展示项目沉淀摘要计数：Projects、Specs、Routes、Missions、Evidence。
- `UnifiedLaunchComposer` 已在输入框上方常驻展示项目上下文条；无项目时提示第一次输入会创建项目。
- 侧边栏已将“项目空间”提升为首页主入口，自动驾驶降为项目内能力入口。
- 无项目首页已补齐快速项目模板与导入资料入口；导入资料会创建项目并登记 artifact。
- 当前项目 header 已包含项目名称、状态、目标摘要、沉淀计数和多项目切换条。
- 顶部任务入口已从任务工作台改为执行明细 / 接管任务，3D 墙面标题从 Autopilot Control 收敛为执行监控。
- Home 已按项目状态展示下一步阶段面板：创建、澄清、Spec、路线、执行、证据回放分别给出不同提示。
- 窄屏首屏已优先展示当前项目、下一步建议和 `UnifiedLaunchComposer` compact 输入框，工作流 / 配置入口降到输入之后。
