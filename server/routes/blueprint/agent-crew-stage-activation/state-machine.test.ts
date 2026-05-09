import { describe, expect, it } from "vitest";

import { deriveStageRoleStateMap } from "./state-machine.js";

import type { BlueprintGenerationStage } from "../../../../shared/blueprint/index.js";

describe("deriveStageRoleStateMap", () => {
  const primaryRouteStages: BlueprintGenerationStage[] = [
    "input",
    "clarification",
    "spec_tree",
  ];

  it("Rule 1 active: currentStageId ∈ role.activationStages → active", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["input"],
        },
      ],
      primaryRouteStages,
      currentStageId: "input",
    });
    expect(result.get("planner")).toBe("active");
  });

  it("Rule 2 reviewing: 紧邻过去 active, 未来无 active → reviewing", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["input"],
        },
      ],
      primaryRouteStages,
      currentStageId: "clarification",
    });
    expect(result.get("planner")).toBe("reviewing");
  });

  it("Rule 2 → sleeping: 非紧邻过去 active → sleeping", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["input"],
        },
      ],
      primaryRouteStages,
      currentStageId: "spec_tree",
    });
    expect(result.get("planner")).toBe("sleeping");
  });

  it("Rule 3 watching: 未来有 active → watching", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "architect",
          label: "Architect",
          responsibilities: ["design"],
          activationStages: ["spec_tree"],
        },
      ],
      primaryRouteStages,
      currentStageId: "input",
    });
    expect(result.get("architect")).toBe("watching");
  });

  it("Rule 4 sleeping: activationStages 为空 → sleeping", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "idle-role",
          label: "Idle",
          responsibilities: [],
          activationStages: [],
        },
      ],
      primaryRouteStages: ["input", "clarification"],
      currentStageId: "input",
    });
    expect(result.get("idle-role")).toBe("sleeping");
  });

  it("连续 active: Rule 1 先命中, 不走 reviewing", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["input", "clarification"],
        },
      ],
      primaryRouteStages,
      currentStageId: "clarification",
    });
    expect(result.get("planner")).toBe("active");
  });

  it("边界: currentStageId 不在 primaryRouteStages → 所有 role sleeping", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["input"],
        },
        {
          id: "architect",
          label: "Architect",
          responsibilities: ["design"],
          activationStages: ["spec_tree"],
        },
      ],
      primaryRouteStages,
      currentStageId: "engineering_handoff",
    });
    expect(result.get("planner")).toBe("sleeping");
    expect(result.get("architect")).toBe("sleeping");
  });

  it("边界: activationStages 全部无效 → sleeping", () => {
    const result = deriveStageRoleStateMap({
      roles: [
        {
          id: "ghost",
          label: "Ghost",
          responsibilities: [],
          activationStages: ["unknown_stage"],
        },
      ],
      primaryRouteStages,
      currentStageId: "input",
    });
    expect(result.get("ghost")).toBe("sleeping");
  });
});
