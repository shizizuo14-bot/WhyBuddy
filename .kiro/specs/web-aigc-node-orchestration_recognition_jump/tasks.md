# 任务清单：编排识别跳转节点

- [x] 定义目标编排识别结构
- [x] 定义跨编排跳转规则
- [x] 加入权限与审计校验
- [x] 验证上下文继承是否完整

## 完成说明

- 已补齐 `orchestration_recognition_jump` 共享契约，统一识别结果、目标编排、跳转信息、上下文继承与治理摘要结构。
- 已实现 `orchestration_recognition_jump` node adapter 与 HTTP route，支持按候选编排进行目标识别、显式 jump 目标返回与拒绝态反馈。
- 已将 `orchestration_recognition_jump` 接入 Web-AIGC runtime extra adapters，复用现有显式 `jump` 边机制完成跨编排跳转。
- 已补充 adapter、route、runtime 定向测试，覆盖目标识别、权限拒绝、审计留痕与上下文继承。
