目标：审查当前迁移工作区的 staged/index 边界。

约束：
- 不要自动提交。
- 不要自动 git add。
- 如果 baseline gate 通过，只做 Codex review 并输出报告。
- 如果 baseline gate 失败，停给人工处理。
