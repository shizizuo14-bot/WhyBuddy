# 设计：autopilot 子阶段摘要派生器

## 文件结构

```
client/src/pages/autopilot/right-rail/
├── sub-stage-summary.ts                           # 主文件
└── __tests__/
    └── sub-stage-summary.test.ts
```

## 数据结构

```ts
import type { AutopilotRailSubStage, AutopilotRightRailProps } from "./types";
import type { AppLocale } from "@/lib/locale";

export interface SubStageMetric {
  label: string;
  value: string | number;
  hint?: string;
}

export interface SubStageSummary {
  title: string;
  apiPath: string;
  summary: string;
  metrics: [SubStageMetric, SubStageMetric, SubStageMetric]; // 固定 3 个
  dataReady: boolean;
}
```

## 实现骨架

```ts
export function deriveSubStageSummary(
  subStage: AutopilotRailSubStage,
  props: AutopilotRightRailProps,
  locale: AppLocale
): SubStageSummary {
  switch (subStage) {
    case "agent_crew_fabric":
      return deriveAgentCrewFabric(props, locale);
    case "spec_tree":
      return deriveSpecTree(props, locale);
    case "spec_documents":
      return deriveSpecDocuments(props, locale);
    case "effect_preview":
      return deriveEffectPreview(props, locale);
    case "prompt_package":
      return derivePromptPackage(props, locale);
    case "runtime_capability":
      return deriveRuntimeCapability(props, locale);
    case "engineering_handoff":
      return deriveEngineeringHandoff(props, locale);
    case "artifact_memory":
      return deriveArtifactMemory(props, locale);
    default:
      return subStage satisfies never;
  }
}
```

## 每个子阶段派生函数示例

### `deriveAgentCrewFabric`

```ts
function deriveAgentCrewFabric(
  props: AutopilotRightRailProps,
  locale: AppLocale
): SubStageSummary {
  const zh = locale === "zh-CN";
  const { agentCrew } = props;
  const timelines = agentCrew?.roleTimelines ?? agentCrew?.presence ?? [];
  const events = timelines.reduce((n, r) => n + (r.entries?.length ?? 0), 0);
  const active = timelines.filter(r => r.state === "active").length;
  const watching = timelines.filter(r => r.state === "watching").length;
  const reviewing = timelines.filter(r => r.state === "reviewing").length;
  const dataReady = timelines.length > 0;

  return {
    title: zh ? "协作角色" : "Agent Crew",
    apiPath: "POST /api/blueprint/agent-crew",
    summary: zh
      ? "路线生成协作角色并与运行时能力、日志、浏览器预览资产和证据对齐。"
      : "Route-generated roles aligned with runtime capabilities, logs, browser preview artifacts, and evidence.",
    metrics: [
      {
        label: zh ? "角色数" : "ROLES",
        value: dataReady ? timelines.length : "-",
        hint: dataReady
          ? zh
            ? `活跃 ${active} / 观察 ${watching}`
            : `${active} active / ${watching} watching`
          : undefined,
      },
      {
        label: zh ? "事件数" : "EVENTS",
        value: dataReady ? events : "-",
      },
      {
        label: zh ? "活跃数" : "ACTIVE",
        value: dataReady ? active : "-",
        hint: dataReady && reviewing > 0
          ? zh ? `评审中 ${reviewing}` : `${reviewing} reviewing`
          : undefined,
      },
    ],
    dataReady,
  };
}
```

### `deriveSpecTree`

```ts
function deriveSpecTree(
  props: AutopilotRightRailProps,
  locale: AppLocale
): SubStageSummary {
  const zh = locale === "zh-CN";
  const { specTree } = props;
  const dataReady = specTree != null;
  const nodes = specTree?.nodes ?? [];
  const leaves = dataReady
    ? nodes.filter(n => !nodes.some(m => (m as any).parentId === n.id)).length
    : 0;

  return {
    title: zh ? "SPEC 树" : "Spec Tree",
    apiPath: "POST /api/blueprint/spec-tree",
    summary: zh
      ? "把选中的路线推导为可编辑的 SPEC 树，冻结 requirements / design / tasks 语义。"
      : "Derive an editable SPEC tree from the selected route; freeze requirements / design / tasks semantics.",
    metrics: [
      { label: zh ? "节点数" : "NODES", value: dataReady ? nodes.length : "-" },
      { label: zh ? "叶子数" : "LEAVES", value: dataReady ? leaves : "-" },
      { label: zh ? "版本数" : "VERSIONS", value: "-" },
    ],
    dataReady,
  };
}
```

### 其余 6 个函数按相同模式实现

每个函数：
1. 读取必要的 props 字段
2. 计算 dataReady
3. 构造中英双语 title / summary
4. 构造 3 个 metrics

对于 `prompt_package` / `engineering_handoff` / `artifact_memory` 这三个在本 spec 范围内不拿真实数据的子阶段，metrics 全填 `{ value: "-" }`，dataReady 使用最低依赖（`specTree != null` 或 `selection != null`）。

## i18n 策略

不使用 `useTranslation` / i18n key。所有文案直接写在 switch 里，通过 `locale === "zh-CN" ? zh文本 : en文本` 分支。

原因：
- 派生函数是 pure，避免 hook 耦合
- rail 主文件本身也是这种混合字面量策略（与 `AutopilotRightRail.tsx` 的 `SUB_STAGE_LABELS` / `TIMELINE_STAGE_LABELS` 一致）

## 测试策略

```ts
describe("deriveSubStageSummary", () => {
  const EMPTY_PROPS = {
    jobId: "",
    currentStage: "fabric" as const,
    job: null,
    routeSet: null,
    selection: null,
    specTree: null,
    agentCrew: null,
    capabilities: [],
    capabilityInvocations: [],
    capabilityEvidence: [],
    effectPreviews: [],
    locale: "zh-CN" as const,
    onSubStageChange: () => {},
  };

  it.each([
    "agent_crew_fabric",
    "spec_tree",
    "spec_documents",
    "effect_preview",
    "prompt_package",
    "runtime_capability",
    "engineering_handoff",
    "artifact_memory",
  ] as const)("returns structure for %s with empty props", (subStage) => {
    const result = deriveSubStageSummary(subStage, EMPTY_PROPS, "zh-CN");
    expect(result.metrics).toHaveLength(3);
    expect(typeof result.title).toBe("string");
    expect(typeof result.apiPath).toBe("string");
    expect(typeof result.summary).toBe("string");
    expect(typeof result.dataReady).toBe("boolean");
  });

  // 8 个 case 各自覆盖「数据就绪」分支
  it("agent_crew_fabric: ready with 3 roles", () => {
    const props = {
      ...EMPTY_PROPS,
      agentCrew: {
        roleTimelines: [
          { state: "active", entries: [{ id: "e1" }] },
          { state: "watching", entries: [{ id: "e2" }] },
          { state: "reviewing", entries: [] },
        ],
      } as any,
    };
    const result = deriveSubStageSummary("agent_crew_fabric", props, "zh-CN");
    expect(result.dataReady).toBe(true);
    expect(result.metrics[0].value).toBe(3);
    expect(result.metrics[1].value).toBe(2);
    expect(result.metrics[2].value).toBe(1);
  });

  // 其余 7 个 ready case 类推
});
```

## 可扩展性

后续如果需要拿真实的 prompt_package / engineering_handoff 指标，只需：
1. 扩展 `AutopilotRightRailProps` 或传入可选参数
2. 修改对应派生函数
3. 不影响其他 7 个子阶段的摘要

派生函数之间完全解耦。
