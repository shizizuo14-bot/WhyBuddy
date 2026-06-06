/**
 * `blueprint-v4-full-alignment` Module C — 单元测试（C.11）。
 *
 * 覆盖：
 *  1. deriveMatrix 节点类型映射各分支（requirements / design / tasks / evidence / tests）
 *  2. gaps 计算与 missingLinks
 *  3. coveragePercent
 *  4. renderMatrixMarkdown 渲染（表头 / 空矩阵 / stale 警告 / 缺口区块）
 *  5. createTraceabilityMatrixRouteHandler REST 端点（404 / JSON / markdown）
 *  6. stale 失效标记
 *  7. createTraceabilityMatrixService env gate + 派生
 *
 * 仅新增测试文件，不修改任何实现文件。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import type {
  BlueprintSpecTreeNode,
  BlueprintSpecDocument,
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/contracts.js";
import type {
  TraceabilityMatrix,
} from "../../../../shared/blueprint/traceability-matrix/types.js";
import type { BlueprintServiceContext } from "../context.js";

import { deriveMatrix } from "./derive.js";
import { renderMatrixMarkdown } from "./export.js";
import { createTraceabilityMatrixRouteHandler } from "./route.js";
import { createTraceabilityMatrixService } from "./service.js";

const FIXED_GENERATED_AT = "2026-05-28T00:00:00.000Z";

// --------------------------------------------------------------------------
// 最小 fixture 工厂
// --------------------------------------------------------------------------

function makeNode(
  partial: Partial<BlueprintSpecTreeNode> & Pick<BlueprintSpecTreeNode, "id" | "type">,
): BlueprintSpecTreeNode {
  return {
    id: partial.id,
    parentId: partial.parentId,
    title: partial.title ?? `节点 ${partial.id}`,
    summary: partial.summary ?? "",
    type: partial.type,
    status: partial.status ?? "draft",
    priority: partial.priority ?? 0,
    dependencies: partial.dependencies ?? [],
    outputs: partial.outputs ?? [],
    children: partial.children ?? [],
    metadata: partial.metadata,
  };
}

function makeDoc(
  partial: Partial<BlueprintSpecDocument> &
    Pick<BlueprintSpecDocument, "id" | "nodeId" | "type">,
): BlueprintSpecDocument {
  return {
    id: partial.id,
    jobId: partial.jobId ?? "job-1",
    treeId: partial.treeId ?? "tree-1",
    nodeId: partial.nodeId,
    type: partial.type,
    title: partial.title ?? `文档 ${partial.id}`,
    summary: partial.summary ?? "",
    content: partial.content ?? "",
    format: "markdown",
    createdAt: partial.createdAt ?? FIXED_GENERATED_AT,
    provenance: {
      jobId: partial.jobId ?? "job-1",
      githubUrls: [],
      treeVersion: 1,
      nodeType: partial.type === "tasks" ? "engineering_plan" : "spec_document",
      nodeTitle: partial.title ?? `文档 ${partial.id}`,
      nodeSummary: "",
      dependencies: [],
      outputs: [],
    },
  };
}

function makeArtifact(
  partial: Partial<BlueprintGenerationArtifact> &
    Pick<BlueprintGenerationArtifact, "id" | "type">,
): BlueprintGenerationArtifact {
  return {
    id: partial.id,
    type: partial.type,
    title: partial.title ?? `产物 ${partial.id}`,
    summary: partial.summary ?? "",
    createdAt: partial.createdAt ?? FIXED_GENERATED_AT,
    payload: partial.payload,
  };
}

function makeJob(
  partial: Partial<BlueprintGenerationJob> & Pick<BlueprintGenerationJob, "id">,
): BlueprintGenerationJob {
  return {
    id: partial.id,
    request: partial.request ?? ({} as BlueprintGenerationJob["request"]),
    status: partial.status ?? "completed",
    stage: partial.stage ?? "spec_docs",
    version: partial.version ?? "v4",
    createdAt: partial.createdAt ?? FIXED_GENERATED_AT,
    updatedAt: partial.updatedAt ?? FIXED_GENERATED_AT,
    artifacts: partial.artifacts ?? [],
    events: partial.events ?? [],
    staleArtifactIds: partial.staleArtifactIds,
  } as BlueprintGenerationJob;
}

/**
 * 一个完整覆盖的需求 A + 一个部分覆盖的需求 B 的节点/文档集合。
 *
 *   req-A (route_step) —— 全四维覆盖
 *     ├─ design-A   (spec_document, 直接 parentId)
 *     └─ group-A    (root, 中间层)
 *          └─ task-A (engineering_plan, 孙节点 → 走 descendant 链)
 *     outputs=["out-A"], metadata.evidenceSources=["evi-A"]
 *     tasks doc(nodeId=req-A) 含验收用例
 *
 *   req-B (route_step) —— 仅 design 覆盖
 *     └─ design-B   (spec_document, 直接 parentId)
 *     无 task / 无 evidence / 无 test
 */
function buildMixedFixture(): {
  nodes: BlueprintSpecTreeNode[];
  specDocs: BlueprintSpecDocument[];
} {
  const nodes: BlueprintSpecTreeNode[] = [
    makeNode({ id: "root", type: "root", title: "根" }),
    // 需求 A（全覆盖）
    makeNode({
      id: "req-A",
      type: "route_step",
      title: "需求A",
      parentId: "root",
      outputs: ["out-A"],
      metadata: { evidenceSources: ["evi-A"] },
    }),
    makeNode({
      id: "design-A",
      type: "spec_document",
      title: "设计章节A",
      parentId: "req-A",
    }),
    makeNode({ id: "group-A", type: "root", title: "分组A", parentId: "req-A" }),
    makeNode({
      id: "task-A",
      type: "engineering_plan",
      title: "任务A",
      parentId: "group-A",
    }),
    // 需求 B（仅 design）
    makeNode({ id: "req-B", type: "route_step", title: "需求B", parentId: "root" }),
    makeNode({
      id: "design-B",
      type: "spec_document",
      title: "设计章节B",
      parentId: "req-B",
    }),
  ];

  const specDocs: BlueprintSpecDocument[] = [
    makeDoc({
      id: "doc-tasks-A",
      nodeId: "req-A",
      type: "tasks",
      content: [
        "# 任务清单",
        "- [ ] 验证登录成功路径",
        "- [x] 验证登出清理会话",
        "普通描述行（不应被提取）",
      ].join("\n"),
    }),
  ];

  return { nodes, specDocs };
}

// --------------------------------------------------------------------------
// 1. deriveMatrix 节点类型映射各分支
// --------------------------------------------------------------------------

describe("deriveMatrix 节点类型映射", () => {
  it("将 route_step 节点映射为 requirements 条目", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    expect(matrix.jobId).toBe("job-1");
    expect(matrix.generatedAt).toBe(FIXED_GENERATED_AT);
    expect(matrix.entries.map((e) => e.requirementId)).toEqual(["req-A", "req-B"]);
    expect(matrix.entries.map((e) => e.requirementTitle)).toEqual(["需求A", "需求B"]);
  });

  it("将 spec_document 节点（直接 parentId）映射为 designSections", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    const entryA = matrix.entries.find((e) => e.requirementId === "req-A")!;
    expect(entryA.designSections).toContain("设计章节A");

    const entryB = matrix.entries.find((e) => e.requirementId === "req-B")!;
    expect(entryB.designSections).toEqual(["设计章节B"]);
  });

  it("通过 descendant 链（孙节点）将 engineering_plan 映射为 taskIds", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    // task-A 的 parentId 是 group-A，group-A 的 parentId 才是 req-A。
    // 必须走 isDescendantOf 的 parentId 链才能命中。
    const entryA = matrix.entries.find((e) => e.requirementId === "req-A")!;
    expect(entryA.taskIds).toEqual(["task-A"]);

    const entryB = matrix.entries.find((e) => e.requirementId === "req-B")!;
    expect(entryB.taskIds).toEqual([]);
  });

  it("从 outputs[] 与 metadata.evidenceSources 收集 evidenceSources", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    const entryA = matrix.entries.find((e) => e.requirementId === "req-A")!;
    expect(entryA.evidenceSources).toEqual(["out-A", "evi-A"]);

    const entryB = matrix.entries.find((e) => e.requirementId === "req-B")!;
    expect(entryB.evidenceSources).toEqual([]);
  });

  it("从 type==='tasks' 的 spec document 中按 nodeId 提取验收用例", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    const entryA = matrix.entries.find((e) => e.requirementId === "req-A")!;
    // - [ ] / - [x] 行被提取并去掉前缀；普通行不进入
    expect(entryA.testCases).toEqual(["验证登录成功路径", "验证登出清理会话"]);

    const entryB = matrix.entries.find((e) => e.requirementId === "req-B")!;
    expect(entryB.testCases).toEqual([]);
  });

  it("非 tasks 类型的 spec document 不贡献测试用例", () => {
    const nodes: BlueprintSpecTreeNode[] = [
      makeNode({ id: "req-1", type: "route_step", title: "需求1" }),
    ];
    const specDocs: BlueprintSpecDocument[] = [
      makeDoc({
        id: "doc-design",
        nodeId: "req-1",
        type: "design",
        content: "- [ ] 这是 design 文档里的伪验收项",
      }),
    ];
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);
    expect(matrix.entries[0].testCases).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// 2 & 3. gaps 计算 + coveragePercent
// --------------------------------------------------------------------------

describe("deriveMatrix 覆盖率与缺口", () => {
  it("部分覆盖的需求进入 gaps 并带正确 missingLinks，全覆盖需求不进入", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    const gapIds = matrix.coverage.gaps.map((g) => g.requirementId);
    expect(gapIds).toEqual(["req-B"]);
    expect(gapIds).not.toContain("req-A");

    const gapB = matrix.coverage.gaps.find((g) => g.requirementId === "req-B")!;
    expect(gapB.missingLinks).toEqual(["task", "evidence", "test"]);
  });

  it("coveragePercent 在 1/2 需求全覆盖时为 50", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);

    expect(matrix.coverage.totalRequirements).toBe(2);
    expect(matrix.coverage.coveredByDesign).toBe(2);
    expect(matrix.coverage.coveredByTasks).toBe(1);
    expect(matrix.coverage.coveredByEvidence).toBe(1);
    expect(matrix.coverage.coveredByTests).toBe(1);
    expect(matrix.coverage.coveragePercent).toBe(50);
  });

  it("coveragePercent 在 0 个需求时为 100", () => {
    const nodes: BlueprintSpecTreeNode[] = [
      makeNode({ id: "root", type: "root", title: "根" }),
      makeNode({ id: "design-x", type: "spec_document", title: "孤立设计" }),
    ];
    const matrix = deriveMatrix("job-1", nodes, [], FIXED_GENERATED_AT);

    expect(matrix.entries).toEqual([]);
    expect(matrix.coverage.totalRequirements).toBe(0);
    expect(matrix.coverage.coveragePercent).toBe(100);
    expect(matrix.coverage.gaps).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// 4. renderMatrixMarkdown
// --------------------------------------------------------------------------

describe("renderMatrixMarkdown", () => {
  it("非空矩阵渲染五列表头", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);
    const md = renderMatrixMarkdown(matrix);

    expect(md).toContain("| 需求 | 设计章节 | 任务项 | 证据来源 | 测试用例 |");
    expect(md).toContain("需求A");
    expect(md).toContain("设计章节A");
  });

  it("空矩阵渲染『暂无追溯条目』", () => {
    const empty: TraceabilityMatrix = {
      jobId: "job-1",
      generatedAt: FIXED_GENERATED_AT,
      entries: [],
      coverage: {
        totalRequirements: 0,
        coveredByDesign: 0,
        coveredByTasks: 0,
        coveredByEvidence: 0,
        coveredByTests: 0,
        coveragePercent: 100,
        gaps: [],
      },
    };
    const md = renderMatrixMarkdown(empty);
    expect(md).toContain("暂无追溯条目");
    expect(md).not.toContain("| 需求 | 设计章节");
  });

  it("stale: true 时渲染失效警告行", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);
    const md = renderMatrixMarkdown({ ...matrix, stale: true });
    expect(md).toContain("⚠️ 此矩阵已失效");
  });

  it("stale 未设置时不渲染失效警告行", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);
    const md = renderMatrixMarkdown(matrix);
    expect(md).not.toContain("⚠️ 此矩阵已失效");
  });

  it("存在缺口时渲染『⚠️ 覆盖缺口』区块", () => {
    const { nodes, specDocs } = buildMixedFixture();
    const matrix = deriveMatrix("job-1", nodes, specDocs, FIXED_GENERATED_AT);
    const md = renderMatrixMarkdown(matrix);
    expect(md).toContain("### ⚠️ 覆盖缺口");
    expect(md).toContain("需求B");
    expect(md).toContain("task, evidence, test");
  });
});

// --------------------------------------------------------------------------
// 5 & 6. REST 端点 + stale 标记
// --------------------------------------------------------------------------

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  const res: Partial<MockRes> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.type = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as MockRes;
}

function makeMatrix(jobId: string): TraceabilityMatrix {
  return {
    jobId,
    generatedAt: FIXED_GENERATED_AT,
    entries: [],
    coverage: {
      totalRequirements: 0,
      coveredByDesign: 0,
      coveredByTasks: 0,
      coveredByEvidence: 0,
      coveredByTests: 0,
      coveragePercent: 100,
      gaps: [],
    },
  };
}

function makeCtx(opts: {
  job?: BlueprintGenerationJob;
  withService?: boolean;
}): BlueprintServiceContext {
  const matrix = makeMatrix(opts.job?.id ?? "job-1");
  const service = opts.withService
    ? {
        generateMatrix: vi.fn().mockReturnValue(matrix),
        exportJson: vi.fn().mockReturnValue(matrix),
        exportMarkdown: vi.fn().mockReturnValue("## 可追溯矩阵 (markdown)"),
      }
    : undefined;
  return {
    jobStore: {
      get: vi.fn().mockReturnValue(opts.job),
    },
    traceabilityMatrixService: service,
  } as unknown as BlueprintServiceContext;
}

describe("createTraceabilityMatrixRouteHandler", () => {
  it("job 不存在时返回 404 job_not_found", () => {
    const ctx = makeCtx({ job: undefined, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler({ params: { jobId: "missing" }, query: {} } as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "job_not_found" });
  });

  it("traceabilityMatrixService 缺失时返回 404 matrix_not_generated", () => {
    const job = makeJob({ id: "job-1" });
    const ctx = makeCtx({ job, withService: false });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler({ params: { jobId: "job-1" }, query: {} } as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "matrix_not_generated" });
  });

  it("JSON 响应携带 stale 标记", () => {
    const job = makeJob({ id: "job-1" });
    const ctx = makeCtx({ job, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler({ params: { jobId: "job-1" }, query: {} } as any, res as any, vi.fn());

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty("stale", false);
    expect(payload).toHaveProperty("jobId", "job-1");
    expect(payload).toHaveProperty("coverage");
  });

  it("?format=markdown 返回 text/markdown", () => {
    const job = makeJob({ id: "job-1" });
    const ctx = makeCtx({ job, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler(
      { params: { jobId: "job-1" }, query: { format: "markdown" } } as any,
      res as any,
      vi.fn(),
    );

    expect(res.type).toHaveBeenCalledWith("text/markdown");
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send.mock.calls[0][0]).toContain("可追溯矩阵");
    expect(res.json).not.toHaveBeenCalled();
  });

  it("job 含 spec_tree 失效产物时 stale: true", () => {
    const job = makeJob({
      id: "job-stale",
      artifacts: [makeArtifact({ id: "art-tree", type: "spec_tree" })],
      staleArtifactIds: ["art-tree"],
    });
    const ctx = makeCtx({ job, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler({ params: { jobId: "job-stale" }, query: {} } as any, res as any, vi.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.stale).toBe(true);
  });

  it("staleArtifactIds 指向无关产物类型时 stale: false", () => {
    const job = makeJob({
      id: "job-not-stale",
      artifacts: [makeArtifact({ id: "art-preview", type: "preview" })],
      staleArtifactIds: ["art-preview"],
    });
    const ctx = makeCtx({ job, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler(
      { params: { jobId: "job-not-stale" }, query: {} } as any,
      res as any,
      vi.fn(),
    );

    const payload = res.json.mock.calls[0][0];
    expect(payload.stale).toBe(false);
  });

  it("无 staleArtifactIds 时 stale: false", () => {
    const job = makeJob({
      id: "job-clean",
      artifacts: [makeArtifact({ id: "art-tree", type: "spec_tree" })],
    });
    const ctx = makeCtx({ job, withService: true });
    const handler = createTraceabilityMatrixRouteHandler(ctx);
    const res = makeRes();
    handler({ params: { jobId: "job-clean" }, query: {} } as any, res as any, vi.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.stale).toBe(false);
  });
});

// --------------------------------------------------------------------------
// 7. createTraceabilityMatrixService（env gate）
// --------------------------------------------------------------------------

describe("createTraceabilityMatrixService env gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeServiceCtx(job?: BlueprintGenerationJob): BlueprintServiceContext {
    return {
      now: () => new Date(FIXED_GENERATED_AT),
      jobStore: {
        get: vi.fn().mockReturnValue(job),
      },
    } as unknown as BlueprintServiceContext;
  }

  it("env gate 关闭时返回空矩阵", () => {
    vi.stubEnv("BLUEPRINT_TRACEABILITY_MATRIX_ENABLED", "false");
    const job = makeJob({ id: "job-1" });
    const service = createTraceabilityMatrixService(makeServiceCtx(job));

    const matrix = service.generateMatrix("job-1");
    expect(matrix.entries).toEqual([]);
    expect(matrix.coverage.coveragePercent).toBe(100);
    expect(matrix.generatedAt).toBe(FIXED_GENERATED_AT);
  });

  it("env gate 开启且 job 含 spec_tree + tasks 文档时派生矩阵", () => {
    vi.stubEnv("BLUEPRINT_TRACEABILITY_MATRIX_ENABLED", "true");
    const { nodes } = buildMixedFixture();
    const job = makeJob({
      id: "job-1",
      artifacts: [
        makeArtifact({
          id: "art-tree",
          type: "spec_tree",
          payload: { nodes },
        }),
        makeArtifact({
          id: "art-tasks",
          type: "tasks",
          payload: makeDoc({
            id: "doc-tasks-A",
            nodeId: "req-A",
            type: "tasks",
            content: ["- [ ] 验证登录成功路径", "- [x] 验证登出清理会话"].join("\n"),
          }),
        }),
      ],
    });
    const service = createTraceabilityMatrixService(makeServiceCtx(job));

    const matrix = service.generateMatrix("job-1");
    expect(matrix.entries.map((e) => e.requirementId)).toEqual(["req-A", "req-B"]);
    const entryA = matrix.entries.find((e) => e.requirementId === "req-A")!;
    expect(entryA.testCases).toEqual(["验证登录成功路径", "验证登出清理会话"]);
  });

  it("env gate 开启但 job 不存在时返回空矩阵", () => {
    vi.stubEnv("BLUEPRINT_TRACEABILITY_MATRIX_ENABLED", "true");
    const service = createTraceabilityMatrixService(makeServiceCtx(undefined));

    const matrix = service.generateMatrix("missing");
    expect(matrix.entries).toEqual([]);
    expect(matrix.coverage.totalRequirements).toBe(0);
  });

  it("exportMarkdown 返回 Markdown 字符串", () => {
    vi.stubEnv("BLUEPRINT_TRACEABILITY_MATRIX_ENABLED", "true");
    const { nodes } = buildMixedFixture();
    const job = makeJob({
      id: "job-1",
      artifacts: [
        makeArtifact({ id: "art-tree", type: "spec_tree", payload: { nodes } }),
      ],
    });
    const service = createTraceabilityMatrixService(makeServiceCtx(job));

    const md = service.exportMarkdown("job-1");
    expect(md).toContain("## 可追溯矩阵 (Traceability Matrix)");
    expect(md).toContain("| 需求 | 设计章节 | 任务项 | 证据来源 | 测试用例 |");
  });
});
