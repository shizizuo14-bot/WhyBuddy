# Design Document

## Overview

本 spec 是一次 **纯 markdown 文档维护任务**：在 `2026-05-28` 这个时间点，对仓库中三份 steering 文件里"项目体量 / 维护快照 / 主线进度"相关的旧数字写法做一次定点刷新，使其与 `Snapshot_2026_05_28` 实测仓库快照对齐。

任务作用域被严格限制为：

```
.kiro/steering/project-overview.md
.kiro/steering/execution-plan.md
.kiro/steering/project-first-spec-roadmap-2026-04-30.md
```

不涉及任何代码、测试、运行时或部署对象的改动；不重写正文叙述、不引入新章节，只在已存在的目标段落内做"原地覆写 / 追加脚注"。

因此本设计文档的形态与常规功能 spec 不同：没有架构图、没有 API、没有运行时数据模型、没有运行时错误处理；取而代之的是 **目标段落定位策略、文本变更摘要、数字格式约定与验证策略**。下文标准小节（Architecture / Components and Interfaces / Data Models / Error Handling / Testing Strategy）按"文档维护任务"的语义进行了等价映射，而不是空占位。

## Architecture

本任务的"架构"是一个三节点静态文件树，不存在运行时组件。其拓扑、改动权限与守护边界如下：

```
.kiro/steering/
├── project-overview.md ─────── [改]  仅 ## 项目规模 段
├── execution-plan.md ────────── [改]  仅 ## 总览 段首句 + ## 当前维护快照（2026-04-15）段追加 1 条
└── project-first-spec-roadmap-2026-04-30.md ── [改]  仅在封板句之后追加 1 行脚注
其它文件 ─────────────────────── [冻结]  字符级不变（由 git diff --name-only 守护）
```

数据流向也极其简单：`Snapshot_2026_05_28 数字台账`（本设计文档"## Snapshot_2026_05_28 数字台账"小节）→ 三份目标 markdown 的指定段落。台账是唯一真源，文件之间不互相引用 / 派生数字。

## Components and Interfaces

本任务的"组件"是三个文档片段编辑单元，"接口"是它们各自的 anchor 字符串与变更契约。

| 编辑单元 | 文件 | Anchor（唯一定位字符串） | 变更类型 | 输入接口（oldStr / 上下文） | 输出接口（新段落结构） |
| -------- | ---- | ------------------------ | -------- | --------------------------- | ---------------------- |
| EU-1 项目规模段重写 | `project-overview.md` | `## 项目规模`（行 106） | 整段重写：删 1 行 + 增 N 行 | oldStr = `- 850+ 文件 / ~180,000 行 TypeScript\n` | 见 §"File 1" 刷新后段落契约 |
| EU-2A 总览段首句替换 | `execution-plan.md` | `## 总览`（行 18） | 句级替换 | oldStr = `截至 2026-04-21，\`.kiro/specs\` 共 77 个目录。` | 替换为含 `2026-05-28` / `287` / 子文档计数 / 勾选率的新句 |
| EU-2B 维护快照段插入 | `execution-plan.md` | `## 当前维护快照（2026-04-15）`（行 24） | 段首插入 1 项 | oldStr = `## 当前维护快照（2026-04-15）\n\n- 已合并主线：` | 在 `\n\n` 与 `- 已合并主线：` 之间插入 1 条 `2026-05-28` 体量快照 |
| EU-3 封板句脚注追加 | `project-first-spec-roadmap-2026-04-30.md` | `## 2026-05-21 进度更新`（行 4） | 行间插入（封板句逐字保留） | oldStr = `……作为后续深化实现的参考。\n\n详见：` | 在两个 `\n` 之间插入 1 行引用块脚注 |

每个编辑单元的契约要求 oldStr 在目标文件中"全文唯一匹配"；首次执行 `str_replace` 前必须用 `rg -F "<oldStr>" <file> | wc -l` 验证返回 `1`。

## Data Models

本任务的"数据模型"即"## Snapshot_2026_05_28 数字台账"小节给出的字段表。它在结构上等价于一个不可变的常量 record：

```
Snapshot_2026_05_28 = {
  git: { trackedFiles: 5152, commits: 748 },
  docs: { markdown: 1074 },
  tests: { total: 866, serverTests: 362 },
  typescript: {
    total: { files: 2130, lines: 545000 },
    distribution: [
      { dir: "server",     files: 1004, lines: "290K", subdirs: { routes: 391, core: 100, tests: 362, feishu: 13, audit: 12, lineage: 7, tasks: 7 } },
      { dir: "client/src", files:  916, lines: "217K", subdirs: { components: 342, pages: 314, lib: 209 } },
      { dir: "shared",     files:  139, lines: "26K" },
      { dir: "services",   files:   68, lines: "12K" }
    ]   // 顺序固定：server → client/src → shared → services
  },
  specs: {
    dirs: 287,
    perFile: { "requirements.md": 285, "design.md": 286, "tasks.md": 286, "bugfix.md": 3 }
  },
  tasks: { checked: 7887, total: 8806, unchecked: 919, ratePct: 89.6 }
}
```

字段写法约束（千分位、百分比、子目录行数 K 写法、勾选率三段共现）见"## Snapshot_2026_05_28 数字台账"末尾的"数字格式约定"。三份目标文件中每个写入数字字段都必须 **逐字** 引用本 record 的对应槽位，不允许就近近似。

## Error Handling

本任务无运行时；"错误"指文档编辑过程中可能引入的事故，及其检测与回滚策略。

| 错误类别 | 触发条件 | 检测手段 | 处置 |
| -------- | -------- | -------- | ---- |
| 改动外溢 | `git diff --name-only` 中出现非目标文件 | §"验证策略" §1 | 立即 `git checkout -- <path>` 还原；定位是哪一步带入并修正工艺 |
| oldStr 多匹配 | `str_replace` 报"匹配多处" | 工具返回值 | 给 oldStr 补充上下文行直至唯一；不允许用 `fs_write` 全文件覆盖绕过 |
| 数字写错 | 千分位 / 百分比 / 顺序违反约定 | §"验证策略" §3、§4 | 用 `str_replace` 局部修正；不允许整段重写 |
| 旧串残留 | `850+ 文件` / `~180,000 行` / `2026-04-21` / `77 个目录` 仍在被刷新段内 | §"验证策略" §2 | 定位残留位置，针对性删除；不允许用更大范围的 oldStr 一并替换 |
| 封板句被改 | File 3 封板句精确匹配计数 ≠ 1 | §"验证策略" §5 | 立即 `git checkout -- .kiro/steering/project-first-spec-roadmap-2026-04-30.md` 全量回滚后重做 |
| 非目标段落漂移 | §6 字符级 diff 在目标段之外有差异 | §"验证策略" §6 | 立即回滚并在更小粒度（段落级 oldStr）下重做 |
| 快照本身存疑 | 实测仓库与台账数字不一致 | reviewer 抽核 | 按 Requirement 5.3，本 spec 不顺手修正代码 / 测试 / 运行时；记录差异，转入后续单独 spec 处理 |

## Testing Strategy

本任务为纯 markdown 编辑，不构建、不运行单元测试 / 集成测试 / 属性测试代码。"测试"等价于"在三份目标文件上执行一组文本断言"，一一对应到 `Correctness Properties` 小节的 5 条属性：

| 属性 | 测试形态 | 工具 | 关键命令模板 |
| ---- | -------- | ---- | ------------ |
| Property 1 Scope Invariant | 作用域断言 | `git diff --name-only` + `rg` 负向匹配 | 见 §"验证策略" §1 |
| Property 2 Required Token Presence | 字段就位例子断言 | `rg -F` 逐字段计数 ≥ 1 | 见 §"验证策略" §3 |
| Property 3 Forbidden Token Absence | 禁用串属性断言 | 段落限定 `awk` + `rg` 计数 = 0 | 见 §"验证策略" §2 |
| Property 4 Non-target Section Stability | 字符级 diff + 精确句保留 | `git show HEAD~1:<file>` + `diff` + `rg -F` 计数 = 1 | 见 §"验证策略" §5、§6 |
| Property 5 Snapshot Consistency | 顺序 + 共现 + 写法属性断言 | `awk` 行号比较 + 行级共现 `rg` | 见 §"验证策略" §4 |

PBT / 随机化输入 / 覆盖率指标在此任务下无意义（无可测函数、无输入空间），因此本 spec 不引入 fast-check / Vitest 用例。所有验证手段在 §"验证策略"小节给出可执行的 `rg` / `awk` / `git` 命令模板，作为 reviewer 与执行者共享的对账协议。

## Out of Scope

为防止"顺手扩张"侵蚀本 spec 的可审计性，以下事项明确不在本轮处理：

- 任何代码、测试、配置、CI / 部署对象的修改
- 三份 steering 文件之外的 steering 文件
- `.kiro/specs/` 下其他 spec 的 `requirements.md` / `design.md` / `tasks.md` / `bugfix.md`
- 三份目标文件中"项目规模 / 当前维护快照 / 2026-05-21 进度更新"之外的段落正文
- 对 `Snapshot_2026_05_28` 与代码 / 测试 / 运行时实际状态不一致情况的修复（仅在 steering 中据实记录数字）

## Snapshot_2026_05_28 数字台账

下表是本轮所有写入数字的唯一真源；三份文件中任何与快照范围相关的数字必须 **逐字** 复用本表口径，不允许就近近似。

### Git 仓库总量

| 字段 | 值 | 写法 |
| ---- | -- | ---- |
| Git 跟踪文件数 | 5152 | `5,152` |
| Git 提交数 | 748 | `748` |

### 文档与测试

| 字段 | 值 | 写法 |
| ---- | -- | ---- |
| Markdown 文件数 | 1074 | `1,074` |
| 测试文件总数（`.test` / `.spec`） | 866 | `866` |
| 其中 `server/tests` 测试文件数 | 362 | `362` |

### TypeScript / TSX 体量

| 维度 | 文件数 | 代码行数 | 主要子目录文件数 |
| ---- | ------ | -------- | ---------------- |
| 总计 | `2,130` | `~545,000` | — |
| `server` | `1,004` | `290K` | routes 391 / core 100 / tests 362 / feishu 13 / audit 12 / lineage 7 / tasks 7 |
| `client/src` | `916` | `217K` | components 342 / pages 314 / lib 209 |
| `shared` | `139` | `26K` | — |
| `services` | `68` | `12K` | — |

四个一级条目的呈现顺序固定为：`server → client/src → shared → services`。

### Specs 与 Tasks checkbox

| 字段 | 值 | 写法 |
| ---- | -- | ---- |
| `.kiro/specs/` 目录数 | 287 | `287` |
| `requirements.md` 计数 | 285 | `285` |
| `design.md` 计数 | 286 | `286` |
| `tasks.md` 计数 | 286 | `286` |
| `bugfix.md` 计数 | 3 | `3` |
| Tasks checkbox 总数 | 8806 | `8,806` |
| 已勾选 checkbox 数 | 7887 | `7,887` |
| 未勾选 checkbox 数 | 919 | `919` |
| 勾选率 | 0.896 | `89.6%` |
| 勾选率三段共现写法 | — | `7,887 / 8,806`（`89.6%`） |

### 数字格式约定

- **千分位**：四位及以上整数一律使用半角逗号分隔，写作 `5,152` / `1,074` / `2,130` / `8,806` / `7,887` / `919`；不写作 `5152` / `1074` / `2130`。
- **代码行数**：使用波浪号 + 千分位，写作 `~545,000` 行；不写作 `545K` 或 `54.5w`。
- **子目录行数**：维持快照原口径 `290K` / `217K` / `26K` / `12K`，与一级条目"文件数 / 代码行数"严格区分。
- **百分比**：保留一位小数 + `%`，写作 `89.6%`；不写作 `0.896` / `89%` / `89.60%`。
- **勾选率呈现**：必须三段共现，写作 `7,887 / 8,806`（`89.6%`）；不允许只写百分比、只写绝对数或省略未勾选数（`919`）。
- **快照时点**：统一使用 ISO 风格 `2026-05-28`；不写作 `2026/05/28` / `5月28日` / `2026-5-28`。
- **键名一致性**：`server` / `client/src` / `shared` / `services` 一律使用代码风格反引号或裸写法保持与既有 steering 风格一致；本设计文档建议沿用裸写法（与既有"项目规模"段子条目一致）。

## 三份目标文件的定位与变更摘要

每份文件采用统一处理范式：

1. **Anchor 定位**：用既有的、稳定且唯一的字符串锚定要改的段落。
2. **变更范围**：只改 anchor 标记的目标段，及其紧邻的"快照时点"标注位置；anchor 之外的段落严禁改动。
3. **变更摘要**：列出 before（原段落关键句）/ after（刷新后段落关键句），便于 review 对账。

### File 1: `project-overview.md` —— "项目规模" 段原地覆写

#### 定位策略

- **主 anchor**（唯一）：第 106 行的二级标题 `## 项目规模`
- **上邻 anchor**：第 105 行 `- UI 风格：冷灰色板 + OKLCH 设计令牌 + 左侧导航 + 三栏驾驶舱布局`（属于上一段 `## 技术栈` 末尾，作为段落上界守护）
- **下邻 anchor**：紧随段落之后的引用块 `> 说明：本页以 2026-04-26 Task Autopilot Phase 1 闭环后状态为准；……`（作为段落下界守护，不被改动）
- **目标段落范围**：从 `## 项目规模` 起，到上述引用块之前的全部 `-` 列表项。

旧段落首两行（须被覆写或下移的关键句）：

```
- 850+ 文件 / ~180,000 行 TypeScript
- `web-aigc` 当前形成 `58 / 58` specs 封板基线，其中包含 `52` 个节点 specs 与 `6` 个平台 specs
```

#### 刷新后段落（结构契约）

```
## 项目规模

> 体量快照时点：`2026-05-28`

- `2,130` 文件 / `~545,000` 行 TypeScript / TSX
  - server：`1,004` 文件 / `290K` 行（routes 391 / core 100 / tests 362 / feishu 13 / audit 12 / lineage 7 / tasks 7）
  - client/src：`916` 文件 / `217K` 行（components 342 / pages 314 / lib 209）
  - shared：`139` 文件 / `26K` 行
  - services：`68` 文件 / `12K` 行
- Markdown 文件 `1,074` 份；测试文件（`.test` / `.spec`）`866` 份，其中 `server/tests 362` 份
- `.kiro/specs/` 目录 `287` 个：`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`
- Tasks checkbox `7,887 / 8,806`（`89.6%`），未勾选 `919`
- Git 跟踪文件 `5,152` 份，Git 提交 `748` 次
- `web-aigc` 当前形成 `58 / 58` specs 封板基线，其中包含 `52` 个节点 specs 与 `6` 个平台 specs
- `web-aigc` 顶层任务已完成 `238 / 238`，后续不再以"继续补 specs"作为主线推进指标
- `task-autopilot` 第一阶段 `18 / 18` 份 specs 已完成并收口，覆盖产品定位、核心概念、L1-L5 分级、Destination / Route、驾驶舱 IA、接管点、Drive State、runtime 编排、可解释性、恢复治理、证据回放与成功度量
- `task-autopilot` 任务跟踪口径当前为 `345 / 345` 顶层任务项与 `602 / 602` raw checklist 项，进度 SVG 已更新到 2026-04-26 口径
- `task-autopilot` 已落地第一条 shared / server / client 纵切：`parseMissionDestination()`、autopilot projection / orchestration、tasks-store normalize、TaskAutopilotPanel 消费面
- 当前产品叙事已经从"任务操作系统"进入"任务自动驾驶平台"阶段；工程主干继续 compatibility-first，不立即大规模重命名 `mission / workflow / runtime`
- 当前活跃增量已经从 spec 勾选切换到主线增强：类型债清理、runtime adapter result 统一、observability / lineage 深化、HITL / Office 面板闭环、tools-and-agents 治理字段统一
- 14 个 shared/ 契约模块，主线能力已覆盖前端、服务端、执行器、审计与互操作层
- 大量单元测试与属性测试已覆盖 Mission、执行器、RAG、审计、NL Command 等核心域

> 说明：本页以 2026-04-26 Task Autopilot Phase 1 闭环后状态为准；……（保持原句不变）
```

#### 变更摘要

| 类型 | 内容 |
| ---- | ---- |
| 删除 | `- 850+ 文件 / ~180,000 行 TypeScript` 整行 |
| 新增 | 紧跟 `## 项目规模` 的 `> 体量快照时点：`2026-05-28`` 引用行 |
| 新增 | TS/TSX 总量行 + 四个嵌套子条目（server / client/src / shared / services，按此顺序） |
| 新增 | Markdown / 测试 / specs / Tasks checkbox / Git 五条体量条目 |
| 保留 | `850+ 文件` 行之后的所有原 `-` 条目（`web-aigc 58 / 58` 起至 `大量单元测试……`），逐字保留、不重排 |
| 保留 | `## 项目规模` 段之后的引用块"说明：本页以 2026-04-26……"逐字不变 |
| 禁用 | 不写"原口径 850+ 文件 ……"或"旧数字 ~180,000 行……"等历史脚注 |

### File 2: `execution-plan.md` —— "总览 / 当前维护快照" 段刷新

#### 定位策略

- **主 anchor 1**（唯一）：第 18 行 `## 总览` 二级标题
- **目标句 anchor**：第 19 行起以 `截至 2026-04-21，\`.kiro/specs\` 共 77 个目录。` 开头的整段 paragraph
- **主 anchor 2**：第 24 行 `## 当前维护快照（2026-04-15）` 二级标题（标题本身保留，作为历史时点 anchor 不动）
- **下邻 anchor**：第 42 行附近的 `## 阶段 0：契约先行（并行前必须完成）` 标题（作为段落下界守护，不被改动）

旧段落开头（须被覆写的关键句）：

```
截至 2026-04-21，`.kiro/specs` 共 77 个目录。前三层主线与补充 spec `holographic-ui` 已基本落地，……
```

#### 刷新策略

采取"**首句替换 + 段尾注脚**"的最小改动方案，避免动到原段落对近端节奏（`launch-operator-surface-convergence`、墙面 `Mission Control` HUD 等）的叙述：

1. **首句原地覆写**：把句首 `截至 2026-04-21，\`.kiro/specs\` 共 77 个目录。` 整段第一句替换为 `截至 2026-05-28，\`.kiro/specs\` 共 287 个目录（\`requirements.md 285\` / \`design.md 286\` / \`tasks.md 286\` / \`bugfix.md 3\`），Tasks checkbox 勾选率 \`7,887 / 8,806\`（\`89.6%\`）。`。该段落剩余文字（`前三层主线与补充 spec 'holographic-ui' 已基本落地……`）逐字保留。
2. **当前维护快照段紧邻位置追加**：在 `## 当前维护快照（2026-04-15）` 标题之后、其原首条 `- 已合并主线：……` 之前，**新增一条独立项目符号**（不删除任何旧条目）：

   ```
   - 体量快照（`2026-05-28`）：TypeScript / TSX `2,130` 文件 / `~545,000` 行；Markdown `1,074` 份；测试文件 `866` 份，其中 `server/tests 362` 份；Git 跟踪文件 `5,152` 份，Git 提交 `748` 次。
   ```

   注：标题文字 `## 当前维护快照（2026-04-15）` 本身不改，保留作为历史时点 anchor。新增条目以 `2026-05-28` 时点显式区分。

#### 变更摘要

| 类型 | 内容 |
| ---- | ---- |
| 替换 | `## 总览` 段第一句：`截至 2026-04-21……77 个目录` → `截至 2026-05-28……287 个目录（计数明细）+ Tasks checkbox 勾选率` |
| 保留 | `## 总览` 段第二句起原文（`前三层主线与补充 spec 'holographic-ui'……平台层能力（L31-L38）仍待环境就绪。`）逐字不变 |
| 保留 | `## 总览` 段后的 `> **维护说明**……` 引用块逐字不变 |
| 保留 | `## 已完成归档模块` 整段不变 |
| 新增 | `## 当前维护快照（2026-04-15）` 标题之后的首条新条目（2026-05-28 体量快照） |
| 保留 | `## 当前维护快照（2026-04-15）` 原有的所有 `-` 条目逐字不变 |
| 保留 | 文件其余所有章节（`阶段 0` / `第一层` / `第二层` / `第三层` / `第四层` / `Worktree 命名参考` / `推荐执行时间线` / `关键路径` / `风险提示` / `2026-04-15 增补` / `2026-04-16 新增主线收敛 specs` / `本周可执行 Checklist`）逐字不变 |
| 禁用 | 不在被刷新段落保留 `2026-04-21` 字样、`77 个目录` 字样，或"原口径"／"旧数字"等历史脚注 |

> 说明：execution-plan.md 文件其他段落中如出现历史时点 `2026-04-21`（例如某些子任务行），属于 `## 总览` 与 `## 当前维护快照（2026-04-15）` 之外的历史叙述，按 Requirement 3.5 不在本轮改动范围内；本 spec 的禁用串断言仅作用于"被刷新段落"。

### File 3: `project-first-spec-roadmap-2026-04-30.md` —— 仅追加 2026-05-28 脚注

#### 定位策略

- **主 anchor**：第 4 行 `## 2026-05-21 进度更新` 二级标题
- **目标句 anchor**（精确保留）：第 5 行
  ```
  Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。
  ```
- **下邻 anchor**：第 8 行 `详见：\`.kiro/steering/specs-progress-snapshot-2026-05-21.md\``（作为段落下界守护，不被改动）

#### 刷新策略

封板原句一字不动；在其后、`详见：……` 之前新增一句脚注，紧贴封板句下一行：

```
> 全仓体量脚注（`2026-05-28`）：上述 `10/10` 与 `123/123` 仅指 Project-first 系列；同期全仓 `.kiro/specs/` 目录共 `287` 个，Tasks checkbox 勾选率 `7,887 / 8,806`（`89.6%`）。
```

约束：

- 必须使用 `>` 引用块或独立段落形式与封板句明确区分，避免被误读为对 Project-first 系列的修订。
- 必须显式声明作用域为"全仓"（用词：`全仓` / `总仓` / `整个仓库` 任一），与 `10/10 / 123/123` 的 Project-first 系列范围切分。
- 不得使用"原口径……"或"旧数字……"措辞。

#### 变更摘要

| 类型 | 内容 |
| ---- | ---- |
| 保留 | `## 2026-05-21 进度更新` 标题逐字不变 |
| 保留 | 封板句 `Project-first 系列 \`10/10\`……作为后续深化实现的参考。` **逐字不变**（包括反引号、句号、空行） |
| 新增 | 封板句之后、`详见：……` 之前的引用脚注行（含 `2026-05-28`、`287`、`7,887`、`8,806`、`89.6%` 与"全仓/总仓/整个仓库"作用域声明） |
| 保留 | `详见：\`.kiro/steering/specs-progress-snapshot-2026-05-21.md\`` 行逐字不变 |
| 保留 | 文件其余所有章节（`## 一句话方向` / `## 本轮创建的 specs` / `## 第一阶段建议开发范围` 至 `## 第四阶段建议开发范围` / `## 后置 specs` / `## 关键边界`）逐字不变 |
| 禁用 | 不引入"原口径"、"旧数字"等历史脚注措辞 |

## 编辑工艺

为减小手抖与误改半径，建议采用以下编辑工艺：

1. **逐文件、逐段落处理**：完成一份文件全部断言通过后，再开始下一份；不并行编辑三份文件。
2. **优先 str_replace 精确替换**，oldStr 必须 **唯一匹配**：
   - File 1：以 `- 850+ 文件 / ~180,000 行 TypeScript\n` 为 oldStr，新内容为 1 行 anchor + 1 行 TS 总量 + 4 行子条目 + 4 行新增条目。
   - File 2 首句：以 `截至 2026-04-21，\`.kiro/specs\` 共 77 个目录。` 为 oldStr，唯一匹配。
   - File 2 维护快照插入：以 `## 当前维护快照（2026-04-15）\n\n- 已合并主线：` 为 oldStr，把新条目插在 `\n\n` 与 `- 已合并主线：` 之间。
   - File 3：以 `Project-first 系列 \`10/10\` specs 已全部完成，\`123/123\` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。\n\n详见：` 为 oldStr，把脚注行插在两个 `\n` 之间。
3. **不使用全文重写**：避免 `fs_write` 覆盖整文件造成 anchor 之外段落的意外漂移。
4. **每完成一份文件后立即跑断言**（见下节"验证策略"），失败立即停手回滚，再分析根因。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

> 本 spec 不涉及代码与运行时，因此"正确性属性"在这里取其文档维护语义：本轮编辑结果对仓库文件树与目标文件文本应满足的不变量。所有属性都可由 `git diff` 与 `grep` 直接断言。

### Property 1: Scope Invariant —— 改动作用域不外溢

*For any* 本 spec 提交（或一组合并到主线的 commit），其 `git diff --name-only` 输出的所有路径都必须属于固定集合 `{".kiro/steering/project-overview.md", ".kiro/steering/execution-plan.md", ".kiro/steering/project-first-spec-roadmap-2026-04-30.md"}`，且不会出现 `client/` / `server/` / `shared/` / `services/` / `scripts/` / `docs/` / `.github/` 等任何前缀的路径，也不会出现其他 `.kiro/specs/` 子目录或其他 `.kiro/steering/` 文件。

**Validates: Requirements 1.1, 1.2, 1.3, 5.1, 5.2, 5.3, 5.4**

### Property 2: Required Token Presence —— 快照数字必须就位

*For any* 文件 ∈ Steering_File_Set，其文本中必须出现该文件对应的"快照数字共现集合"中的全部串：

- `project-overview.md` 必须包含：`2,130`、`~545,000`、`1,004`、`290K`、`916`、`217K`、`139`、`26K`、`68`、`12K`、`1,074`、`866`、`362`、`287`、`285`、`286`、`3`、`8,806`、`7,887`、`919`、`89.6%`、`5,152`、`748`、`2026-05-28`，且 `2026-05-28` 必须出现在 `## 项目规模` 段或其紧邻位置。
- `execution-plan.md` 必须包含：`2026-05-28`、`287`、`285`、`286`、`3`（specs 子文档计数语境下）、`7,887`、`8,806`、`89.6%`、`2,130`、`~545,000`、`1,074`、`866`、`362`、`5,152`、`748`，且这些串必须分布在 `## 总览` 段首句与 `## 当前维护快照（2026-04-15）` 段紧邻位置（新增条目）。
- `project-first-spec-roadmap-2026-04-30.md` 必须包含：`2026-05-28`、`287`、`7,887`、`8,806`、`89.6%`，且这些串都出现在封板句之后、`详见：` 之前。

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 3.1, 3.2, 3.3, 3.6, 4.2, 4.3**

### Property 3: Forbidden Token Absence —— 旧串与历史脚注措辞必须消失

*For any* 被刷新段落（File 1 的 `## 项目规模` 段、File 2 的 `## 总览` 段第一段、File 3 的 `## 2026-05-21 进度更新` 段），其文本中下列禁用串出现次数必须为 `0`：

- File 1 `## 项目规模` 段全段：`850+ 文件`、`~180,000 行`、`原口径`、`旧数字`
- File 2 `## 总览` 段首段：`2026-04-21`、`77 个目录`、`原口径`、`旧数字`
- File 3 `## 2026-05-21 进度更新` 段：`原口径`、`旧数字`

**Validates: Requirements 2.5, 3.4, 4.5**

### Property 4: Non-target Section Stability —— 非目标段落字符级不变

*For any* 三份目标文件中"非目标段落"，编辑前后的字符级 diff 必须为空。"非目标段落"定义如下：

- `project-overview.md`：除 `## 项目规模` 段（含其紧邻的 `2026-05-28` 时点标注行）之外的所有内容
- `execution-plan.md`：除 `## 总览` 段第一段（首句被覆写、其余文字保留）与 `## 当前维护快照（2026-04-15）` 段（仅在标题之后追加一条新条目）之外的所有内容
- `project-first-spec-roadmap-2026-04-30.md`：除 `## 2026-05-21 进度更新` 段中"封板句之后、`详见：` 之前"插入位之外的所有内容

具体而言：File 3 的封板句必须 **逐字保留**（精确匹配 `Project-first 系列 \`10/10\` specs 已全部完成，\`123/123\` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。`）。

**Validates: Requirements 2.7, 3.5, 4.1, 4.4, 6.4**

### Property 5: Snapshot Consistency —— 快照口径全局一致

*For any* 在三份目标文件中出现的、属于 `Snapshot_2026_05_28` 范围的体量字段（TS/TSX 总量、子目录文件数、行数、Markdown 数、测试数、specs 计数、Tasks checkbox 数 / 勾选率、Git 跟踪文件 / 提交数），其值必须 **逐字** 等于"Snapshot_2026_05_28 数字台账"中的对应值；且必须满足下列共现 / 顺序约束：

- TS/TSX 子目录在被列出的位置上，必须按 `server` → `client/src` → `shared` → `services` 的顺序出现。
- TS/TSX 总量必须以 `2,130 文件 / ~545,000 行` 的写法呈现，不允许 `2130` / `545K` / 等近似变体。
- Tasks checkbox 勾选率必须以"已勾选 / 总数 / 百分比"三段共现写法呈现，即 `7,887`、`8,806`、`89.6%` 三者出现在同一句或同一项中；不允许只写百分比、只写绝对数或省略 `919`。
- 不允许出现快照范围之外的近似值（如 `2,100` / `540,000` / `89%` / `90%`）。

**Validates: Requirements 6.1, 6.2, 6.3**

## 验证策略

本 spec 不涉及构建 / 单测 / 集成测试，验证以 **`grep` + `git diff` 文本断言** 为唯一手段。所有断言可在仓库根目录下用 `rg` / `git` 直接执行。

### 1. 改动作用域断言（守护 Property 1）

```bash
git diff --name-only HEAD
# 期望输出（顺序不限，但集合必须严格等于）：
#   .kiro/specs/steering-volume-snapshot-2026-05-28/.config.kiro
#   .kiro/specs/steering-volume-snapshot-2026-05-28/requirements.md
#   .kiro/specs/steering-volume-snapshot-2026-05-28/design.md
#   .kiro/specs/steering-volume-snapshot-2026-05-28/tasks.md
#   .kiro/steering/project-overview.md
#   .kiro/steering/execution-plan.md
#   .kiro/steering/project-first-spec-roadmap-2026-04-30.md
```

仓库前缀负向断言（必须为空）：

```bash
git diff --name-only HEAD | rg '^(client|server|shared|services|scripts|docs|\.github)/' || echo "OK: no out-of-scope files"
git diff --name-only HEAD | rg '^\.kiro/specs/(?!steering-volume-snapshot-2026-05-28/)' || echo "OK: no other spec touched"
git diff --name-only HEAD | rg '^\.kiro/steering/' | rg -v '^\.kiro/steering/(project-overview|execution-plan|project-first-spec-roadmap-2026-04-30)\.md$' || echo "OK: no other steering touched"
```

### 2. 旧串消失断言（守护 Property 3）

```bash
# project-overview.md：旧 TS 数字必须消失
rg -n '850\+ 文件' .kiro/steering/project-overview.md && exit 1 || echo "OK"
rg -n '~180,000 行' .kiro/steering/project-overview.md && exit 1 || echo "OK"
rg -n '原口径|旧数字' .kiro/steering/project-overview.md && exit 1 || echo "OK"

# execution-plan.md：旧时点与 77 个目录必须从 ## 总览 首段消失
# 用 awk 截取 ## 总览 与 ## 已完成归档模块 之间的内容
awk '/^## 总览$/,/^## 已完成归档模块$/' .kiro/steering/execution-plan.md \
  | rg '截至 2026-04-21|77 个目录|原口径|旧数字' && exit 1 || echo "OK"

# project-first-spec-roadmap-2026-04-30.md：禁用历史脚注措辞
rg -n '原口径|旧数字' .kiro/steering/project-first-spec-roadmap-2026-04-30.md && exit 1 || echo "OK"
```

### 3. 新串就位断言（守护 Property 2 + Property 5）

```bash
# project-overview.md
for s in '2,130' '~545,000' '1,004' '290K' '916' '217K' '139' '26K' '68' '12K' \
         '1,074' '866' '287' '285' '286' '8,806' '7,887' '919' '89.6%' \
         '5,152' '748' '2026-05-28'; do
  rg -F "$s" .kiro/steering/project-overview.md > /dev/null \
    || { echo "MISSING in project-overview.md: $s"; exit 1; }
done

# execution-plan.md（仅在 ## 总览 + ## 当前维护快照 段验证）
awk '/^## 总览$/,/^## 阶段 0/' .kiro/steering/execution-plan.md > /tmp/exec-head.md
for s in '2026-05-28' '287' '285' '286' '7,887' '8,806' '89.6%' \
         '2,130' '~545,000' '1,074' '866' '362' '5,152' '748'; do
  rg -F "$s" /tmp/exec-head.md > /dev/null \
    || { echo "MISSING in execution-plan.md head: $s"; exit 1; }
done

# project-first-spec-roadmap-2026-04-30.md
for s in '2026-05-28' '287' '7,887' '8,806' '89.6%'; do
  rg -F "$s" .kiro/steering/project-first-spec-roadmap-2026-04-30.md > /dev/null \
    || { echo "MISSING in spec-roadmap: $s"; exit 1; }
done
```

### 4. 顺序与共现断言（守护 Property 5）

```bash
# project-overview.md：四个一级条目按 server → client/src → shared → services 顺序
awk '/^## 项目规模$/,/^## 2026-04-26 增补/' .kiro/steering/project-overview.md > /tmp/po-scale.md
LINE_SERVER=$(rg -n '^\s*-\s+server' /tmp/po-scale.md | head -1 | cut -d: -f1)
LINE_CLIENT=$(rg -n '^\s*-\s+client/src' /tmp/po-scale.md | head -1 | cut -d: -f1)
LINE_SHARED=$(rg -n '^\s*-\s+shared' /tmp/po-scale.md | head -1 | cut -d: -f1)
LINE_SERVICES=$(rg -n '^\s*-\s+services' /tmp/po-scale.md | head -1 | cut -d: -f1)
test "$LINE_SERVER" -lt "$LINE_CLIENT" \
  && test "$LINE_CLIENT" -lt "$LINE_SHARED" \
  && test "$LINE_SHARED" -lt "$LINE_SERVICES" \
  && echo "OK: order"

# 三份文件的勾选率三段共现：在同一行同时出现 7,887 / 8,806 / 89.6%
for f in .kiro/steering/project-overview.md \
         .kiro/steering/execution-plan.md \
         .kiro/steering/project-first-spec-roadmap-2026-04-30.md; do
  rg -n '7,887.*8,806.*89\.6%' "$f" > /dev/null \
    || { echo "MISSING co-occurrence in $f"; exit 1; }
done
```

### 5. 封板句逐字保留断言（守护 Property 4）

```bash
# 必须命中且仅命中一次
COUNT=$(rg -F 'Project-first 系列 `10/10` specs 已全部完成，`123/123` 任务项已封板。本路线图中描述的四个阶段开发范围仍然有效，作为后续深化实现的参考。' \
  .kiro/steering/project-first-spec-roadmap-2026-04-30.md | wc -l)
test "$COUNT" = "1" && echo "OK: closure sentence verbatim"
```

### 6. 非目标段落字符级稳定断言（守护 Property 4）

```bash
# 提取目标段落之外的全部内容做 diff
# project-overview.md：删去 ## 项目规模 段
git show HEAD~1:.kiro/steering/project-overview.md | awk '!/^## 项目规模$/,/^## 2026-04-26 增补/' > /tmp/po-before-non-target.md
awk '!/^## 项目规模$/,/^## 2026-04-26 增补/' .kiro/steering/project-overview.md > /tmp/po-after-non-target.md
# 注：上述 awk 范围用法仅作示意；实际可用更精确的 sed/awk 提取目标段并对其余部分逐行 diff
diff /tmp/po-before-non-target.md /tmp/po-after-non-target.md | head -20
# 期望：除 ## 项目规模 段及其紧邻 2026-05-28 时点行外，其余字节级一致
```

> 上述脚本仅作语义示意，验收以 reviewer 实际执行的 grep 输出为准；本 spec 不要求把脚本固化为可执行 CI 任务。

### 7. 完成条件（DoD）

本 spec 视为完成，当且仅当下列条件 **全部** 满足：

- 上述 1–6 节的所有断言全部通过；
- `git diff --name-only` 严格等于 §1 列出的文件集合（含本 spec 自身的 `requirements.md` / `design.md` / `tasks.md` / `.config.kiro`）；
- `Snapshot_2026_05_28 数字台账` 中的每一项数字在三份文件中可被找到 ≥ 1 次（除按 Requirement 6.4 不强行新增章节而无对应展示位的字段外）；
- 人肉 review 阅读三份文件的目标段落，未发现"原口径"/"旧数字"风格的历史脚注，未发现快照范围之外的近似数字（例如 `2,100` / `540K` / `89%`）。

## 风险与对策

| 风险 | 对策 |
| ---- | ---- |
| `str_replace` 的 oldStr 不唯一，误改其他位置 | 使用 §"编辑工艺" §2 中给出的 oldStr 模板，每个都包含足够上下文（含上下行 anchor）使其全文唯一；首次替换前先 `rg -F` 计数确认匹配数为 1 |
| 数字写法不一致（如漏写千分位、写成 `2130` 或 `89%`） | 严格按 "数字格式约定" 表执行；提交前用 §3 / §4 断言批量核对 |
| 顺手改了引用块、小标题、空行 | 使用 §6 字符级 diff 守护非目标段落；严禁 `fs_write` 全文件覆盖 |
| File 2 的 `2026-04-21` 在文件其他段落中也存在，被误判为禁用串 | §2 用 `awk '/^## 总览$/,/^## 已完成归档模块$/'` 限定段落范围，仅在被刷新段内做禁用串断言 |
| Snapshot 与实测仓库不一致（例如真实 specs 数已变） | 按 Requirement 5.3，仅在 steering 中据实记录文档侧数字，不顺手对齐代码 / 测试 / 运行时；若发现快照本身有误，转入后续单独 spec |
| 误把 File 3 封板句改动一字 | §5 用精确字符串 `rg -F` 命中计数 = 1 守护；编辑前 git stash + diff 双重核对 |
