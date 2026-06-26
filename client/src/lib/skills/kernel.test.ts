import { describe, expect, it } from "vitest";

import { slideRule } from "./slideRule";
import { leaveApprovalRbac, rbacSkill } from "./rbac/rbacSkill";
import { leaveApprovalWorkflow } from "./workflow/workflowSkill";
import { leaveRequestDataModel } from "./datamodel/dataModelSkill";
import type { RbacModel } from "./rbac/rbacModel";

const models = {
  datamodel: leaveRequestDataModel,
  rbac: leaveApprovalRbac,
  workflow: leaveApprovalWorkflow,
};

describe("kernel ① — Separation of Duties design gate", () => {
  it("CATCHES a role that holds two mutually-exclusive duties (自发起+自审批)", () => {
    const withSod: RbacModel = {
      ...leaveApprovalRbac,
      sodConstraints: [{ name: "请假不可自发起又自审批", mutuallyExclusive: ["leave:create", "leave:approve"] }],
    };
    const report = rbacSkill.validate(withSod);
    // manager holds BOTH leave:create and leave:approve → violation
    expect(report.ok).toBe(false);
    const hit = report.errors.find(e => e.code === "RBAC_SOD_VIOLATION");
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain("主管");
  });

  it("passes when no SoD constraints are declared (opt-in)", () => {
    expect(rbacSkill.validate(leaveApprovalRbac).ok).toBe(true);
  });
});

describe("kernel ⑥ — publish gate (cross-system closure)", () => {
  it("an internally-consistent app is publishable", () => {
    const gate = slideRule.publishGate(models);
    expect(gate.publishable).toBe(true);
    expect(gate.blockers).toHaveLength(0);
  });

  it("BLOCKS publish when a cross-system reference does not resolve", () => {
    const badWorkflow = structuredClone(leaveApprovalWorkflow);
    badWorkflow.nodes.find(n => n.id === "a_mgr")!.assigneeRole = "director"; // not in rbac
    const gate = slideRule.publishGate({ ...models, workflow: badWorkflow });
    expect(gate.publishable).toBe(false);
    // both the skill gate (WF_ASSIGNEE_MISSING_ROLE) and the closure check fire
    expect(gate.blockers.some(b => b.code === "PUBLISH_DANGLING_CROSSREF")).toBe(true);
  });

  it("BLOCKS publish when DataModel is missing (rbac data rule dangles)", () => {
    const gate = slideRule.publishGate({ rbac: leaveApprovalRbac, workflow: leaveApprovalWorkflow });
    // no datamodel registered in this set → rbac dataRule -> datamodel entity cannot resolve
    expect(gate.publishable).toBe(false);
    expect(gate.blockers.some(b => b.code === "PUBLISH_DANGLING_CROSSREF")).toBe(true);
  });
});
