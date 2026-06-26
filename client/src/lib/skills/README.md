# SlideRule Runtime-Less Skills

这个目录是 SlideRule Intent-to-App 的轻量 Skill 内核样板。它不启动数据库、不跑 Redis、不接后端服务，而是把重型低代码平台里的系统能力蒸馏成三件东西：

- 纯数据模型：系统能表达什么。
- 纯校验函数：模型是不是自洽，跨系统引用是不是闭合。
- 纯图投影：从模型自动生成架构图、关系图和影响图。

用户输入“我想要一个 XX 平台”以后，SlideRule 会先生成结构化 SPEC，再让各个 Skill 校验这份 SPEC，最后拼出统一架构图、关联关系图、发布门禁结果和影响分析。

## 六个 Skill

- `datamodel`：数据中台，负责实体、字段、字段版本、生命周期和关系。它是 SSOT，也就是字段和实体的唯一事实源。
- `rbac`：权限内核，负责角色、权限、菜单、用户、部门、岗位、数据规则、SoD 和 fail-closed 决策。它是 PDP，也就是统一权限决策点。
- `workflow`：工作流执行点，负责开始、审批、分支、结束节点，以及可达性、可终止性和分支兜底校验。它是 PEP，审批人和权限检查委托 RBAC。
- `page`：页面设计器执行点，负责组件、字段绑定、角色可见性、按钮权限和联动规则。它也是 PEP，字段绑定委托 DataModel，权限渲染委托 RBAC。
- `aigc`：AIGC 中台执行点，负责 AI capability、provider route、prompt、output schema、RAG source、citation policy、tool config 和 trace metadata。它是 PEP，不持有真实 key，不调用真实 LLM，不做本地权限决策，权限委托 RBAC，业务字段绑定 DataModel。
- `appbundle`：应用中心组装根，负责把实体、角色、流程、页面、AIGC capability、菜单和页面-流程绑定打包成可发布应用闭包，并做版本钉选、runtime snapshot 和 publish gate。

## 统一接口

每个 Skill 都暴露同一组能力：

- `generate(intent, ctx)`：从意图生成样例模型。当前是 deterministic sample，后续再接真实 LLM。
- `validate(model, ctx)`：纯函数 gate，检查本系统和跨系统引用是否成立。
- `project(model)`：纯函数投影，把模型变成图节点、图边和 Mermaid。
- `resolve(model)`：导出可被其它 Skill 引用的稳定能力面，例如角色、权限、实体、字段、流程、页面、AIGC capability。
- `crossRefs(model)`：声明自己引用了哪些外部资源，供编排器拼总图、闭包校验和 impact graph 使用。

默认编排顺序是：

```text
DataModel -> RBAC -> Workflow -> Page -> AIGC -> AppBundle
```

## 已验证样例

当前有两个 deterministic Intent-to-App 样例：

- `leave approval`：请假审批平台，覆盖员工、主管、请假单、主管审批、请假页面和应用包。AIGC 在这个场景里以空 PEP 模型接入，不影响既有闭包。
- `purchase approval`：采购审批平台，覆盖 requester、department_manager、finance、procurement、采购数据模型、采购流程、采购页面、AIGC `budget_risk_summary` 能力和应用包。

采购审批已经是六系统闭包：DataModel、RBAC、Workflow、Page、AIGC、AppBundle 都进入统一 SPEC、统一图、publish gate 和 impact graph。

## 已支持 Gate

- DataModel gate：实体/字段重复、字段版本冲突、字段生命周期、OLAP 非 SSOT、关系引用完整性。
- RBAC gate：角色/权限/菜单/数据规则引用完整性、角色继承环、SoD 冲突、fail-closed 决策。
- Workflow gate：唯一开始节点、可达性、可终止性、分支兜底、审批人角色、PEP 委托、SSOT 字段绑定。
- Page gate：组件 id、字段绑定、角色/权限渲染、PEP 绕过、联动源和目标合法性。
- AIGC gate：provider/model route、KeyRef/SecretRef、prompt version、output schema、RAG source、retrieval policy、citation policy、tool policy、RBAC PEP 委托、DataModel SSOT 字段绑定。
- AppBundle gate：跨系统引用闭包、版本钉选、runtime snapshot、PEP 绕过阻断、AIGC capability refs。
- Publish gate：应用发布前的总门禁，要求所有 Skill gate 通过，并且所有跨系统引用都闭合。
- Impact graph：从角色、字段、流程、页面或 AIGC capability 反向追踪所有下游影响面。

## 当前验证命令

114 AIGC 接入收口时执行：

```powershell
pnpm exec vitest run client/src/lib/skills --reporter=dot
pnpm exec tsc --noEmit --pretty false
node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md docs/intent-to-app/skill-v2-migration-status.md docs/intent-to-app/aigc-skill-114-status.md
```

记录结果：

- Skill tests：10 个测试文件，137 个测试通过。
- TypeScript：`tsc --noEmit --pretty false` 退出码 0。
- Mojibake：README/status 文档无乱码发现。

## 明确非目标

- 当前不接真实 LLM；`generate()` 仍是样例驱动。
- 当前不物化到重型低代码平台，不写数据库，不生成真实运行时代码。
- 当前不保存真实 provider key，不读取 `.env`，不调用外部 AI provider。
- 当前不执行工具、MCP 或网络请求；AIGC tool config 只是治理元数据。
- 当前 gate 保证“结构自洽、引用闭合、可发布”，不保证业务设计一定正确；业务合理性仍需要人审。
