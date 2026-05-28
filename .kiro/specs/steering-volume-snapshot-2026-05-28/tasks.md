# Implementation Plan: Steering Volume Snapshot 2026-05-28

## Overview

本计划把 design 中定义的 4 个编辑单元（EU-1 / EU-2A / EU-2B / EU-3）拆为 3 个文件级主任务 + 1 个全局验证任务。每个主任务都对应一份 steering 文件，使用 `str_replace` 进行精确的 oldStr / newStr 替换；验证任务统一回放 design `## 验证策略` 中的 6 节断言，守护 5 条正确性属性。

本计划不涉及代码、测试、运行时或部署改动，仅产出对 Steering_File_Set 三份 markdown 的文本编辑。

## Tasks

- [x] 1. 刷新 `project-overview.md` "## 项目规模" 段（EU-1）
  - 目标文件：`.kiro/steering/project-overview.md`
  - 单一编辑单元（EU-1），整段原地覆写：删 1 行 + 增 N 行
  - 编辑步骤：
    1. 先用 `rg -F "- 850+ 文件 / ~180,000 行 TypeScript" .kiro/steering/project-overview.md | wc -l` 验证 oldStr 全文唯一匹配（期望 `1`）。
    2. 再用 `str_replace` 一次性完成替换。
  - **oldStr**（逐字匹配，含末尾换行）：

    ```
    - 850+ 文件 / ~180,000 行 TypeScript
    ```

  - **newStr**（按 design `## File 1` 的"刷新后段落（结构契约）"逐行写入；需先在 `## 项目规模` 标题下空一行追加 `> 体量快照时点：'2026-05-28'` 引用行，再写下表所列的 6 条新增条目；原 `850+ 文件` 行整行替换为新增 6 条）：

    ```markdown
    - `2,130` 文件 / `~545,000` 行 TypeScript / TSX
      - server：`1,004` 文件 / `290K` 行（routes 391 / core 100 / tests 362 / feishu 13 / audit 12 / lineage 7 / tasks 7）
      - client/src：`916` 文件 / `217K` 行（components 342 / pages 314 / lib 209）
      - shared：`139` 文件 / `26K` 行
      - services：`68` 文件 / `12K` 行
    - Markdown 文件 `1,074` 份；测试文件（`.test` / `.spec`）`866` 份，其中 `server/tests 362` 份
    - `.kiro/specs/` 目录 `287` 个：`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`
    - Tasks checkbox `7,887 / 8,806`（`89.6%`），未勾选 `919`
    - Git 跟踪文件 `5,152` 份，Git 提交 `748` 次
    ```

  - 同步在 `## 项目规模` 标题之后、TS 总量行之前插入"快照时点"引用行 `> 体量快照时点：'2026-05-28'`（用 `2026-05-28` 替换示例中的占位）；该插入与上述列表替换共一次 `str_replace`，oldStr 保持上下文唯一。
  - 验收要点：
    - 段落内不再出现 `850+ 文件` / `~180,000 行` / `原口径` / `旧数字`。
    - 段落内出现 `2,130` / `~545,000` / `1,004` / `290K` / `916` / `217K` / `139` / `26K` / `68` / `12K` / `1,074` / `866` / `362` / `287` / `285` / `286` / `8,806` / `7,887` / `919` / `89.6%` / `5,152` / `748` / `2026-05-28`。
    - server → client/src → shared → services 四个一级条目顺序固定。
    - `## 项目规模` 段以下的引用块"说明：本页以 2026-04-26 Task Autopilot Phase 1 闭环后状态为准；……"逐字不变。
    - 段后所有原 `-` 条目（`web-aigc 58 / 58` 起至 `大量单元测试……`）逐字保留。
  - _Implements: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5, REQ-2.6, REQ-2.7_
  - _Validates: Property 2, Property 3, Property 4, Property 5_

- [x] 2. 刷新 `execution-plan.md` "## 总览 / ## 当前维护快照（2026-04-15）" 段（EU-2A + EU-2B）
  - 目标文件：`.kiro/steering/execution-plan.md`
  - 双编辑单元；两次 `str_replace` 顺序执行（先 EU-2A，再 EU-2B），同一文件上不可并行。

  - [x] 2.1 EU-2A：`## 总览` 段首句替换
    - 编辑步骤：
      1. 先用 `rg -F "截至 2026-04-21，\`.kiro/specs\` 共 77 个目录。" .kiro/steering/execution-plan.md | wc -l` 验证 oldStr 全文唯一匹配（期望 `1`）。
      2. 再用 `str_replace` 完成首句替换。
    - **oldStr**：

      ```
      截至 2026-04-21，`.kiro/specs` 共 77 个目录。
      ```

    - **newStr**：

      ```
      截至 2026-05-28，`.kiro/specs` 共 287 个目录（`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`），Tasks checkbox 勾选率 `7,887 / 8,806`（`89.6%`）。
      ```

    - 验收要点：
      - `## 总览` 段第二句起原文（`前三层主线与补充 spec 'holographic-ui'……平台层能力（L31-L38）仍待环境就绪。`）逐字不变。
      - `## 总览` 段后的 `> **维护说明**……` 引用块逐字不变。
      - 在 `## 总览` 至 `## 已完成归档模块` 之间不再出现 `截至 2026-04-21` / `77 个目录` / `原口径` / `旧数字`。
    - _Implements: REQ-3.1, REQ-3.2, REQ-3.4, REQ-3.6_
    - _Validates: Property 2, Property 3, Property 4, Property 5_

  - [x] 2.2 EU-2B：`## 当前维护快照（2026-04-15）` 段紧邻位置追加 `2026-05-28` 体量快照条目
    - 编辑步骤：
      1. 先用 `rg -F "## 当前维护快照（2026-04-15）" .kiro/steering/execution-plan.md | wc -l` 验证标题唯一匹配（期望 `1`）。
      2. 再用 `str_replace` 在标题之后、原首条 `- 已合并主线：……` 之前，插入一条独立项目符号；标题文字本身保持不变。
    - **oldStr**（用标题 + 空行 + 首条 `- 已合并主线：` 作为唯一上下文）：

      ```
      ## 当前维护快照（2026-04-15）

      - 已合并主线：
      ```

    - **newStr**：

      ```
      ## 当前维护快照（2026-04-15）

      - 体量快照（`2026-05-28`）：TypeScript / TSX `2,130` 文件 / `~545,000` 行；Markdown `1,074` 份；测试文件 `866` 份，其中 `server/tests 362` 份；Git 跟踪文件 `5,152` 份，Git 提交 `748` 次。
      - 已合并主线：
      ```

    - 验收要点：
      - 标题 `## 当前维护快照（2026-04-15）` 文字不变（保留作为历史时点 anchor）。
      - 原有所有 `-` 条目逐字保留、顺序不变。
      - `## 阶段 0：契约先行（并行前必须完成）` 及其后所有章节逐字不变。
    - _Implements: REQ-3.3, REQ-3.5, REQ-3.6_
    - _Validates: Property 2, Property 4, Property 5_

- [x] 3. 在 `project-first-spec-roadmap-2026-04-30.md` 封板句之后追加 `2026-05-28` 全仓体量脚注（EU-3）
  - 目标文件：`.kiro/steering/project-first-spec-roadmap-2026-04-30.md`
  - 单一编辑单元；封板句必须逐字保留，仅在其下一行插入引用脚注。
  - 编辑步骤：
    1. 先用 ``rg -F 'Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。' .kiro/steering/project-first-spec-roadmap-2026-04-30.md | wc -l`` 验证封板句唯一匹配（期望 `1`）。
    2. 再用 `str_replace` 在封板句与 `详见：` 之间插入引用块脚注。
  - **oldStr**（封板句 + 两个换行 + `详见：` 作为唯一上下文）：

    ```
    Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。

    详见：
    ```

  - **newStr**：

    ```
    Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。

    > 全仓体量脚注（`2026-05-28`）：上述 `10/10` 与 `123/123` 仅指 Project-first 系列；同期全仓 `.kiro/specs/` 目录共 `287` 个，Tasks checkbox 勾选率 `7,887 / 8,806`（`89.6%`）。

    详见：
    ```

  - 验收要点：
    - 封板句 ``Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。`` 在文件中精确出现 1 次，且字符级未变。
    - 新增脚注以 `>` 引用块形式与封板句明确区分。
    - 脚注显式声明作用域为"全仓"（措辞包含"全仓"）。
    - 脚注同时包含 `2026-05-28` / `287` / `7,887` / `8,806` / `89.6%`。
    - 不出现 `原口径` / `旧数字` 措辞。
    - 文件其他段落（`## 一句话方向` / `## 本轮创建的 specs` / `## 第一阶段建议开发范围` 至 `## 第四阶段建议开发范围` / `## 后置 specs` / `## 关键边界`）逐字不变。
  - _Implements: REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.4, REQ-4.5_
  - _Validates: Property 2, Property 3, Property 4, Property 5_

- [x] 4. 全局验证：执行 design `## 验证策略` 全部断言并对账 Snapshot_2026_05_28
  - 目标：在 Task 1–3 全部完成后，回放 design `## 验证策略` §1–§6 的命令模板，确保 5 条正确性属性同时成立。
  - 此任务为纯文本断言，不引入构建 / 单测 / PBT；任一断言失败必须 `git checkout -- <path>` 回滚相应文件并修正工艺后重做。

  - [x] 4.1 §1 改动作用域断言（守护 Property 1）
    - 执行 `git diff --name-only HEAD`；输出集合必须严格等于以下 7 项：
      - `.kiro/specs/steering-volume-snapshot-2026-05-28/.config.kiro`
      - `.kiro/specs/steering-volume-snapshot-2026-05-28/requirements.md`
      - `.kiro/specs/steering-volume-snapshot-2026-05-28/design.md`
      - `.kiro/specs/steering-volume-snapshot-2026-05-28/tasks.md`
      - `.kiro/steering/project-overview.md`
      - `.kiro/steering/execution-plan.md`
      - `.kiro/steering/project-first-spec-roadmap-2026-04-30.md`
    - 跑负向断言三连：
      - ``git diff --name-only HEAD | rg '^(client|server|shared|services|scripts|docs|\.github)/'`` 必须无输出。
      - ``git diff --name-only HEAD | rg '^\.kiro/specs/(?!steering-volume-snapshot-2026-05-28/)'`` 必须无输出。
      - ``git diff --name-only HEAD | rg '^\.kiro/steering/' | rg -v '^\.kiro/steering/(project-overview|execution-plan|project-first-spec-roadmap-2026-04-30)\.md$'`` 必须无输出。
    - _Implements: REQ-1.1, REQ-1.2, REQ-1.3, REQ-5.1, REQ-5.2, REQ-5.4_
    - _Validates: Property 1_

  - [x] 4.2 §2 旧串消失断言（守护 Property 3）
    - `project-overview.md` 全文 `rg -n '850\+ 文件|~180,000 行|原口径|旧数字'` 必须无命中。
    - `execution-plan.md` 用 `awk '/^## 总览$/,/^## 已完成归档模块$/'` 截取 `## 总览` 段，再 `rg '截至 2026-04-21|77 个目录|原口径|旧数字'` 必须无命中。
    - `project-first-spec-roadmap-2026-04-30.md` 全文 `rg -n '原口径|旧数字'` 必须无命中。
    - _Implements: REQ-2.5, REQ-3.4, REQ-4.5_
    - _Validates: Property 3_

  - [x] 4.3 §3 新串就位断言（守护 Property 2 + Property 5）
    - 对 `project-overview.md` 逐项 `rg -F` 验证 design "Property 2" 列出的 23 个串全部命中。
    - 对 `execution-plan.md` 用 `awk '/^## 总览$/,/^## 阶段 0/'` 截取后，逐项 `rg -F` 验证 design 列出的 14 个串全部命中。
    - 对 `project-first-spec-roadmap-2026-04-30.md` 逐项 `rg -F` 验证 5 个串（`2026-05-28` / `287` / `7,887` / `8,806` / `89.6%`）全部命中且都位于封板句之后、`详见：` 之前。
    - _Implements: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.6, REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.6, REQ-4.2, REQ-4.3, REQ-6.1_
    - _Validates: Property 2_

  - [x] 4.4 §4 顺序与共现断言（守护 Property 5）
    - `project-overview.md` 在 `## 项目规模` 段内：用 `awk` + `rg -n` 取 server / client/src / shared / services 四个一级条目首行号，断言 `LINE_SERVER < LINE_CLIENT < LINE_SHARED < LINE_SERVICES`。
    - 三份目标文件分别用 `rg -n '7,887.*8,806.*89\.6%'` 断言"勾选率三段共现"在同一行命中 ≥ 1 次。
    - 全局 `rg -n '2,100|540,000|89%(?![.0-9])|90%'`（按需）确认无快照范围之外的近似数字。
    - _Implements: REQ-6.1, REQ-6.2, REQ-6.3_
    - _Validates: Property 5_

  - [x] 4.5 §5 封板句逐字保留断言（守护 Property 4）
    - 执行 ``rg -F 'Project-first 系列 \`10/10\` specs 已全部完成，\`123/123\` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。' .kiro/steering/project-first-spec-roadmap-2026-04-30.md | wc -l``，结果必须为 `1`。
    - 任何不等于 `1` 的输出都必须立即 `git checkout -- .kiro/steering/project-first-spec-roadmap-2026-04-30.md` 全量回滚后重做 Task 3。
    - _Implements: REQ-4.1, REQ-4.4_
    - _Validates: Property 4_

  - [x] 4.6 §6 非目标段落字符级稳定断言（守护 Property 4）
    - 对每份目标文件提取"非目标段落"内容（剔除 design 标定的目标段及其紧邻 `2026-05-28` 时点行），与 `git show HEAD:<file>` 的同区域内容做 `diff`，期望无差异。
    - 逐字核对：
      - `project-overview.md`：`## 项目规模` 段以下的引用块"说明：本页以 2026-04-26 Task Autopilot Phase 1 闭环后状态为准；……"未变；段后所有原 `-` 条目顺序与文字未变。
      - `execution-plan.md`：`## 已完成归档模块` 起至文件结尾全部章节字符级未变；`## 当前维护快照（2026-04-15）` 标题文字未变，原有 `-` 条目顺序未变。
      - `project-first-spec-roadmap-2026-04-30.md`：除新增引用脚注行之外的所有内容字符级未变。
    - _Implements: REQ-2.7, REQ-3.5, REQ-4.4, REQ-5.3, REQ-6.4_
    - _Validates: Property 4_

  - [x] 4.7 完成条件（DoD）人肉复核
    - 逐字阅读三份文件的目标段落，确认无"原口径"/"旧数字"风格历史脚注，无快照范围外的近似数字（如 `2,100` / `540K` / `89%` / `90%`）。
    - 确认 Snapshot_2026_05_28 数字台账每一项数字在三份文件中可被找到 ≥ 1 次（按 REQ-6.4 不强行新增章节而无对应展示位的字段除外）。
    - 确认 4.1–4.6 全部断言通过；任一失败必须回滚相应任务并重做。
    - _Implements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-6.1, REQ-6.2, REQ-6.3, REQ-6.4_
    - _Validates: Property 1, Property 2, Property 3, Property 4, Property 5_

## Notes

- 本计划是一次纯 markdown 文档维护任务，不构建、不运行单测 / 集成测试 / PBT；"测试"等价于 design `## 验证策略` 的文本断言。
- Task 1 / Task 2 / Task 3 各自独占一份文件，互不冲突；但同一文件内部的 EU-2A 与 EU-2B 必须串行（先首句替换，再快照插入）。
- Task 4 是纯验证任务，必须在 Task 1–3 全部落盘后启动；任一断言失败立刻回滚相应文件并重做。
- 每个 `str_replace` 在执行前必须先用 `rg -F "<oldStr>" <file> | wc -l` 确认全文唯一匹配（期望 `1`）；不得用 `fs_write` 全文件覆盖绕过 anchor 守护。
- 所有数字必须 **逐字** 引用 design `## Snapshot_2026_05_28 数字台账`，不允许就近近似（如 `2,100` / `540K` / `89%`）。
- 封板句逐字保留是 Task 3 的硬约束；任何字符级偏移都视为失败。
- 若实施过程中发现 Snapshot_2026_05_28 与代码 / 测试 / 运行时实际状态不一致，按 REQ-5.3 仅在 steering 中据实记录文档侧数字，不顺手对齐其他对象，差异留给后续单独 spec 处理。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "3"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 3, "tasks": ["4.7"] }
  ]
}
```
