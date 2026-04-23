# 任务清单：事务流程节点

- [x] 定义事务动作结构
- [x] 增加审批闸门
- [x] 增加补偿与回退说明
- [x] 验证审计完整性

## 完成说明

- 已补齐 `transaction_flow` 共享契约，统一输入、审批、审计、补偿与执行结果结构。
- 已实现 `transaction_flow` node adapter 与 HTTP route，支持审批前等待、审批通过执行、审批拒绝拦截。
- 已将 `transaction_flow` 接入 Web-AIGC runtime extra adapters，形成 `wait -> resume -> advance` 的最小可执行闭环。
- 已补充 adapter、route、runtime 定向测试，覆盖审批闸门、审计事件和补偿说明。
