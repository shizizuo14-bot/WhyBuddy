import { describe, expect, it } from "vitest";

import { slideRule } from "./slideRule";
import { leaveApprovalRbac, rbacSkill } from "./rbac/rbacSkill";
import { leaveApprovalWorkflow } from "./workflow/workflowSkill";
import { leaveRequestDataModel } from "./datamodel/dataModelSkill";
import type { RbacModel } from "./rbac/rbacModel";
import type {
  DependencyRef,
  ImpactReport,
  KernelRole,
  PolicyDecision,
  PublishGateReport,
  SkillCapabilitySurface,
  SkillDefinition,
  SkillRuntimeRole,
  VersionPin,
} from "./skill";

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

describe("V2 shared contract — kernel vocabulary (113.01)", () => {
  it("a V2 Skill can declare PDP (RBAC as Kernel 1) semantics", () => {
    const pdp: SkillDefinition = {
      id: "rbac",
      title: "RBAC",
      kernelRole: "pdp",
      runtimeRole: "kernel",
      provides: { role: ["employee", "manager"], permission: ["leave:create"] },
      delegatesTo: [] as DependencyRef[],
      bindsTo: [] as DependencyRef[],
    };
    expect(pdp.kernelRole).toBe("pdp" as KernelRole);
    expect(pdp.runtimeRole).toBe("kernel" as SkillRuntimeRole);
  });

  it("a V2 Skill can declare SSOT (DataModel as Kernel 2) semantics", () => {
    const ssot: SkillDefinition = {
      id: "datamodel",
      title: "DataModel",
      kernelRole: "ssot",
      runtimeRole: "kernel",
      provides: { entity: ["leave_request"], field: ["leave_request.title"] },
    };
    expect(ssot.kernelRole).toBe("ssot");
  });

  it("a V2 Skill can declare PEP (Workflow/Page) semantics that delegate and bind", () => {
    const pep: SkillDefinition = {
      id: "workflow",
      title: "Workflow",
      kernelRole: "pep",
      runtimeRole: "pep",
      delegatesTo: [{ skill: "rbac", kind: "role" } as DependencyRef],
      bindsTo: [{ skill: "datamodel", kind: "entity" } as DependencyRef],
    };
    expect(pep.kernelRole).toBe("pep");
    expect(pep.delegatesTo!.length).toBe(1);
  });

  it("a V2 Skill can declare assembly-root (AppBundle Kernel 6) with version pins", () => {
    const asm: SkillDefinition = {
      id: "appbundle",
      title: "AppBundle",
      kernelRole: "assembly-root",
      runtimeRole: "assembly",
      provides: { app: ["leave_app"] },
      versionPin: { skill: "rbac", version: "113.0" } as VersionPin,
      capability: { versionPins: [] } as SkillCapabilitySurface,
    };
    expect(asm.kernelRole).toBe("assembly-root");
  });

  it("typed surfaces: PolicyDecision, PublishGateReport, ImpactReport are usable", () => {
    const decision: PolicyDecision = { effect: "deny", reasonCode: "RBAC_NO_MATCH" };
    const gateReport: PublishGateReport = { publishable: false, blockers: [] };
    const impact: ImpactReport = { target: { skill: "rbac", kind: "role", value: "x" }, safe: true, impacted: [] };
    expect(decision.effect).toBe("deny");
    expect(gateReport.publishable).toBe(false);
    expect(impact.safe).toBe(true);
  });

  it("existing validate/project/resolve/generate still work after adding V2 types", () => {
    const report = rbacSkill.validate(leaveApprovalRbac);
    expect(typeof report.ok).toBe("boolean");
    const proj = rbacSkill.project(leaveApprovalRbac);
    expect(Array.isArray(proj.nodes)).toBe(true);
    const surf = rbacSkill.resolve(leaveApprovalRbac);
    expect(surf).toBeTruthy();
    // generate may be present
    if (rbacSkill.generate) {
      // do not actually await in pure test unless needed; just confirm callable shape
      expect(typeof rbacSkill.generate).toBe("function");
    }
  });
});
