import { describe, expect, it } from "vitest";

import { dataModelSkill, leaveRequestDataModel, purchaseApprovalDataModel } from "../datamodel/dataModelSkill";
import { leaveApprovalRbac, purchaseApprovalRbac, rbacSkill } from "../rbac/rbacSkill";
import { leaveApprovalPage, pageSkill, purchaseApprovalPage } from "./pageSkill";
import type { BindingSchema, PageModel, PermissionRender } from "./pageModel";

const clone = (m: PageModel): PageModel => structuredClone(m);

const fullSurface = {
  datamodel: dataModelSkill.resolve(leaveRequestDataModel),
  rbac: rbacSkill.resolve(leaveApprovalRbac),
};

describe("pageSkill - the gate", () => {
  it("passes the coherent leave approval page when DataModel and RBAC surfaces are supplied", () => {
    const report = pageSkill.validate(leaveApprovalPage, { external: fullSurface });

    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it("warns instead of failing when external DataModel/RBAC surfaces are not supplied yet", () => {
    const report = pageSkill.validate(leaveApprovalPage);

    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings.some(w => w.code === "PAGE_ENTITY_UNRESOLVED")).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_FIELD_UNRESOLVED")).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_ROLE_UNRESOLVED")).toBe(true);
  });

  it("catches a component bound to a field that DataModel never defined", () => {
    const broken = clone(leaveApprovalPage);
    broken.components.find(c => c.id === "days")!.field = "leave_request.ghost";

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_REF_MISSING_FIELD")).toBe(true);
  });

  it("catches a component visible to a role RBAC never defined", () => {
    const broken = clone(leaveApprovalPage);
    broken.components.find(c => c.id === "approve")!.visibleToRoles = ["director"];

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_REF_MISSING_ROLE")).toBe(true);
  });

  it("catches linkage rules whose source or target component is missing", () => {
    const broken = clone(leaveApprovalPage);
    broken.linkageRules.push(
      { id: "lk_missing_source", source: { component: "ghost", event: "onChange" }, target: { component: "days", action: "setVisible" } },
      { id: "lk_missing_target", source: { component: "leaveType", event: "onChange" }, target: { component: "ghost", action: "setValue" } },
    );

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_MISSING_SOURCE")).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_MISSING_TARGET")).toBe(true);
  });

  it("catches incompatible linkage semantics", () => {
    const broken = clone(leaveApprovalPage);
    broken.linkageRules.push({
      id: "lk_bad_options",
      source: { component: "days", event: "onClick" },
      target: { component: "reason", action: "setOptions" },
    });

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_ACTION_INCOMPATIBLE")).toBe(true);
  });

  it("catches linkage rules with invalid source event name (not onChange/onClick/onLoad)", () => {
    const broken = clone(leaveApprovalPage);
    broken.linkageRules.push({
      id: "lk_bad_event",
      source: { component: "leaveType", event: "onFoo" as any },
      target: { component: "days", action: "setVisible" },
    });

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_INVALID_EVENT")).toBe(true);
    expect(report.errors.some(e => e.path.includes("source.event") && /invalid source event/.test(e.message))).toBe(true);
  });
});

describe("pageSkill - surface, projector, and cross-skill refs", () => {
  it("exposes page and component ids for other skills to reference", () => {
    const surface = pageSkill.resolve(leaveApprovalPage);

    expect(surface.page).toEqual(["page_leave_request"]);
    expect(surface.component).toContain("approve");
    expect(surface.entity).toContain("leave_request");
    expect(surface.field).toContain("leave_request.approved");
  });

  it("derives a page diagram with component nodes and linkage edges", () => {
    const projection = pageSkill.project(leaveApprovalPage);

    expect(projection.mermaid.startsWith("flowchart LR")).toBe(true);
    expect(projection.nodes.some(n => n.id === "cmp_approve" && n.kind === "button")).toBe(true);
    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "cmp_reason" && e.kind === "linkage")).toBe(true);
  });

  it("declares DataModel field refs and RBAC role refs for the combined diagram", () => {
    const refs = pageSkill.crossRefs(leaveApprovalPage);

    expect(refs.some(r => r.fromNode === "page_page_leave_request" && r.toSkill === "datamodel" && r.toKind === "entity" && r.toValue === "leave_request")).toBe(true);
    expect(refs.some(r => r.fromNode === "cmp_approve" && r.toSkill === "datamodel" && r.toKind === "field" && r.toValue === "leave_request.approved")).toBe(true);
    expect(refs.some(r => r.fromNode === "cmp_approve" && r.toSkill === "rbac" && r.toKind === "role" && r.toValue === "manager")).toBe(true);
  });
});

describe("pageSkill — V2 PEP model (BindingSchema, PermissionRender, componentVersion, traceSpan)", () => {
  it("sample page remains readable and can express bindings, permission rendering, and linkage rules", () => {
    const page = clone(leaveApprovalPage);

    // Prove sample expresses the new PEP constructs
    expect(page.traceSpan).toBe("page.leave.request.v2");
    expect(page.componentVersion).toBe("1.0.0");
    // bindings expressed where field refs exist (not all buttons have data fields)
    const withField = page.components.filter(c => c.field);
    expect(withField.length).toBeGreaterThan(0);
    expect(withField.every(c => !!c.bindingSchema)).toBe(true);
    expect(page.components.every(c => !!c.permissionRender && c.permissionRender.roleRefs.length > 0)).toBe(true);
    expect(page.components.some(c => c.componentVersion)).toBe(true);

    // Linkage rules (local Page-owned execution graph, not global truth) preserved
    expect(page.linkageRules.length).toBeGreaterThan(0);
    expect(page.linkageRules.some(r => r.id === "lk_type_days")).toBe(true);

    // Existing visibleToRoles kept for BC; new PDP refs co-exist
    expect(page.components.find(c => c.id === "approve")!.visibleToRoles).toContain("manager");
    expect(page.components.find(c => c.id === "approve")!.permissionRender!.roleRefs).toContain("manager");

    // Binding expresses DataModel SSOT ref
    const approveBinding = page.components.find(c => c.id === "approve")!.bindingSchema!;
    expect(approveBinding.entity).toBe("leave_request");
    expect(approveBinding.field).toBe("leave_request.approved");

    // PermissionRender expresses RBAC PDP delegation (not local only auth)
    const approvePerm = page.components.find(c => c.id === "approve")!.permissionRender!;
    expect(approvePerm.roleRefs).toContain("manager");

    const report = pageSkill.validate(page, { external: fullSurface });
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("PEP metadata and schemas can be set without breaking validate or linkage when surfaces supplied", () => {
    const pepPage = clone(leaveApprovalPage);
    pepPage.traceSpan = "page.leave.trace";
    pepPage.componentVersion = "2.1.0";
    const days = pepPage.components.find(c => c.id === "days")!;
    days.bindingSchema = { entity: "leave_request", field: "leave_request.days" } as BindingSchema;
    days.permissionRender = { roleRefs: ["employee", "manager"] } as PermissionRender;
    days.componentVersion = "2.1.0";

    const report = pageSkill.validate(pepPage, { external: fullSurface });
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(pepPage.traceSpan).toBe("page.leave.trace");
    expect(days.bindingSchema!.field).toBe("leave_request.days");
    expect(days.permissionRender!.roleRefs).toContain("manager");
    expect(days.componentVersion).toBe("2.1.0");
  });

  it("catches in test construction that linkage still enforces after PEP fields added", () => {
    const broken = clone(leaveApprovalPage);
    broken.components.find(c => c.id === "approve")!.bindingSchema = { entity: "leave_request", field: "leave_request.approved" } as BindingSchema;
    broken.components.find(c => c.id === "approve")!.permissionRender = { roleRefs: ["manager"] } as PermissionRender;
    broken.linkageRules.push(
      { id: "lk_pep_test", source: { component: "approve", event: "onClick" }, target: { component: "reason", action: "setDisabled" } },
    );

    const report = pageSkill.validate(broken, { external: fullSurface });
    expect(report.ok).toBe(true); // this one is compatible
  });
});

describe("pageSkill - V2 PEP gate and projection", () => {
  it("rejects a BindingSchema that points at a missing DataModel SSOT field", () => {
    const broken = clone(leaveApprovalPage);
    const days = broken.components.find(c => c.id === "days")!;
    days.bindingSchema = { entity: "leave_request", field: "leave_request.ghost" };

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_BINDING_FIELD_MISSING")).toBe(true);
  });

  it("rejects BindingSchema with entity/field prefix mismatch (field not belonging to declared entity) or binding entity not matching page entity", () => {
    // Use surface containing multiple entities (employee + leave_request) to prove cross-entity would have passed before
    const broken1 = clone(leaveApprovalPage);
    const days = broken1.components.find(c => c.id === "days")!;
    // prefix mismatch: declared entity present, field present, but field belongs to different entity
    days.bindingSchema = { entity: "leave_request", field: "employee.name" };

    const report1 = pageSkill.validate(broken1, { external: fullSurface });
    expect(report1.ok).toBe(false);
    expect(report1.errors.some(e => e.code === "PAGE_BINDING_FIELD_ENTITY_MISMATCH")).toBe(true);

    // entity present + prefix ok for that entity, but binding entity does not match page.entity
    const broken2 = clone(leaveApprovalPage);
    const approve = broken2.components.find(c => c.id === "approve")!;
    approve.bindingSchema = { entity: "employee", field: "employee.name" };

    const report2 = pageSkill.validate(broken2, { external: fullSurface });
    expect(report2.ok).toBe(false);
    expect(report2.errors.some(e => e.code === "PAGE_BINDING_ENTITY_MISMATCH")).toBe(true);
  });

  it("rejects PermissionRender refs that RBAC PDP cannot resolve", () => {
    const broken = clone(leaveApprovalPage);
    const approve = broken.components.find(c => c.id === "approve")!;
    approve.permissionRender = {
      roleRefs: ["director"],
      permissionRefs: ["leave:delete"],
    };

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.filter(e => e.code === "PAGE_PERMISSION_REF_MISSING")).toHaveLength(2);
  });

  it("rejects local-only role visibility in V2 mode instead of bypassing PDP delegation", () => {
    const broken = clone(leaveApprovalPage);
    const approve = broken.components.find(c => c.id === "approve")!;
    delete approve.permissionRender;

    const report = pageSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_PEP_BYPASS")).toBe(true);
  });

  it("projects Page as a PEP canvas with BindingSchema, PermissionRender, and local linkage edges", () => {
    const projection = pageSkill.project(leaveApprovalPage);

    expect(projection.nodes.some(n => n.id === "cmp_approve" && n.kind === "button")).toBe(true);
    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "dm_leave_request_approved" && e.kind === "binding")).toBe(true);
    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "role_manager" && e.kind === "permission")).toBe(true);
    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "perm_leave_approve" && e.kind === "permission")).toBe(true);
    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "cmp_reason" && e.kind === "linkage")).toBe(true);
  });

  it("projects visibility edges for component visibleTo roles", () => {
    const projection = pageSkill.project(leaveApprovalPage);

    expect(projection.edges.some(e => e.from === "cmp_approve" && e.to === "role_manager" && e.kind === "visibility")).toBe(true);
  });
});

describe("pageSkill - field-level visibility gate (pdpVisibleTo policy on bound fields)", () => {
  const purchaseSurface = {
    datamodel: dataModelSkill.resolve(purchaseApprovalDataModel),
    rbac: rbacSkill.resolve(purchaseApprovalRbac),
  };

  it("accepts component visibility that is a subset of the field's pdpVisibleTo (positive)", () => {
    // amount in purchase dm has pdpVisibleTo: ["finance", "admin"]; use finance (present in rbac)
    const good = clone(purchaseApprovalPage);
    const amt = good.components.find(c => c.id === "amount")!;
    amt.visibleToRoles = ["finance"];
    amt.permissionRender = { roleRefs: ["finance"] };

    const report = pageSkill.validate(good, { external: purchaseSurface });

    expect(report.ok).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_FIELD_VISIBILITY_VIOLATION")).toBe(false);
  });

  it("rejects component visibility exposing bound field to role outside its pdpVisibleTo (negative, amount to requester)", () => {
    const bad = clone(purchaseApprovalPage);
    const amt = bad.components.find(c => c.id === "amount")!;
    // requester is in rbac but NOT in field's pdpVisibleTo ["finance", "admin"]
    amt.visibleToRoles = ["requester", "finance"];
    amt.permissionRender = { roleRefs: ["requester", "finance"] };

    const report = pageSkill.validate(bad, { external: purchaseSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_FIELD_VISIBILITY_VIOLATION" && /requester/.test(e.message))).toBe(true);
  });
});

describe("pageSkill — DataModel field lifecycle (deprecated/removed) via external SSOT", () => {
  const cloneDM = (m: any) => structuredClone(m);

  it("warns (ok=true) when Page binds via field or bindingSchema to a deprecated DataModel SSOT field", () => {
    const depDM = cloneDM(leaveRequestDataModel);
    depDM.entities.find((e: any) => e.id === "leave_request")!.fields.find((f: any) => f.key === "days")!.lifecycle = "deprecated";
    const surf = { datamodel: dataModelSkill.resolve(depDM) };
    const p = clone(leaveApprovalPage);
    // bind component field + bindingSchema to the deprecated field
    const days = p.components.find(c => c.id === "days")!;
    days.field = "leave_request.days";
    days.bindingSchema = { entity: "leave_request", field: "leave_request.days" };

    const report = pageSkill.validate(p, { external: surf });

    expect(report.ok).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_FIELD_DEPRECATED" && w.message.includes("leave_request.days"))).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_BINDING_FIELD_DEPRECATED" && w.message.includes("leave_request.days"))).toBe(true);
    // no removed errors
    expect(report.errors.some(e => e.code === "PAGE_FIELD_REMOVED" || e.code === "PAGE_BINDING_FIELD_REMOVED")).toBe(false);
  });

  it("errors (ok=false) when Page binds via field or bindingSchema to a removed DataModel SSOT field", () => {
    const remDM = cloneDM(leaveRequestDataModel);
    remDM.entities.find((e: any) => e.id === "leave_request")!.fields.find((f: any) => f.key === "approved")!.lifecycle = "removed";
    const surf = { datamodel: dataModelSkill.resolve(remDM) };
    const p = clone(leaveApprovalPage);
    const approve = p.components.find(c => c.id === "approve")!;
    approve.field = "leave_request.approved";
    approve.bindingSchema = { entity: "leave_request", field: "leave_request.approved" };

    const report = pageSkill.validate(p, { external: surf });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_FIELD_REMOVED" && e.message.includes("leave_request.approved"))).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_BINDING_FIELD_REMOVED" && e.message.includes("leave_request.approved"))).toBe(true);
  });

  it("accepts active fields without deprecated/removed lifecycle warnings or errors (compat)", () => {
    const surf = fullSurface;
    const report = pageSkill.validate(leaveApprovalPage, { external: surf });
    expect(report.ok).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_FIELD_DEPRECATED" || w.code === "PAGE_BINDING_FIELD_DEPRECATED")).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_FIELD_REMOVED" || e.code === "PAGE_BINDING_FIELD_REMOVED")).toBe(false);
  });
});

describe("pageSkill - page event schema and action payload gate (V2)", () => {
  it("accepts valid action payloadRef that matches emitted from source event (positive)", () => {
    const good = clone(leaveApprovalPage);
    // onChange emits "value" per schema; use payloadRef to bind the emitted value to setValue action
    good.linkageRules.push({
      id: "lk_event_payload_value",
      source: { component: "leaveType", event: "onChange" },
      target: { component: "reason", action: "setValue", payloadRef: "value" },
    });

    const report = pageSkill.validate(good, { external: fullSurface });

    expect(report.ok).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_PAYLOAD_REF_INVALID")).toBe(false);
  });

  it("rejects action payloadRef that is neither emitted by the event nor a page binding field (negative)", () => {
    const bad = clone(leaveApprovalPage);
    // onClick emits [] per schema; "ghostPayload" is not valid emitted nor a bound field
    bad.linkageRules.push({
      id: "lk_bad_payload_ref",
      source: { component: "submit", event: "onClick" },
      target: { component: "reason", action: "setValue", payloadRef: "ghostPayload" },
    });

    const report = pageSkill.validate(bad, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_PAYLOAD_REF_INVALID" && /ghostPayload/.test(e.message))).toBe(true);
  });

  it("accepts payloadRef that resolves to a page binding field (positive binding case)", () => {
    const good = clone(leaveApprovalPage);
    // payloadRef references a known bound field (treated as value source from context)
    good.linkageRules.push({
      id: "lk_payload_from_binding",
      source: { component: "leaveType", event: "onChange" },
      target: { component: "days", action: "setValue", payloadRef: "leave_request.days" },
    });

    const report = pageSkill.validate(good, { external: fullSurface });

    expect(report.ok).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_LINKAGE_PAYLOAD_REF_INVALID")).toBe(false);
  });
});

describe("pageSkill - page resource reference gate (V2 115.40: assets/routes/workflowLaunch/appMenu)", () => {
  it("accepts valid workflow launch ref against provided Workflow resolve surface (positive)", () => {
    const good = clone(leaveApprovalPage);
    good.workflowLaunchRefs = ["wf_leave_approval"];
    const surf = {
      ...fullSurface,
      workflow: { workflow: ["wf_leave_approval", "wf_purchase"] },
    };
    const report = pageSkill.validate(good, { external: surf });

    expect(report.ok).toBe(true);
    expect(report.errors.some(e => e.code === "PAGE_REF_MISSING_WORKFLOW_LAUNCH")).toBe(false);
    expect(report.warnings.some(w => w.code === "PAGE_WORKFLOW_LAUNCH_REF_UNRESOLVED")).toBe(false);
    // also exercises cross-ref and resourceRef field
    good.components[0].resourceRef = "asset:logo";
    expect(good.workflowLaunchRefs).toContain("wf_leave_approval");
  });

  it("warns (ok=true) for workflow/resource ref when no external workflow surface supplied (unresolved)", () => {
    const p = clone(leaveApprovalPage);
    p.workflowLaunchRefs = ["wf_x"];
    p.assetRefs = ["img/icon.png"];
    p.routeRefs = ["/app/home"];
    p.appMenuRefs = ["nav:reports"];

    const report = pageSkill.validate(p); // no external at all

    expect(report.ok).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_WORKFLOW_LAUNCH_REF_UNRESOLVED")).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_ASSET_REF_UNRESOLVED")).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_ROUTE_REF_UNRESOLVED")).toBe(true);
    expect(report.warnings.some(w => w.code === "PAGE_APP_MENU_REF_UNRESOLVED")).toBe(true);
  });

  it("errors on missing workflow launch ref when surface provided but ref absent (negative)", () => {
    const bad = clone(leaveApprovalPage);
    bad.workflowLaunchRefs = ["wf_ghost_launch"];
    const surf = {
      ...fullSurface,
      workflow: { workflow: ["wf_leave_approval"] },
    };

    const report = pageSkill.validate(bad, { external: surf });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "PAGE_REF_MISSING_WORKFLOW_LAUNCH" && /wf_ghost_launch/.test(e.message))).toBe(true);
  });

  it("crossRefs declares workflow/route etc and project emits launch/route edges (diagram advance)", () => {
    const p = clone(leaveApprovalPage);
    p.workflowLaunchRefs = ["wf_leave_approval"];
    p.routeRefs = ["r-home"];

    const xrefs = pageSkill.crossRefs(p);
    expect(xrefs.some(r => r.toSkill === "workflow" && r.toKind === "workflow" && r.toValue === "wf_leave_approval")).toBe(true);
    expect(xrefs.some(r => r.toSkill === "route" && r.toValue === "r-home")).toBe(true);

    const proj = pageSkill.project(p);
    expect(proj.edges.some(e => e.kind === "launch" && String(e.to).includes("wf_leave_approval"))).toBe(true);
    expect(proj.edges.some(e => e.kind === "route")).toBe(true);
  });
});

describe("pageSkill - page version snapshot for AppBundle immutable pins (V2 115.40)", () => {
  it("represents page version ids, published state, and snapshot refs; resolve exposes for pinning (positive, purchase approval)", () => {
    const p = purchaseApprovalPage;
    expect(p.pageVersion).toBe("1.0.0");
    expect(p.published).toBe(true);
    expect(p.snapshotRefs).toContain("page:page_purchase_request@1.0.0");

    const surface = pageSkill.resolve(purchaseApprovalPage);
    expect(surface.page).toContain("page_purchase_request");
    expect((surface as any).pageVersion).toBe("1.0.0");
    expect((surface as any).published).toBe(true);
    expect((surface as any).snapshotRefs).toContain("page:page_purchase_request@1.0.0");
  });

  it("does not expose snapshot for missing/unpublished page version (negative)", () => {
    const bad = clone(leaveApprovalPage);
    bad.pageVersion = undefined;
    bad.published = false;
    bad.snapshotRefs = undefined;

    const surface = pageSkill.resolve(bad);
    expect((surface as any).pageVersion).toBeUndefined();
    expect((surface as any).published).toBe(false);
    expect((surface as any).snapshotRefs).toBeUndefined();
    // basic page id still there for compat
    expect(surface.page).toContain("page_leave_request");
  });
});
