# Requirements Document

## Introduction

本 spec 用于在 `2026-05-28` 这个时间点，对仓库中三份 steering 文件里关于"项目体量 / 维护快照 / 主线进度"的旧数字写法做一次定点刷新。范围被严格限定在三份文件，不重写正文叙述、不引入新的章节，仅替换已经过时的数量级口径，使其与 `2026-05-28` 实测仓库快照对齐。

本次变更不涉及代码、测试、运行时或部署，只触达 `.kiro/steering/` 下三份 markdown，目的是让后续基于这些 steering 自动注入上下文的工作流读到当前真实的仓库体量，而不是 2026-04 时点的旧数字。

## Glossary

- **Steering_File_Set**: 本次刷新涉及的三份 steering 文件集合：`.kiro/steering/project-overview.md`、`.kiro/steering/execution-plan.md`、`.kiro/steering/project-first-spec-roadmap-2026-04-30.md`
- **Project_Overview_Doc**: `.kiro/steering/project-overview.md`，仓库总览 steering，含"项目规模"段
- **Execution_Plan_Doc**: `.kiro/steering/execution-plan.md`，执行计划 steering，含顶部"总览 / 当前维护快照"段
- **Spec_Roadmap_Doc**: `.kiro/steering/project-first-spec-roadmap-2026-04-30.md`，Project-first 路线图 steering，含 "10/10 / 123/123 封板"原句
- **Snapshot_2026_05_28**: `2026-05-28` 实测的仓库快照数据集合，包含以下口径：
  - Git 跟踪文件 `5,152` 份；Git 提交 `748` 次
  - TypeScript / TSX `2,130` 文件 / `~545,000` 行，分布为 `server 1,004 / 290K`（routes 391、core 100、tests 362、feishu 13、audit 12、lineage 7、tasks 7）、`client/src 916 / 217K`（components 342、pages 314、lib 209）、`shared 139 / 26K`、`services 68 / 12K`
  - Markdown `1,074` 份
  - 测试文件（`.test` / `.spec`）`866` 份，其中 `server/tests 362` 份
  - Specs 目录 `287` 个，`requirements.md 285`、`design.md 286`、`tasks.md 286`、`bugfix.md 3`
  - Tasks checkbox 总数 `8,806`，已勾选 `7,887`（`89.6%`），未勾选 `919`
- **Legacy_Volume_Phrasing**: 三份文件中已经过时的体量与时点描述，包括但不限于 `project-overview.md` "项目规模"段中的 `850+ 文件 / ~180,000 行 TypeScript` 等数字、`execution-plan.md` 顶部"截至 2026-04-21，`.kiro/specs` 共 77 个目录"等 2026-04-21 旧时点描述
- **Spec_Closure_Sentence**: `Spec_Roadmap_Doc` 中 `2026-05-21 进度更新` 段内"`10/10` specs 已全部完成，`123/123` 任务项已封板"原句
- **Footnote_Anchor_2026_05_28**: 在 `Spec_Closure_Sentence` 之后追加的、指向 `2026-05-28` 总仓体量（`287 specs / tasks 89.6%`）的脚注句

## Requirements

### Requirement 1: 刷新范围严格限定为三份 steering 文件

**User Story:** 作为 steering 维护者，我希望本次刷新只触达指定的三份 steering 文件，这样我可以避免顺手改动其他文档，保持本轮变更的可审计性

#### Acceptance Criteria

1. THE Steering_File_Set SHALL 仅包含 `.kiro/steering/project-overview.md`、`.kiro/steering/execution-plan.md`、`.kiro/steering/project-first-spec-roadmap-2026-04-30.md` 三份文件。
2. WHEN 本轮刷新提交完成，THE Steering_File_Set 之外的所有文件 SHALL 保持本次任务开始前的内容不变。
3. IF 在执行过程中出现"顺带修一下别的 steering / spec / 代码"的需求，THEN THE 当前 spec SHALL 拒绝在本轮变更内承载该需求，并将其留给后续单独的 spec 处理。

### Requirement 2: 在 Project_Overview_Doc "项目规模"段原地覆写旧数字

**User Story:** 作为 steering 读者，我希望 `project-overview.md` 的"项目规模"段直接呈现 `2026-05-28` 的仓库体量数字，这样我读到的总览不再被 2026-04 时点的旧口径误导

#### Acceptance Criteria

1. WHEN 编辑 Project_Overview_Doc 的"项目规模"段，THE Project_Overview_Doc SHALL 用 Snapshot_2026_05_28 中的 TypeScript / TSX 文件数与代码行数（`2,130` 文件 / `~545,000` 行）原地替换 `850+ 文件 / ~180,000 行 TypeScript` 这一旧口径。
2. THE Project_Overview_Doc SHALL 在同一段中以子条目形式列出 Snapshot_2026_05_28 的 server / client/src / shared / services 四个分布口径，且每个口径包含"文件数 / 代码行数 / 主要子目录文件数明细"。
3. THE Project_Overview_Doc SHALL 在同一段中加入 Snapshot_2026_05_28 的 Markdown 文件总数（`1,074`）、测试文件总数（`866`，其中 `server/tests 362`）、specs 目录数（`287`）与 specs 子文档计数（`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`）、Tasks checkbox 总数与勾选数（`8,806` 总、`7,887` 已勾选、`919` 未勾选、勾选率 `89.6%`）。
4. THE Project_Overview_Doc SHALL 在该段中加入 Snapshot_2026_05_28 的 Git 跟踪文件总数（`5,152`）与 Git 提交总数（`748`）。
5. THE Project_Overview_Doc SHALL NOT 在"项目规模"段保留 `850+ 文件`、`~180,000 行 TypeScript` 或任何"原口径……"风格的历史脚注。
6. THE Project_Overview_Doc SHALL 在"项目规模"段或紧邻位置以纯文本方式标注本组数字的快照时点为 `2026-05-28`，使读者能立即识别该口径的有效时点。
7. WHERE Project_Overview_Doc 的其他段落（例如 `2026-04-26 增补`、`系统架构`、`模块完成状态`、`核心数据流`、`项目目录结构`、`REST API 总览`、`开发规范`、`环境变量分组`、`常用命令` 等）已存在， THE Project_Overview_Doc SHALL 保持这些段落的现有文字与结构不变，本次变更只触达"项目规模"段及其紧邻的快照时点标注。

### Requirement 3: 在 Execution_Plan_Doc 顶部"总览 / 当前维护快照"原地覆写旧时点描述

**User Story:** 作为执行计划读者，我希望 `execution-plan.md` 顶部的"总览 / 当前维护快照"直接呈现 `2026-05-28` 的仓库体量数字，这样我看到的近端节奏描述不再以 `2026-04-21` 作为时点

#### Acceptance Criteria

1. WHEN 编辑 Execution_Plan_Doc 的`## 总览`段，THE Execution_Plan_Doc SHALL 用 Snapshot_2026_05_28 的 specs 目录数（`287`）原地替换"截至 2026-04-21，`.kiro/specs` 共 77 个目录"中的 `2026-04-21` 时点与 `77` 这一旧数字。
2. THE Execution_Plan_Doc SHALL 在同一段中加入 Snapshot_2026_05_28 的 specs 子文档计数（`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`）与 Tasks checkbox 勾选率（`7,887 / 8,806`，`89.6%`）。
3. THE Execution_Plan_Doc SHALL 在`## 当前维护快照（2026-04-15）`段或其紧邻位置新增一条以 `2026-05-28` 为时点的体量快照，覆盖 TypeScript / TSX 文件数与代码行数（`2,130` 文件 / `~545,000` 行）、Markdown 文件数（`1,074`）、测试文件数（`866`，其中 `server/tests 362`）、Git 跟踪文件数（`5,152`）与 Git 提交数（`748`）。
4. THE Execution_Plan_Doc SHALL NOT 在被刷新的段落保留 `2026-04-21` 旧时点字样、`77 个目录` 或任何"原口径……"风格的历史脚注。
5. WHERE Execution_Plan_Doc 中存在与"项目规模 / 仓库体量"无关的章节（例如`阶段 0`、`第一层`、`第二层`、`第三层`、`第四层`、`Worktree 命名参考`、`推荐执行时间线`、`关键路径`、`风险提示`、`2026-04-15 增补`、`2026-04-16 新增主线收敛 specs`、`本周可执行 Checklist`），THE Execution_Plan_Doc SHALL 保持这些章节的既有文字与结构不变。
6. THE Execution_Plan_Doc SHALL 在被刷新的段落中以纯文本方式标注本组数字的快照时点为 `2026-05-28`，使读者能立即识别该口径的有效时点。

### Requirement 4: 在 Spec_Roadmap_Doc 保留封板原句并仅追加 2026-05-28 脚注

**User Story:** 作为 Project-first 路线图读者，我希望 `project-first-spec-roadmap-2026-04-30.md` 继续保留 "`10/10 / 123/123` 封板"这一历史事实，同时能立即看到 `2026-05-28` 时点的总仓体量与勾选率，这样我既能追溯 Project-first 系列的封板事实，又能感知整个仓库当前的实际推进度

#### Acceptance Criteria

1. THE Spec_Roadmap_Doc SHALL 保留 Spec_Closure_Sentence（"`10/10` specs 已全部完成，`123/123` 任务项已封板"）的现有措辞与位置不变。
2. WHEN 编辑 Spec_Roadmap_Doc 的`## 2026-05-21 进度更新`段，THE Spec_Roadmap_Doc SHALL 在 Spec_Closure_Sentence 之后新增一句 Footnote_Anchor_2026_05_28，明确说明 `2026-05-28` 时点的总仓体量为 `287` 个 specs、Tasks checkbox 勾选率 `89.6%`（`7,887 / 8,806`）。
3. THE Footnote_Anchor_2026_05_28 SHALL 显式声明其作用域指向"全仓 specs 与 tasks 总量"，而不是 Project-first 系列 `10/10 / 123/123` 范围。
4. THE Spec_Roadmap_Doc SHALL NOT 修改 Spec_Closure_Sentence 之外的任何既有句子（包括`## 一句话方向`、`## 本轮创建的 specs`表、`## 第一阶段建议开发范围`至`## 第四阶段建议开发范围`、`## 后置 specs`、`## 关键边界`等段落）。
5. THE Spec_Roadmap_Doc SHALL NOT 在 Spec_Closure_Sentence 周边引入"原口径……"或"旧数字……"等历史脚注措辞。

### Requirement 5: 本次刷新不修改任何 steering 文件之外的对象

**User Story:** 作为代码与运行时维护者，我希望本轮 steering 数字刷新不连带改动代码、测试、运行时或部署对象，这样可以保证本次变更的影响面只在文档语义层

#### Acceptance Criteria

1. THE 当前 spec SHALL 仅产出对 Steering_File_Set 内三份 markdown 的文本编辑。
2. THE 当前 spec SHALL NOT 引入对 `client/`、`server/`、`shared/`、`services/`、`scripts/`、`docs/`、`.github/` 或任何运行时配置文件的修改。
3. IF 实施过程中发现 Snapshot_2026_05_28 与代码 / 测试 / 运行时实际状态出现不一致，THEN THE 当前 spec SHALL 仅在 Steering_File_Set 中据实记录文档侧的数字，并把"代码 / 测试 / 运行时层面的对齐"留给后续单独的 spec 处理。
4. THE 当前 spec SHALL NOT 调整 `.kiro/specs/` 下任何其他 spec 目录的 `requirements.md` / `design.md` / `tasks.md` / `bugfix.md`。

### Requirement 6: 刷新后的数字与 Snapshot_2026_05_28 完全一致

**User Story:** 作为下游自动化（包括基于 steering 自动注入上下文的工作流），我希望刷新后的三份 steering 文件中所有体量数字都直接复用 Snapshot_2026_05_28 的口径，这样我读到的数字可以与仓库实测一一对账

#### Acceptance Criteria

1. WHEN 在 Steering_File_Set 中出现 Snapshot_2026_05_28 范围内的体量字段，THE Steering_File_Set SHALL 使用与 Snapshot_2026_05_28 完全一致的数值（例如 specs 目录数 `287`、`tasks.md` 总数 `286`、Tasks checkbox 勾选数 `7,887` 与勾选率 `89.6%`）。
2. THE Steering_File_Set SHALL 在表达 TypeScript / TSX 总量时统一使用 `2,130` 文件 / `~545,000` 行 的写法，且在分布口径中保持 server / client/src / shared / services 四个一级条目的顺序与 Snapshot_2026_05_28 一致。
3. THE Steering_File_Set SHALL 在表达 Tasks checkbox 勾选率时同时呈现"已勾选 / 总数 / 百分比"三段（`7,887 / 8,806 / 89.6%`），不得只写百分比或只写绝对数。
4. IF Snapshot_2026_05_28 中的某项数字在 Steering_File_Set 的某段中没有对应的展示位置，THEN THE 当前 spec SHALL NOT 强行新增章节去承载该项数字，而是按 Requirement 2 / Requirement 3 / Requirement 4 的范围约束保留该项数字仅出现在最自然的段落中。
