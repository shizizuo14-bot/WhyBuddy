/**
 * Dev-only fixture: a rich, reference-matching structured BrainstormReasoningGraph.
 *
 * Used by the C renderer-fidelity harness to prove the wall renderer ceiling
 * against the target mind-map image (central question left, multi-branch middle
 * with semantic edge labels, typed colored cards, telemetry, console). This is
 * NOT shipped runtime data — it only drives the dev harness screenshot.
 */

import type { BrainstormReasoningGraph } from "@shared/blueprint";

export const REASONING_GRAPH_FIXTURE: BrainstormReasoningGraph = {
  id: "graph-fixture-1",
  jobId: "blueprint-job-fixture",
  stage: "spec_tree",
  source: "llm",
  centralQuestion: {
    id: "q-central",
    title: "2026 年中国各地养犬不幸咬伤事件的法律责任与处罚标准是什么",
    body: "用户描述：邻居家狗在草坪扑咬，管理松弛，三次报警未果。需要梳理责任、处罚与累计认定。",
  },
  telemetry: {
    tokenBurn: 189116,
    sourceCount: 371,
    remainingBudget: 1057,
    elapsedMs: 5700,
    activeRoleCount: 4,
  },
  consoleLines: [
    { id: "c1", kind: "Ask", text: "2026 年是否有全国统一的养犬违规累计处罚记分制度？" },
    { id: "c2", kind: "Thinking", text: "比对各地养犬管理条例，第三次违规处罚口径不一致。" },
    { id: "c3", kind: "Observation", text: "多数地区执行属地裁量，未见全国统一记分。" },
    { id: "c4", kind: "Report", text: "已整理责任链：饲养人 → 管理人 → 行政处罚累计，存在地区差异。" },
  ],
  nodes: [
    {
      id: "q-central",
      type: "question",
      title: "2026 年中国各地养犬不幸咬伤事件的法律责任与处罚标准是什么",
      body: "邻居家狗在草坪扑咬，管理松弛，三次报警未果。梳理责任、处罚与累计认定。",
      status: "open",
      roleId: "clarifier",
      roleLabel: "澄清者",
      order: 0,
    },
    {
      id: "n-setup-1",
      type: "clarification",
      title: "公安机关是否有权没收违反双养犬人的狗证或直接收缴宠物犬",
      status: "open",
      roleId: "clarifier",
      roleLabel: "澄清者",
      order: 1,
    },
    {
      id: "n-mid-1",
      type: "hypothesis",
      title: "公安机关依据多条款可对违规屡犯不清理责任的养犬人直接收缴犬只",
      status: "active",
      roleId: "planner",
      roleLabel: "规划师",
      order: 2,
    },
    {
      id: "n-mid-2",
      type: "evidence",
      title: "2026 新修订《治安管理处罚法》是否明确规定屡屡不幸伤及未清理宠物责任的三次累计处罚流程",
      status: "supported",
      roleId: "researcher",
      roleLabel: "接地者",
      order: 3,
    },
    {
      id: "n-mid-3",
      type: "evidence",
      title: "养犬管理条例中第二次/第三次罚款及第三次报警处理是否有明确法律条文支持",
      status: "supported",
      roleId: "researcher",
      roleLabel: "接地者",
      order: 4,
    },
    {
      id: "n-res-1",
      type: "decision",
      title: "2026 各地养犬管理条例是否允许对三次违规清理责任者直接没收犬只",
      status: "resolved",
      roleId: "architect",
      roleLabel: "架构师",
      order: 5,
    },
    {
      id: "n-res-2",
      type: "decision",
      title: "2026 是否有城市发布针对不文明养犬行为的阶梯式惩戒试点方案",
      status: "resolved",
      roleId: "architect",
      roleLabel: "架构师",
      order: 6,
    },
    {
      id: "n-res-3",
      type: "synthesis",
      title: "2026 各地养犬管理条例中三次违规是按一年内累计还是终身累计",
      status: "resolved",
      roleId: "synthesizer",
      roleLabel: "综合器",
      order: 7,
    },
    {
      id: "n-gap-1",
      type: "gap",
      title: "2026 年是否有全国统一的养犬违规累计处罚记分制度",
      status: "challenged",
      roleId: "critic",
      roleLabel: "挑刺者",
      order: 8,
    },
  ],
  edges: [
    { id: "e1", source: "q-central", target: "n-setup-1", type: "questions", label: "安全" },
    { id: "e2", source: "n-setup-1", target: "n-mid-1", type: "refines", label: "执法权" },
    { id: "e3", source: "q-central", target: "n-mid-2", type: "cites", label: "法律条款" },
    { id: "e4", source: "q-central", target: "n-mid-3", type: "cites", label: "法律依据" },
    { id: "e5", source: "n-mid-2", target: "n-res-1", type: "supports", label: "法律条文" },
    { id: "e6", source: "n-mid-1", target: "n-res-2", type: "supports", label: "处罚阶梯" },
    { id: "e7", source: "n-mid-3", target: "n-res-3", type: "synthesizes", label: "累计认定" },
    { id: "e8", source: "n-res-3", target: "n-gap-1", type: "conflicts", label: "地方差异" },
    { id: "e9", source: "n-mid-2", target: "n-gap-1", type: "questions", label: "全国统一?" },
  ],
};
