/**
 * `autopilot-spec-documents-workbench-v2` Phase 1 / Task 5 — 底部执行步骤空态 SSR 测试。
 *
 * 测试策略与本仓既有 right-rail 测试保持一致：使用 `react-dom/server` 的
 * `renderToStaticMarkup` + `vi.mock` 的组合，对 SSR 输出做字符串级断言。
 *
 * 本测试覆盖 requirements R5.1 / R5.2 / R5.6 / R5.7 / R5.8 / R6.5：
 * - 当 `job` 为 null 且 reasoning entries 为空时，两栏均渲染空态占位文案，
 *   不出现 `MiroFishCardStream`，不出现 `<ul>` / `<ol>` / `*-list` 列表容器。
 * - 当 `job` 有 artifacts 且 reasoning entries 非空时，两栏均渲染真实 card，
 *   不出现空态占位文案。
 * - 当 `job` 有 artifacts 但 reasoning entries 为空时，左栏渲染 artifact card，
 *   右栏渲染空态占位文案。
 * - 当 `job` 为 null（无 artifacts）但 reasoning entries 非空时，左栏渲染空态
 *   占位文案，右栏渲染 reasoning card。
 * - 外层 `data-testid="autopilot-workbench-execution-panel"` 始终存在。
 * - 任何情况下均不出现 `<ul>` / `<ol>` / `*-list` testid。
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock `useBlueprintRealtimeStore`：可配置 agentReasoning.entries 返回值。
let mockReasoningEntries: unknown[] = [];

vi.mock("@/lib/blueprint-realtime-store", () => {
  const useBlueprintRealtimeStore = ((selector?: (state: unknown) => unknown) => {
    const snapshot = {
      agentReasoning: { entries: mockReasoningEntries },
      rolePhases: {} as Record<string, unknown>,
      agentProgress: {} as Record<string, unknown>,
      capabilityStatuses: [] as unknown[],
    };
    return selector ? selector(snapshot) : snapshot;
  }) as unknown as typeof import("@/lib/blueprint-realtime-store").useBlueprintRealtimeStore;

  return {
    useBlueprintRealtimeStore,
    __setSocket: () => {},
  };
});

// Mock `parseSpecDocsObservingEntries`：返回空 snapshot。
vi.mock(
  "../../../parse-spec-docs-observing",
  () => ({
    parseSpecDocsObservingEntries: () => ({ byNodeTitle: new Map() }),
  })
);

import { WorkbenchExecutionPanel } from "../WorkbenchExecutionPanel";
import type { WorkbenchExecutionPanelProps } from "../WorkbenchExecutionPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(
  overrides: Partial<WorkbenchExecutionPanelProps> = {}
): WorkbenchExecutionPanelProps {
  return {
    job: null,
    locale: "zh-CN",
    reasoningEntries: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkbenchExecutionPanel empty states", () => {
  it("a. job=null AND reasoning empty: both empty placeholders, no stream stub, no list containers", () => {
    mockReasoningEntries = [];

    const markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel {...makeProps({ job: null })} />
    );

    // 两个空态占位文案出现
    expect(markup).toContain('data-testid="autopilot-workbench-execution-artifacts-empty"');
    expect(markup).toContain('data-testid="autopilot-workbench-execution-reasoning-empty"');

    expect(markup).not.toContain('data-testid="mirofish-card-artifact"');
    expect(markup).not.toContain('data-testid="mirofish-card-reasoning"');

    // 不出现列表容器
    expect(markup).not.toMatch(/<ul\b/);
    expect(markup).not.toMatch(/<ol\b/);
    expect(markup).not.toMatch(/data-testid="[^"]*-list"/);
  });

  it("b. job has artifacts AND reasoning non-empty: both columns render cards, no empty placeholders", () => {
    mockReasoningEntries = [];

    const job = {
      id: "job-1",
      artifacts: [{ id: "a1", type: "spec_document", payload: {} }],
    } as unknown as WorkbenchExecutionPanelProps["job"];

    const markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel
        {...makeProps({
          job,
          reasoningEntries: [
            {
              id: "r1",
              phase: "thinking",
              iteration: 1,
              iterationLabel: "#1",
              timestamp: "2026-01-01T00:00:00Z",
              stageId: "spec_docs",
              thought: "生成规格文档",
            },
          ] as any,
        })}
      />
    );

    expect(markup).toContain('data-testid="mirofish-card-artifact"');
    expect(markup).toContain('data-testid="mirofish-card-reasoning"');

    // 空态占位文案不出现
    expect(markup).not.toContain('data-testid="autopilot-workbench-execution-artifacts-empty"');
    expect(markup).not.toContain('data-testid="autopilot-workbench-execution-reasoning-empty"');
  });

  it("c. job has artifacts BUT reasoning empty: left renders stream stub, right renders empty placeholder", () => {
    mockReasoningEntries = [];

    const job = {
      id: "job-2",
      artifacts: [{ id: "a1", type: "spec_document", payload: {} }],
    } as unknown as WorkbenchExecutionPanelProps["job"];

    const markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel {...makeProps({ job })} />
    );

    // 左栏有 artifact card
    expect(markup).toContain('data-testid="mirofish-card-artifact"');

    // 右栏有空态占位
    expect(markup).toContain('data-testid="autopilot-workbench-execution-reasoning-empty"');

    // 左栏无空态占位
    expect(markup).not.toContain('data-testid="autopilot-workbench-execution-artifacts-empty"');
  });

  it("d. job=null (no artifacts) BUT reasoning non-empty: left renders empty placeholder, right renders reasoning card", () => {
    mockReasoningEntries = [];

    const markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel
        {...makeProps({
          job: null,
          reasoningEntries: [
            {
              id: "r1",
              phase: "thinking",
              iteration: 1,
              iterationLabel: "#1",
              timestamp: "2026-01-01T00:00:00Z",
              stageId: "spec_docs",
              thought: "读取规格树",
            },
          ] as any,
        })}
      />
    );

    // 左栏有空态占位
    expect(markup).toContain('data-testid="autopilot-workbench-execution-artifacts-empty"');

    // 右栏有 reasoning card
    expect(markup).toContain('data-testid="mirofish-card-reasoning"');

    // 右栏无空态占位
    expect(markup).not.toContain('data-testid="autopilot-workbench-execution-reasoning-empty"');
  });

  it("e. outer data-testid='autopilot-workbench-execution-panel' always present", () => {
    mockReasoningEntries = [];

    const markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel {...makeProps()} />
    );

    expect(markup).toContain('data-testid="autopilot-workbench-execution-panel"');
  });

  it("f. no <ul>, <ol>, or *-list testids in any case", () => {
    // Case 1: both empty
    mockReasoningEntries = [];
    let markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel {...makeProps({ job: null })} />
    );
    expect(markup).not.toMatch(/<ul\b/);
    expect(markup).not.toMatch(/<ol\b/);
    expect(markup).not.toMatch(/data-testid="[^"]*-list"/);

    // Case 2: both non-empty
    mockReasoningEntries = [{ id: "r1", phase: "thinking", iteration: 1 }];
    const job = {
      id: "job-3",
      artifacts: [{ id: "a1", type: "spec_document", payload: {} }],
    } as unknown as WorkbenchExecutionPanelProps["job"];

    markup = renderToStaticMarkup(
      <WorkbenchExecutionPanel {...makeProps({ job })} />
    );
    expect(markup).not.toMatch(/<ul\b/);
    expect(markup).not.toMatch(/<ol\b/);
    expect(markup).not.toMatch(/data-testid="[^"]*-list"/);
  });
});
