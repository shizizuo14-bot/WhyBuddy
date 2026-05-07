import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  normalizeBlueprintArtifactDiffResponse,
  normalizeBlueprintArtifactFeedbackResponse,
  normalizeBlueprintArtifactLedgerResponse,
  normalizeBlueprintArtifactReplaysResponse,
  normalizeBlueprintEngineeringLandingResponse,
  normalizeBlueprintEngineeringRunsResponse,
} from "@/lib/blueprint-api";

import BlueprintProgressPanel from "./BlueprintProgressPanel";

describe("BlueprintProgressPanel", () => {
  it("renders aggregate blueprint progress and per-spec status", () => {
    const markup = renderToStaticMarkup(
      <BlueprintProgressPanel
        autoLoad={false}
        initialData={{
          generatedAt: "2026-05-06T00:00:00.000Z",
          root: ".kiro/specs",
          totalSpecs: 2,
          totalDocs: 6,
          completedTasks: 3,
          totalTasks: 5,
          specs: [
            {
              id: "blueprint-input-github-ingestion",
              phase: "intake",
              order: 1,
              title: "Input GitHub ingestion",
              summary: "Normalize user goals and GitHub sources.",
              docs: {
                requirements: true,
                design: true,
                tasks: true,
                completed: 3,
                total: 3,
                missing: [],
              },
              tasks: { completed: 1, total: 2, percent: 50 },
            },
            {
              id: "blueprint-spec-tree-workbench",
              phase: "planning",
              order: 5,
              title: "Spec tree workbench",
              summary: "Refine and persist the derived SPEC tree.",
              docs: {
                requirements: true,
                design: false,
                tasks: false,
                completed: 1,
                total: 3,
                missing: ["design", "tasks"],
              },
              tasks: { completed: 2, total: 3, percent: 67 },
            },
          ],
        }}
      />
    );

    expect(markup).toContain('data-testid="blueprint-progress-panel"');
    expect(markup).toContain("蓝图进度");
    expect(markup).toContain("SPEC 执行概览");
    expect(markup).toContain("2 项已列出");
    expect(markup).toContain("6");
    expect(markup).toContain("50%");
    expect(markup).toContain("输入与 GitHub 接入");
    expect(markup).toContain("SPEC 树工作台");
    expect(markup).toContain("设计");
  });

  it("renders the latest generated RouteSet with tree and document workbenches", () => {
    const routeSet = {
      id: "routeset-1",
      requestId: "job-1",
      createdAt: "2026-05-06T00:00:00.000Z",
      primaryRouteId: "route-primary",
      nextAsset: {
        type: "spec_tree" as const,
        menu: "deduction" as const,
        description: "Use the selected RouteSet path as the SPEC tree seed.",
      },
      provenance: {
        githubUrls: ["https://github.com/example/repo"],
      },
      routes: [
        {
          id: "route-primary",
          kind: "primary" as const,
          title: "Primary SPEC asset route",
          summary: "Clarify, derive SPEC tree, then package prompts.",
          rationale: "Balanced path.",
          riskLevel: "medium" as const,
          costLevel: "medium" as const,
          complexity: "balanced" as const,
          estimatedEffort: "2-4 analysis passes",
          capabilities: [
            {
              id: "docker-analysis",
              label: "Docker analysis sandbox",
              kind: "docker" as const,
              purpose: "Analyze source in isolation.",
            },
          ],
          steps: [
            {
              id: "clarify-intent",
              title: "Clarify execution intent",
              description: "Collect target users and boundaries.",
              role: "Product strategist",
              status: "ready" as const,
            },
          ],
          outputs: ["RouteSet outline"],
        },
        {
          id: "route-alt",
          kind: "alternative" as const,
          title: "Documentation-first conservative route",
          summary: "Freeze docs before preview.",
          rationale: "Lower risk.",
          riskLevel: "low" as const,
          costLevel: "low" as const,
          complexity: "light" as const,
          estimatedEffort: "1-2 review passes",
          capabilities: [],
          steps: [],
          outputs: ["Requirements"],
        },
      ],
    };

    const engineeringLandingPlans =
      normalizeBlueprintEngineeringLandingResponse(
        {
          landing_plans: [
            {
              id: "landing-plan-1",
              job_id: "job-1",
              tree_id: "spec-tree-1",
              prompt_package_id: "prompt-package-1",
              target_platform: "cursor",
              title: "Cursor engineering landing plan",
              summary:
                "Hand off the permission system package to a Cursor workspace.",
              status: "ready",
              platform_handoffs: [
                {
                  id: "handoff-cursor",
                  platform: "cursor",
                  label: "Cursor workspace handoff",
                  summary:
                    "Open the prompt package in Cursor and apply the permission workflow.",
                  prompt_package_id: "prompt-package-1",
                  instructions: [
                    "Use the Objective and Acceptance checklist sections.",
                    "Keep audit persistence changes scoped to permission files.",
                  ],
                },
              ],
              implementation_steps: [
                {
                  id: "landing-step-schema",
                  title: "Apply permission schema",
                  summary:
                    "Implement auditable role grants and denied-action replay.",
                  status: "ready",
                  commands: ["pnpm vitest permission"],
                  prompt_package_ids: ["prompt-package-1"],
                },
              ],
              verification_commands: [
                {
                  id: "verify-permission",
                  title: "Permission tests",
                  command: "pnpm vitest permission",
                  expected: "Permission workflow tests pass.",
                },
              ],
              changed_files: ["client/src/permission.ts"],
              created_at: "2026-05-06T00:00:00.000Z",
              updated_at: "2026-05-06T00:00:00.000Z",
            },
          ],
        },
        "job-1"
      ).landingPlans;

    const engineeringRuns = normalizeBlueprintEngineeringRunsResponse(
      {
        landing_plan: {
          id: "landing-plan-1",
          job_id: "job-1",
          tree_id: "spec-tree-1",
          prompt_package_id: "prompt-package-1",
          platform: "cursor",
          title: "Cursor engineering landing plan",
          summary:
            "Hand off the permission system package to a Cursor workspace.",
          status: "ready",
        },
        engineering_runs: [
          {
            id: "engineering-run-1",
            job_id: "job-1",
            landing_plan_id: "landing-plan-1",
            status: "passed",
            summary: "Cursor handoff implemented and verified.",
            logs: ["Applied permission schema."],
            verification_results: [
              {
                id: "verification-result-1",
                title: "Permission tests",
                command: "pnpm vitest permission",
                status: "passed",
                summary: "Green test run.",
              },
            ],
            changed_files: ["client/src/permission.ts"],
            recorded_at: "2026-05-06T00:10:00.000Z",
          },
        ],
      },
      "job-1"
    ).engineeringRuns;

    const artifactLedgerEntries = normalizeBlueprintArtifactLedgerResponse(
      {
        entries: [
          {
            id: "ledger-route",
            job_id: "job-1",
            artifact_id: "artifact-route",
            artifact_type: "route_set",
            stage: "route_generation",
            title: "RouteSet generated",
            summary: "Primary SPEC asset route was generated.",
            status: "recorded",
            version: 1,
            created_at: "2026-05-06T00:00:00.000Z",
          },
          {
            id: "ledger-run",
            job_id: "job-1",
            artifact_id: "artifact-run",
            artifact_type: "engineering_run",
            stage: "engineering_landing",
            title: "Engineering run recorded",
            summary: "Cursor handoff implementation evidence was stored.",
            status: "recorded",
            version: 1,
            source_entry_ids: ["ledger-route"],
            source_artifact_ids: ["artifact-route"],
            lineage_edges: [
              {
                id: "lineage-route-run",
                from_entry_id: "ledger-route",
                to_entry_id: "ledger-run",
                kind: "derived_from",
                summary: "Run evidence derives from the RouteSet.",
              },
            ],
            created_at: "2026-05-06T00:10:00.000Z",
          },
        ],
      },
      "job-1"
    ).entries;
    const artifactReplays = normalizeBlueprintArtifactReplaysResponse(
      {
        replays: [
          {
            id: "artifact-replay-1",
            job_id: "job-1",
            title: "Permission project replay",
            summary: "Recovered RouteSet to engineering run timeline.",
            status: "ready",
            snapshots: [
              {
                id: "replay-snapshot-run",
                entry_id: "ledger-run",
                artifact_type: "engineering_run",
                stage: "engineering_landing",
                title: "Engineering run recorded",
                summary: "Cursor handoff implementation evidence was stored.",
                status: "replayed",
                lineage_edge_count: 1,
              },
            ],
            lineage_edges: [
              {
                id: "lineage-route-run",
                from_entry_id: "ledger-route",
                to_entry_id: "ledger-run",
                kind: "derived_from",
              },
            ],
            lineage_edge_count: 1,
            created_at: "2026-05-06T00:12:00.000Z",
          },
        ],
      },
      "job-1"
    ).replays;
    const artifactFeedback = [
      normalizeBlueprintArtifactFeedbackResponse(
        {
          feedback: {
            id: "artifact-feedback-1",
            job_id: "job-1",
            entry_id: "ledger-run",
            sentiment: "positive",
            status: "backfilled",
            summary: "Execution evidence approved for future SPEC evolution.",
            notes: "Bind this run back into the asset memory.",
            backfill_targets: ["spec-tree-1", "prompt-package-1"],
            created_at: "2026-05-06T00:14:00.000Z",
          },
        },
        "job-1"
      ).feedback,
    ];
    const artifactDiff = normalizeBlueprintArtifactDiffResponse(
      {
        diff: {
          id: "artifact-diff-1",
          job_id: "job-1",
          left_entry_id: "ledger-route",
          right_entry_id: "ledger-run",
          title: "Route to run diff",
          summary: "Engineering run adds implementation evidence.",
          status: "ready",
          added: 1,
          changed: 1,
        },
      },
      "job-1"
    ).diff;
    expect(artifactDiff.summary).toContain("implementation evidence");

    const markup = renderToStaticMarkup(
      <BlueprintProgressPanel
        autoLoad={false}
        initialRouteSet={routeSet}
        initialSelection={{
          id: "selection-1",
          routeSetId: "routeset-1",
          routeId: "route-primary",
          routeTitle: "Primary SPEC asset route",
          selectedAt: "2026-05-06T00:00:00.000Z",
          reason: "Balanced route.",
          mergedAlternativeRouteIds: ["route-alt"],
          status: "selected",
          provenance: {
            jobId: "job-1",
          },
        }}
        initialSpecTree={{
          id: "spec-tree-1",
          routeSetId: "routeset-1",
          selectionId: "selection-1",
          selectedRouteId: "route-primary",
          rootNodeId: "node-root",
          version: 1,
          status: "draft",
          createdAt: "2026-05-06T00:00:00.000Z",
          updatedAt: "2026-05-06T00:00:00.000Z",
          alternativeRouteIds: ["route-alt"],
          provenance: {
            jobId: "job-1",
            githubUrls: ["https://github.com/example/repo"],
          },
          nodes: [
            {
              id: "node-root",
              title: "SPEC asset tree: Permission System",
              summary: "Durable tree asset derived from the route.",
              type: "root",
              status: "draft",
              priority: 0,
              routeId: "route-primary",
              dependencies: [],
              outputs: ["SPEC tree"],
              children: ["node-docs"],
            },
            {
              id: "node-docs",
              parentId: "node-root",
              title: "Specification document generation",
              summary: "Expand requirements, design, and tasks.",
              type: "spec_document",
              status: "seed",
              priority: 1,
              routeId: "route-primary",
              dependencies: [],
              outputs: ["requirements.md", "design.md", "tasks.md"],
              children: ["node-task"],
            },
            {
              id: "node-task",
              parentId: "node-docs",
              title: "Task breakdown",
              summary: "Split the SPEC into implementation-ready chunks.",
              type: "engineering_plan",
              status: "draft",
              priority: 2,
              routeId: "route-primary",
              dependencies: ["node-docs"],
              outputs: ["task checklist"],
              children: [],
            },
          ],
        }}
        initialSpecDocuments={[
          {
            id: "doc-requirements",
            jobId: "job-1",
            treeId: "spec-tree-1",
            nodeId: "node-docs",
            type: "requirements",
            status: "accepted",
            version: 1,
            sourceDocumentId: "doc-source-requirements",
            title: "Requirements: Permission System",
            summary: "User-facing requirements for the permission system.",
            content: "# Requirements\n\n- Track audit evidence.",
            format: "markdown",
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
            provenance: {
              jobId: "job-1",
              githubUrls: ["https://github.com/example/repo"],
              treeVersion: 1,
              nodeType: "spec_document",
              nodeTitle: "Specification document generation",
              nodeSummary: "Expand requirements, design, and tasks.",
              dependencies: [],
              outputs: ["requirements.md", "design.md", "tasks.md"],
            },
          },
        ]}
        initialEffectPreviews={[
          {
            id: "preview-1",
            jobId: "job-1",
            treeId: "spec-tree-1",
            nodeId: "node-docs",
            sourceDocumentIds: ["doc-requirements"],
            status: "completed",
            summary:
              "Preview of architecture, prototype cues, and implementation progress.",
            architectureNotes: [
              "Keep policy evaluation behind an auditable service boundary.",
              "Persist review evidence with immutable timestamps.",
            ],
            prototypeNotes: [
              "Show role assignment and denied-action replay in the prototype.",
            ],
            progressPlan: [
              {
                id: "preview-step-1",
                title: "Model permission resources",
                summary: "Define roles, grants, denials, and audit joins.",
                target: "Resources are ready for implementation prompts.",
                sourceDocumentIds: ["doc-requirements"],
              },
            ],
            nodes: [],
            createdAt: "2026-05-06T00:00:00.000Z",
            provenance: {
              jobId: "job-1",
              githubUrls: ["https://github.com/example/repo"],
              treeVersion: 1,
              nodeType: "spec_document",
              nodeTitle: "Specification document generation",
              nodeSummary: "Expand requirements, design, and tasks.",
              sourceStatus: "accepted",
              includeDrafts: false,
              sourceDocumentStatuses: {
                "doc-requirements": "accepted",
              },
            },
          },
        ]}
        initialPromptPackages={[
          {
            id: "prompt-package-1",
            jobId: "job-1",
            treeId: "spec-tree-1",
            nodeIds: ["node-task"],
            targetPlatform: "cursor",
            target: {
              platform: "cursor",
              label: "Cursor",
              executionMode: "workspace",
              guidance: "Use this package inside a Cursor workspace.",
            },
            title: "Cursor implementation prompt package",
            summary:
              "Copy-ready prompt package for implementing the permission system.",
            content:
              "Implement the permission system with auditable role grants, denied-action replay, and immutable review evidence.",
            sections: [
              {
                id: "section-objective",
                kind: "context",
                title: "Objective",
                content:
                  "Build the permission workflow from accepted SPEC documents and the effect preview.",
                items: [],
                nodeIds: ["node-task"],
                sourceDocumentIds: ["doc-requirements"],
                sourcePreviewIds: ["preview-1"],
              },
              {
                id: "section-acceptance",
                kind: "verification",
                title: "Acceptance checklist",
                content:
                  "Verify role assignment, denied-action replay, and audit evidence persistence.",
                items: [],
                nodeIds: ["node-task"],
                sourceDocumentIds: ["doc-requirements"],
                sourcePreviewIds: ["preview-1"],
              },
            ],
            sourceDocumentIds: ["doc-requirements"],
            sourcePreviewIds: ["preview-1"],
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
            provenance: {
              jobId: "job-1",
              githubUrls: ["https://github.com/example/repo"],
              treeVersion: 1,
              nodeIds: ["node-task"],
              sourceDocumentIds: ["doc-requirements"],
              sourcePreviewIds: ["preview-1"],
              targetPlatform: "cursor",
              sourceDocumentStatus: "accepted",
              sourcePreviewStatus: "accepted",
              includeDrafts: false,
              includePreviewDrafts: false,
              sourceDocumentStatuses: {
                "doc-requirements": "accepted",
              },
              sourcePreviewStatuses: {
                "preview-1": "completed",
              },
            },
          },
        ]}
        initialCapabilities={[
          {
            id: "capability-docker-analysis",
            label: "Docker analysis sandbox",
            kind: "docker",
            purpose: "Analyze source safely in an isolated runtime.",
            description:
              "Runs repository inspection commands inside a sandboxed Docker adapter.",
            tags: ["analysis", "sandbox"],
            securityLevel: "sandboxed",
            status: "available",
            adapter: "docker-blueprint-adapter",
            inputSchema: "{\"type\":\"object\"}",
            outputTypes: ["analysis", "log"],
            supportedStages: ["runtime_capability", "engineering_landing"],
            requiresApproval: false,
            projectScoped: true,
          },
          {
            id: "capability-skill-publisher",
            label: "Skill evidence publisher",
            kind: "skill",
            purpose: "Publish reusable skill evidence for later handoff.",
            description:
              "Normalizes generated notes into runtime capability evidence.",
            tags: ["evidence"],
            securityLevel: "readonly",
            status: "requires_approval",
            adapter: "skill-blueprint-adapter",
            inputSchema: "{\"type\":\"object\"}",
            outputTypes: ["document"],
            supportedStages: ["runtime_capability"],
            requiresApproval: true,
            projectScoped: false,
          },
        ]}
        initialCapabilityInvocations={[
          {
            id: "capability-invocation-1",
            jobId: "job-1",
            capabilityId: "capability-docker-analysis",
            capabilityLabel: "Docker analysis sandbox",
            kind: "docker",
            status: "completed",
            securityLevel: "sandboxed",
            safetyGate: {
              status: "allowed",
              reason: "Sandboxed analysis is permitted for this job.",
              requiresApproval: false,
              approved: true,
              securityLevel: "sandboxed",
            },
            requestedAt: "2026-05-06T00:06:00.000Z",
            completedAt: "2026-05-06T00:07:00.000Z",
            requestedBy: "blueprint-workbench",
            routeId: "route-primary",
            nodeId: "node-task",
            input: "Inspect permission model boundaries.",
            outputSummary:
              "Docker sandbox found auditable permission boundaries.",
            logs: ["Analyzed policy service files."],
            evidenceIds: ["capability-evidence-1"],
            durationMs: 62000,
            provenance: {
              jobId: "job-1",
              routeSetId: "routeset-1",
              routeId: "route-primary",
              specTreeId: "spec-tree-1",
              nodeId: "node-task",
              targetText: "Build a permission system.",
              githubUrls: ["https://github.com/example/repo"],
            },
          },
        ]}
        initialCapabilityEvidence={[
          {
            id: "capability-evidence-1",
            jobId: "job-1",
            invocationId: "capability-invocation-1",
            capabilityId: "capability-docker-analysis",
            capabilityLabel: "Docker analysis sandbox",
            kind: "analysis",
            status: "recorded",
            title: "Permission boundary analysis",
            summary:
              "Runtime evidence confirms permission checks have auditable service boundaries.",
            createdAt: "2026-05-06T00:07:00.000Z",
            routeSetId: "routeset-1",
            routeId: "route-primary",
            specTreeId: "spec-tree-1",
            nodeId: "node-task",
            artifacts: ["analysis-report.md"],
            logs: ["Policy service inspected."],
            tags: ["permission", "audit"],
            payloadSummary: {
              files: 3,
              riskyWrite: false,
              finding: "auditable boundary",
            },
            provenance: {
              jobId: "job-1",
              routeSetId: "routeset-1",
              routeId: "route-primary",
              specTreeId: "spec-tree-1",
              nodeId: "node-task",
              targetText: "Build a permission system.",
              githubUrls: ["https://github.com/example/repo"],
            },
          },
        ]}
        initialEngineeringLandingPlans={engineeringLandingPlans}
        initialEngineeringRuns={engineeringRuns}
        initialArtifactLedgerEntries={artifactLedgerEntries}
        initialArtifactReplays={artifactReplays}
        initialArtifactFeedback={artifactFeedback}
        initialJob={{
          id: "job-1",
          request: {
            targetText: "Build a permission system.",
            githubUrls: ["https://github.com/example/repo"],
          },
          status: "completed",
          stage: "route_generation",
          version: "blueprint-generation/v1",
          createdAt: "2026-05-06T00:00:00.000Z",
          updatedAt: "2026-05-06T00:00:00.000Z",
          completedAt: "2026-05-06T00:00:00.000Z",
          artifacts: [],
          events: [],
        }}
      />
    );

    expect(markup).toContain('data-testid="blueprint-routeset-preview"');
    expect(markup).toContain("已选择用于推导的路线");
    expect(markup).toContain("主执行路径：SPEC 资产路线");
    expect(markup).toContain("次选路径：文档优先稳妥路线");
    expect(markup).toContain("Docker 分析沙盒");
    expect(markup).toContain('data-testid="blueprint-reset-route-selection-button"');
    expect(markup).toContain("重置路线");
    expect(markup).toContain('data-testid="blueprint-spec-tree-preview"');
    expect(markup).toContain("推导 SPEC 树工作台");
    expect(markup).toContain('data-testid="spec-tree-action-toolbar"');
    expect(markup).toContain("结构操作");
    expect(markup).toContain('data-testid="spec-tree-add-node-button"');
    expect(markup).toContain("添加子节点");
    expect(markup).toContain('data-testid="spec-tree-move-node-button"');
    expect(markup).toContain("移动节点");
    expect(markup).toContain('data-testid="spec-tree-merge-node-button"');
    expect(markup).toContain("合并节点");
    expect(markup).toContain('data-testid="spec-tree-split-node-button"');
    expect(markup).toContain("拆分节点");
    expect(markup).toContain('data-testid="spec-tree-delete-node-button"');
    expect(markup).toContain("删除节点");
    expect(markup).toContain('data-testid="spec-tree-version-timeline"');
    expect(markup).toContain("版本时间线");
    expect(markup).toContain('data-testid="spec-tree-node-list"');
    expect(markup).toContain('data-testid="spec-tree-node-detail"');
    expect(markup).toContain("SPEC 资产树：权限系统");
    expect(markup).toContain("任务拆分");
    expect(markup).toContain("保存节点");
    expect(markup).toContain("保存版本");
    expect(markup).toContain("规格文档生成");
    expect(markup).toContain('data-testid="spec-document-workbench"');
    expect(markup).toContain("规格文档工作台");
    expect(markup).toContain("生成文档");
    expect(markup).toContain('data-testid="spec-document-review-status"');
    expect(markup).toContain("已接受");
    expect(markup).toContain('data-testid="spec-document-accept-button"');
    expect(markup).toContain("接受");
    expect(markup).toContain('data-testid="spec-document-reject-button"');
    expect(markup).toContain("拒绝");
    expect(markup).toContain(
      'data-testid="spec-document-save-version-button"'
    );
    expect(markup).toContain('data-testid="spec-document-preview"');
    expect(markup).toContain("跟踪审计证据。");
    expect(markup).toContain('data-testid="effect-preview-workbench"');
    expect(markup).toContain("效果预演");
    expect(markup).toContain("已接受 SPEC 的效果预演");
    expect(markup).toContain("生成预演");
    expect(markup).toContain('data-testid="effect-preview-list"');
    expect(markup).toContain("预演详情");
    expect(markup).toContain("架构说明");
    expect(markup).toContain(
      "将策略评估保持在可审计的服务边界之后。"
    );
    expect(markup).toContain("原型说明");
    expect(markup).toContain(
      "在原型中展示角色分配和拒绝动作回放。"
    );
    expect(markup).toContain("进度规划");
    expect(markup).toContain("建模权限资源");
    expect(markup).toContain('data-testid="prompt-package-workbench"');
    expect(markup).toContain("实现提示词包");
    expect(markup).toContain('data-testid="prompt-package-platform-filter"');
    expect(markup).toContain("Cursor");
    expect(markup).toContain("Kiro");
    expect(markup).toContain("Trae");
    expect(markup).toContain("Windsurf");
    expect(markup).toContain("Codex");
    expect(markup).toContain("Claude");
    expect(markup).toContain('data-testid="prompt-package-generate-button"');
    expect(markup).toContain("生成提示词包");
    expect(markup).toContain('data-testid="prompt-package-list"');
    expect(markup).toContain("Cursor 实现提示词包");
    expect(markup).toContain('data-testid="prompt-package-sections-preview"');
    expect(markup).toContain("目标");
    expect(markup).toContain("验收清单");
    expect(markup).toContain(
      "实现具备可审计角色授权"
    );
    expect(markup).toContain("来源文档 / 预演");
    expect(markup).toContain(
      'data-testid="runtime-capability-bridge-workbench"'
    );
    expect(markup).toContain("运行时能力桥");
    expect(markup).toContain("运行时能力桥工作台");
    expect(markup).toContain('data-testid="capability-registry-list"');
    expect(markup).toContain("Docker 分析沙盒");
    expect(markup).toContain("技能证据发布器");
    expect(markup).toContain('data-testid="capability-launcher-select"');
    expect(markup).toContain('data-testid="capability-launcher-node-select"');
    expect(markup).toContain('data-testid="capability-invoke-button"');
    expect(markup).toContain("调用能力");
    expect(markup).toContain('data-testid="capability-invocation-list"');
    expect(markup).toContain(
      "Docker 沙盒发现了可审计的权限边界。"
    );
    expect(markup).toContain('data-testid="capability-evidence-list"');
    expect(markup).toContain("权限边界分析");
    expect(markup).toContain(
      "运行时证据确认权限校验具有可审计的服务边界。"
    );
    expect(markup.indexOf('data-testid="prompt-package-workbench"')).toBeLessThan(
      markup.indexOf('data-testid="runtime-capability-bridge-workbench"')
    );
    expect(
      markup.indexOf('data-testid="runtime-capability-bridge-workbench"')
    ).toBeLessThan(markup.indexOf('data-testid="engineering-landing-workbench"'));
    expect(markup).toContain('data-testid="engineering-landing-workbench"');
    expect(markup).toContain("工程落地");
    expect(markup).toContain("工程落地工作台");
    expect(markup).toContain('data-testid="engineering-landing-generate-button"');
    expect(markup).toContain("生成落地计划");
    expect(markup).toContain('data-testid="engineering-landing-plan-list"');
    expect(markup).toContain("Cursor 工程落地计划");
    expect(markup).toContain('data-testid="engineering-platform-handoffs"');
    expect(markup).toContain("Cursor 工作区交接");
    expect(markup).toContain("使用目标和验收清单部分。");
    expect(markup).toContain('data-testid="engineering-landing-steps"');
    expect(markup).toContain("应用权限模式");
    expect(markup).toContain('data-testid="engineering-verification-commands"');
    expect(markup).toContain("权限测试");
    expect(markup).toContain("pnpm vitest permission");
    expect(markup).toContain('data-testid="engineering-run-recorder"');
    expect(markup).toContain("执行记录器");
    expect(markup).toContain('data-testid="engineering-run-record-button"');
    expect(markup).toContain("记录执行");
    expect(markup).toContain('data-testid="engineering-run-list"');
    expect(markup).toContain("Cursor 交接已实现并验证。");
    expect(markup).toContain("client/src/permission.ts");
    expect(markup).toContain('data-testid="artifact-memory-workbench"');
    expect(markup).toContain("资产记忆与回放工作台");
    expect(markup).toContain('data-testid="artifact-ledger-timeline"');
    expect(markup).toContain('data-testid="artifact-ledger-stage-group"');
    expect(markup).toContain("RouteSet 已生成");
    expect(markup).toContain("工程执行记录");
    expect(markup).toContain('data-testid="artifact-replay-summary"');
    expect(markup).toContain("权限项目回放");
    expect(markup).toContain("1 条边");
    expect(markup).toContain('data-testid="artifact-diff-controls"');
    expect(markup).toContain("资产差异");
    expect(markup).toContain('data-testid="artifact-feedback-recorder"');
    expect(markup).toContain("反馈回填记录器");
    expect(markup).toContain('data-testid="artifact-feedback-list"');
    expect(markup).toContain(
      "执行证据已批准，可用于未来 SPEC 演进。"
    );
  });
});
