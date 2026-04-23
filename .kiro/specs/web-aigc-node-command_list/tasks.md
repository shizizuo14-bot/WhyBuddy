# 任务清单：命令列表节点

- [x] 定义候选命令列表结构
  已定义 `command_list` 最小候选结构：包含 `candidateId / label / commandText / description / recommended / source`，并为每个候选返回 `commands` 与 `clarification-preview` 两类目标调用描述。
- [x] 对接任务命令中心能力
  已通过 `POST /api/nl-command/command-list/generate` 生成候选命令，并输出指向现有 `/api/nl-command/commands` 与 `/api/nl-command/clarification-preview` 的调用目标，形成与现有命令中心的最小集成。
- [x] 与选择节点建立联动
  已输出兼容 HITL/selection 的 `selectionBridge`，可直接映射为 `MissionDecision` 选项；同时支持推荐候选的默认提交元数据。
- [x] 写入命令生成与选择事件
  已实现内存事件存储，分别记录 `generated` 与 `selected` 事件，并为选中结果返回兼容 `branchKey / interactionId / formData` 的选择元数据。
