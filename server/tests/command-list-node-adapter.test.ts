import { describe, expect, it } from "vitest";

import {
  createInMemoryCommandListEventStore,
  createInMemoryCommandListSnapshotStore,
  executeCommandListNode,
  selectCommandListCandidate,
} from "../routes/node-adapters/command-list-node-adapter.js";

describe("command_list node adapter", () => {
  it("builds structured command candidates and selection bridge", async () => {
    const eventStore = createInMemoryCommandListEventStore();
    const snapshotStore = createInMemoryCommandListSnapshotStore();

    const result = await executeCommandListNode(
      {
        nodeType: "command_list",
        input: {
          listId: "cmd-list-1",
          commandText: "整理支付系统发布方案",
          userId: "user-1",
          locale: "zh-CN",
          priority: "high",
          context: {
            workflowId: "wf-1",
          },
        },
      },
      { eventStore, snapshotStore },
    );

    expect(result.ok).toBe(true);
    expect(result.output.commandList.listId).toBe("cmd-list-1");
    expect(result.output.commandList.candidates.length).toBeGreaterThanOrEqual(3);
    expect(result.output.commandList.selectionBridge.nodeType).toBe("selection");
    expect(result.output.commandList.selectionBridge.decision.options.length).toBe(
      result.output.commandList.candidates.length,
    );
    expect(result.output.commandList.candidates[0].commandTarget.href).toBe(
      "/api/nl-command/commands",
    );
    expect(result.output.commandList.candidates[0].clarificationPreviewTarget.href).toBe(
      "/api/nl-command/clarification-preview",
    );
    expect(eventStore.listByListId("cmd-list-1")).toHaveLength(1);
  });

  it("supports custom candidates and recommended selection bridging", async () => {
    const eventStore = createInMemoryCommandListEventStore();
    const snapshotStore = createInMemoryCommandListSnapshotStore();

    const result = await executeCommandListNode(
      {
        nodeType: "command_list",
        input: {
          listId: "cmd-list-2",
          commandText: "推进用户增长专题",
          userId: "user-2",
          candidates: [
            {
              candidateId: "plan-first",
              label: "先做规划",
              commandText: "先输出规划和里程碑",
              recommended: true,
              source: "manual",
            },
            {
              candidateId: "execute-direct",
              label: "直接执行",
              commandText: "直接拆解任务并执行",
            },
          ],
        },
      },
      { eventStore, snapshotStore },
    );

    expect(result.output.commandList.candidates).toHaveLength(2);
    expect(result.output.selectionBridge.recommendedSubmission?.optionId).toBe("plan-first");
    expect(result.output.commandList.recommendedCandidateId).toBe("plan-first");
  });

  it("records a selected event and returns selection metadata compatible with HITL", async () => {
    const eventStore = createInMemoryCommandListEventStore();
    const snapshotStore = createInMemoryCommandListSnapshotStore();

    await executeCommandListNode(
      {
        nodeType: "command_list",
        input: {
          listId: "cmd-list-3",
          commandText: "准备季度经营分析",
          userId: "user-3",
        },
      },
      { eventStore, snapshotStore },
    );

    const selection = await selectCommandListCandidate(
      {
        listId: "cmd-list-3",
        candidateId: "candidate-execute",
        submittedBy: "operator-1",
        metadata: {
          source: "panel",
        },
      },
      { eventStore, snapshotStore },
    );

    expect(selection.ok).toBe(true);
    expect(selection.selection.optionId).toBe("candidate-execute");
    expect(selection.selection.metadata.nodeType).toBe("command_list");
    expect(selection.selection.metadata.branchKey).toBe("candidate-execute");
    expect(eventStore.listByListId("cmd-list-3")).toHaveLength(2);
    expect(eventStore.listByListId("cmd-list-3").at(-1)).toMatchObject({
      type: "selected",
      submittedBy: "operator-1",
      candidateId: "candidate-execute",
    });
  });
});
