import {
  finalizeReport,
  type CrossRefEdge,
  type CrossSkill,
  type Finding,
  type Projection,
  type ResolvableSurface,
  type Skill,
  type ValidateContext,
} from "../skill";
import {
  ALLOWED_TRIGGER_EVENTS,
  PAGE_EVENT_SCHEMAS,
  type LinkageAction,
  type PageComponent,
  type PageModel,
  type TriggerEvent,
} from "./pageModel";
import { getFieldLifecycle } from "../datamodel/dataModelSkill";

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
}

function componentNodeId(componentId: string): string {
  return `cmp_${sanitizeId(componentId)}`;
}

function pageNodeId(pageId: string): string {
  return `page_${sanitizeId(pageId)}`;
}

function dataModelFieldNodeId(fieldRef: string): string {
  const [entity, field] = fieldRef.split(".");
  return entity && field ? `dm_${sanitizeId(entity)}_${sanitizeId(field)}` : `dm_${sanitizeId(fieldRef)}`;
}

function rbacRoleNodeId(roleRef: string): string {
  return `role_${sanitizeId(roleRef)}`;
}

function rbacPermissionNodeId(permissionRef: string): string {
  return `perm_${sanitizeId(permissionRef)}`;
}

function componentById(model: PageModel): Map<string, PageComponent> {
  return new Map(model.components.map(c => [c.id, c]));
}

function isLinkageCompatible(
  source: PageComponent | undefined,
  event: TriggerEvent,
  target: PageComponent | undefined,
  action: LinkageAction,
): boolean {
  if (!source || !target) return true;
  if (event === "onClick" && source.type !== "button") return false;
  if (action === "setOptions" && target.type !== "select") return false;
  return true;
}

/** Validate optional action payloadRef against the source event's emitted schema OR page-level binding fields. */
function isValidActionPayloadRef(event: TriggerEvent, payloadRef: string | undefined, model: PageModel): boolean {
  if (payloadRef === undefined) return true;
  if (typeof payloadRef !== "string" || payloadRef.length === 0) return false;
  const schema = PAGE_EVENT_SCHEMAS[event];
  if (schema && schema.emitted.includes(payloadRef)) return true;
  // Also resolve against page bindings (known fields)
  const boundFields = new Set<string>();
  for (const c of model.components) {
    const f = c.bindingSchema?.field ?? c.field;
    if (f) boundFields.add(f);
  }
  return boundFields.has(payloadRef);
}

/** Pure validation helper for page resource refs (assets/routes/workflowLaunch/appMenu) against provided external surfaces. */
function checkResourceListRefs(
  refs: string[] | undefined,
  available: string[] | undefined,
  unresolvedCode: string,
  missingCode: string,
  pathBase: string,
  kindLabel: string,
  findings: Finding[],
  pageName: string,
): void {
  if (!refs || refs.length === 0) return;
  refs.forEach((ref, i) => {
    if (available === undefined) {
      findings.push({
        code: unresolvedCode,
        severity: "warning",
        path: `${pathBase}[${i}]`,
        message: `Page "${pageName}" references ${kindLabel} "${ref}", but no ${kindLabel} surface was provided.`,
      });
    } else if (!available.includes(ref)) {
      findings.push({
        code: missingCode,
        severity: "error",
        path: `${pathBase}[${i}]`,
        message: `Page "${pageName}" references missing ${kindLabel}: ${ref}`,
      });
    }
  });
}

function getFieldPdpVisibleTo(surface: any, ref: string): string[] | undefined {
  const fields = (surface as any)?.fields;
  if (!Array.isArray(fields)) return undefined;
  const f = fields.find((ff: any) => ff && ff.ref === ref);
  const v = f ? (f.pdpVisibleTo as string[] | undefined) : undefined;
  return Array.isArray(v) ? v : undefined;
}

export const pageSkill: Skill<PageModel> & CrossSkill<PageModel> = {
  id: "page",
  title: "页面设计器",

  crossRefs(model: PageModel): CrossRefEdge[] {
    const refs: CrossRefEdge[] = [
      {
        fromNode: pageNodeId(model.id),
        toSkill: "datamodel",
        toKind: "entity",
        toValue: model.entity,
        label: "数据实体",
      },
    ];

    model.components.forEach(component => {
      if (component.field) {
        refs.push({
          fromNode: componentNodeId(component.id),
          toSkill: "datamodel",
          toKind: "field",
          toValue: component.field,
          label: "字段",
        });
      }
      if (component.bindingSchema && component.bindingSchema.field !== component.field) {
        refs.push({
          fromNode: componentNodeId(component.id),
          toSkill: "datamodel",
          toKind: "field",
          toValue: component.bindingSchema.field,
          label: "BindingSchema",
        });
      }
      component.visibleToRoles?.forEach(role => {
        refs.push({
          fromNode: componentNodeId(component.id),
          toSkill: "rbac",
          toKind: "role",
          toValue: role,
          label: "可见角色",
        });
      });
      component.permissionRender?.roleRefs
        .filter(role => !component.visibleToRoles?.includes(role))
        .forEach(role => {
          refs.push({
            fromNode: componentNodeId(component.id),
            toSkill: "rbac",
            toKind: "role",
            toValue: role,
            label: "PDP role",
          });
        });
      component.permissionRender?.permissionRefs?.forEach(permission => {
        refs.push({
          fromNode: componentNodeId(component.id),
          toSkill: "rbac",
          toKind: "permission",
          toValue: permission,
          label: "PDP permission",
        });
      });
    });

    // Cross-skill refs for page resource refs (workflow/asset/route/appMenu) to advance V2 diagram connect
    (model.workflowLaunchRefs ?? []).forEach(wf => {
      refs.push({
        fromNode: pageNodeId(model.id),
        toSkill: "workflow",
        toKind: "workflow",
        toValue: wf,
        label: "workflow launch",
      });
    });
    (model.assetRefs ?? []).forEach(a => {
      refs.push({
        fromNode: pageNodeId(model.id),
        toSkill: "asset",
        toKind: "asset",
        toValue: a,
        label: "asset",
      });
    });
    (model.routeRefs ?? []).forEach(r => {
      refs.push({
        fromNode: pageNodeId(model.id),
        toSkill: "route",
        toKind: "route",
        toValue: r,
        label: "route",
      });
    });
    (model.appMenuRefs ?? []).forEach(m => {
      refs.push({
        fromNode: pageNodeId(model.id),
        toSkill: "appMenu",
        toKind: "menu",
        toValue: m,
        label: "app menu",
      });
    });

    return refs;
  },

  refNodeId(kind: string, value: string): string | null {
    if (kind === "page") return pageNodeId(value);
    if (kind === "component") return componentNodeId(value);
    return null;
  },

  validate(model: PageModel, ctx?: ValidateContext): ReturnType<Skill<PageModel>["validate"]> {
    const f: Finding[] = [];
    const byComponent = componentById(model);
    const datamodelEntities = ctx?.external?.datamodel?.entity;
    const datamodelFields = ctx?.external?.datamodel?.field;
    const rbacRoles = ctx?.external?.rbac?.role;
    const rbacPermissions = ctx?.external?.rbac?.permission;
    const workflowIds = ctx?.external?.workflow?.workflow;
    const assetList = ctx?.external?.asset?.asset;
    const routeList = ctx?.external?.route?.route;
    const appMenuList = ctx?.external?.appMenu?.menu;
    const isV2Mode = Boolean(
      model.traceSpan ||
      model.componentVersion ||
      model.components.some(c => c.bindingSchema || c.permissionRender || c.componentVersion),
    );

    for (const dup of findDuplicates(model.components.map(c => c.id))) {
      f.push({
        code: "PAGE_DUP_COMPONENT_ID",
        severity: "error",
        path: `components.${dup}`,
        message: `Duplicate page component id: ${dup}`,
      });
    }

    if (datamodelEntities === undefined) {
      f.push({
        code: "PAGE_ENTITY_UNRESOLVED",
        severity: "warning",
        path: "entity",
        message: `Page "${model.name}" points at DataModel entity "${model.entity}", but no DataModel surface was provided.`,
      });
    } else if (!datamodelEntities.includes(model.entity)) {
      f.push({
        code: "PAGE_REF_MISSING_ENTITY",
        severity: "error",
        path: "entity",
        message: `Page "${model.name}" binds missing DataModel entity: ${model.entity}`,
      });
    }

    model.components.forEach((component, componentIndex) => {
      if (component.field) {
        if (datamodelFields === undefined) {
          f.push({
            code: "PAGE_FIELD_UNRESOLVED",
            severity: "warning",
            path: `components[${componentIndex}].field`,
            message: `Component "${component.label}" binds field "${component.field}", but no DataModel field surface was provided.`,
          });
        } else if (!datamodelFields.includes(component.field)) {
          f.push({
            code: "PAGE_REF_MISSING_FIELD",
            severity: "error",
            path: `components[${componentIndex}].field`,
            message: `Component "${component.label}" binds missing DataModel field: ${component.field}`,
          });
        } else {
          const lc = getFieldLifecycle(ctx?.external?.datamodel, component.field);
          if (lc === "deprecated") {
            f.push({
              code: "PAGE_FIELD_DEPRECATED",
              severity: "warning",
              path: `components[${componentIndex}].field`,
              message: `Component "${component.label}" binds deprecated DataModel SSOT field: ${component.field}`,
            });
          } else if (lc === "removed") {
            f.push({
              code: "PAGE_FIELD_REMOVED",
              severity: "error",
              path: `components[${componentIndex}].field`,
              message: `Component "${component.label}" binds removed DataModel SSOT field: ${component.field}`,
            });
          }
        }
      }

      component.visibleToRoles?.forEach((role, roleIndex) => {
        if (rbacRoles === undefined) {
          f.push({
            code: "PAGE_ROLE_UNRESOLVED",
            severity: "warning",
            path: `components[${componentIndex}].visibleToRoles[${roleIndex}]`,
            message: `Component "${component.label}" is visible to role "${role}", but no RBAC role surface was provided.`,
          });
        } else if (!rbacRoles.includes(role)) {
          f.push({
            code: "PAGE_REF_MISSING_ROLE",
            severity: "error",
            path: `components[${componentIndex}].visibleToRoles[${roleIndex}]`,
            message: `Component "${component.label}" references missing RBAC role: ${role}`,
          });
        }
      });

      if (component.bindingSchema) {
        if (datamodelEntities === undefined || datamodelFields === undefined) {
          f.push({
            code: "PAGE_BINDING_UNRESOLVED",
            severity: "warning",
            path: `components[${componentIndex}].bindingSchema`,
            message: `Component "${component.label}" has a BindingSchema, but no DataModel SSOT surface was provided.`,
          });
        } else {
          const bs = component.bindingSchema;
          if (!datamodelEntities.includes(bs.entity)) {
            f.push({
              code: "PAGE_BINDING_ENTITY_MISSING",
              severity: "error",
              path: `components[${componentIndex}].bindingSchema.entity`,
              message: `Component "${component.label}" binds missing DataModel entity: ${bs.entity}`,
            });
          }
          if (!datamodelFields.includes(bs.field)) {
            f.push({
              code: "PAGE_BINDING_FIELD_MISSING",
              severity: "error",
              path: `components[${componentIndex}].bindingSchema.field`,
              message: `Component "${component.label}" binds missing DataModel SSOT field: ${bs.field}`,
            });
          } else {
            const lc = getFieldLifecycle(ctx?.external?.datamodel, bs.field);
            if (lc === "deprecated") {
              f.push({
                code: "PAGE_BINDING_FIELD_DEPRECATED",
                severity: "warning",
                path: `components[${componentIndex}].bindingSchema.field`,
                message: `Component "${component.label}" binds deprecated DataModel SSOT field: ${bs.field}`,
              });
            } else if (lc === "removed") {
              f.push({
                code: "PAGE_BINDING_FIELD_REMOVED",
                severity: "error",
                path: `components[${componentIndex}].bindingSchema.field`,
                message: `Component "${component.label}" binds removed DataModel SSOT field: ${bs.field}`,
              });
            }
          }
          if (datamodelEntities.includes(bs.entity) && datamodelFields.includes(bs.field)) {
            const [fieldEnt] = bs.field.split(".");
            if (fieldEnt !== bs.entity) {
              f.push({
                code: "PAGE_BINDING_FIELD_ENTITY_MISMATCH",
                severity: "error",
                path: `components[${componentIndex}].bindingSchema.field`,
                message: `Component "${component.label}" bindingSchema field "${bs.field}" does not belong to declared entity "${bs.entity}"`,
              });
            }
            if (bs.entity !== model.entity) {
              f.push({
                code: "PAGE_BINDING_ENTITY_MISMATCH",
                severity: "error",
                path: `components[${componentIndex}].bindingSchema.entity`,
                message: `Component "${component.label}" bindingSchema entity "${bs.entity}" does not match page entity "${model.entity}"`,
              });
            }
          }
        }
      }

      if (isV2Mode && component.visibleToRoles?.length && !component.permissionRender) {
        f.push({
          code: "PAGE_PEP_BYPASS",
          severity: "error",
          path: `components[${componentIndex}].visibleToRoles`,
          message: `Component "${component.label}" uses local-only role visibility in V2 mode instead of delegating to RBAC PDP.`,
        });
      }

      component.permissionRender?.roleRefs.forEach((role, roleIndex) => {
        if (rbacRoles === undefined) {
          f.push({
            code: "PAGE_PERMISSION_REF_UNRESOLVED",
            severity: "warning",
            path: `components[${componentIndex}].permissionRender.roleRefs[${roleIndex}]`,
            message: `Component "${component.label}" delegates role "${role}" to RBAC PDP, but no RBAC role surface was provided.`,
          });
        } else if (!rbacRoles.includes(role)) {
          f.push({
            code: "PAGE_PERMISSION_REF_MISSING",
            severity: "error",
            path: `components[${componentIndex}].permissionRender.roleRefs[${roleIndex}]`,
            message: `Component "${component.label}" delegates missing RBAC PDP role: ${role}`,
          });
        }
      });

      component.permissionRender?.permissionRefs?.forEach((permission, permissionIndex) => {
        if (rbacPermissions === undefined) {
          f.push({
            code: "PAGE_PERMISSION_REF_UNRESOLVED",
            severity: "warning",
            path: `components[${componentIndex}].permissionRender.permissionRefs[${permissionIndex}]`,
            message: `Component "${component.label}" delegates permission "${permission}" to RBAC PDP, but no RBAC permission surface was provided.`,
          });
        } else if (!rbacPermissions.includes(permission)) {
          f.push({
            code: "PAGE_PERMISSION_REF_MISSING",
            severity: "error",
            path: `components[${componentIndex}].permissionRender.permissionRefs[${permissionIndex}]`,
            message: `Component "${component.label}" delegates missing RBAC PDP permission: ${permission}`,
          });
        }
      });

      // Field-level visibility policy constraint (core of page/component/field visibility gate)
      // Error if a bound field's component exposes it to roles outside the DataModel pdpVisibleTo (e.g. amount only to finance/admin).
      const boundField = component.bindingSchema?.field ?? component.field;
      if (boundField) {
        const pdpVisible = getFieldPdpVisibleTo(ctx?.external?.datamodel, boundField);
        if (pdpVisible && pdpVisible.length > 0) {
          const effRoles: string[] = (component.permissionRender?.roleRefs && component.permissionRender.roleRefs.length > 0)
            ? component.permissionRender.roleRefs
            : (component.visibleToRoles ?? []);
          effRoles.forEach((role, roleIndex) => {
            if (!pdpVisible.includes(role)) {
              f.push({
                code: "PAGE_FIELD_VISIBILITY_VIOLATION",
                severity: "error",
                path: `components[${componentIndex}].${component.permissionRender ? "permissionRender.roleRefs" : "visibleToRoles"}[${roleIndex}]`,
                message: `Component "${component.label}" for field "${boundField}" references role "${role}" not allowed by DataModel pdpVisibleTo [${pdpVisible.join(", ")}]`,
              });
            }
          });
        }
      }
    });

    // Page resource reference gate (V2 115.40): assets, routes, workflow launch refs, app menu refs.
    // Workflow refs validated against Workflow resolve surface (ctx.external.workflow) when connected.
    checkResourceListRefs(
      model.workflowLaunchRefs,
      workflowIds,
      "PAGE_WORKFLOW_LAUNCH_REF_UNRESOLVED",
      "PAGE_REF_MISSING_WORKFLOW_LAUNCH",
      "workflowLaunchRefs",
      "workflow",
      f,
      model.name,
    );
    checkResourceListRefs(
      model.assetRefs,
      assetList,
      "PAGE_ASSET_REF_UNRESOLVED",
      "PAGE_REF_MISSING_ASSET",
      "assetRefs",
      "asset",
      f,
      model.name,
    );
    checkResourceListRefs(
      model.routeRefs,
      routeList,
      "PAGE_ROUTE_REF_UNRESOLVED",
      "PAGE_REF_MISSING_ROUTE",
      "routeRefs",
      "route",
      f,
      model.name,
    );
    checkResourceListRefs(
      model.appMenuRefs,
      appMenuList,
      "PAGE_APP_MENU_REF_UNRESOLVED",
      "PAGE_REF_MISSING_APP_MENU",
      "appMenuRefs",
      "app menu",
      f,
      model.name,
    );

    model.linkageRules.forEach((rule, ruleIndex) => {
      const source = byComponent.get(rule.source.component);
      const target = byComponent.get(rule.target.component);

      if (!source) {
        f.push({
          code: "PAGE_LINKAGE_MISSING_SOURCE",
          severity: "error",
          path: `linkageRules[${ruleIndex}].source.component`,
          message: `Linkage rule "${rule.id}" points at missing source component: ${rule.source.component}`,
        });
      }
      if (!target) {
        f.push({
          code: "PAGE_LINKAGE_MISSING_TARGET",
          severity: "error",
          path: `linkageRules[${ruleIndex}].target.component`,
          message: `Linkage rule "${rule.id}" points at missing target component: ${rule.target.component}`,
        });
      }

      const ev = rule.source.event;
      if (typeof ev !== "string" || !(ALLOWED_TRIGGER_EVENTS as readonly string[]).includes(ev)) {
        f.push({
          code: "PAGE_LINKAGE_INVALID_EVENT",
          severity: "error",
          path: `linkageRules[${ruleIndex}].source.event`,
          message: `Linkage rule "${rule.id}" uses invalid source event "${ev}". Allowed events: ${ALLOWED_TRIGGER_EVENTS.join(", ")}.`,
        });
      }

      if (!isLinkageCompatible(source, rule.source.event, target, rule.target.action)) {
        f.push({
          code: "PAGE_LINKAGE_ACTION_INCOMPATIBLE",
          severity: "error",
          path: `linkageRules[${ruleIndex}]`,
          message: `Linkage rule "${rule.id}" is incompatible: ${rule.source.event} from ${source?.type ?? "missing"} -> ${rule.target.action} on ${target?.type ?? "missing"}.`,
        });
      }

      // V2 event schema gate: validate action payloadRef (if present) against emitted from event or page bindings
      const payloadRef = rule.target.payloadRef;
      if (payloadRef !== undefined) {
        if (!isValidActionPayloadRef(rule.source.event, payloadRef, model)) {
          f.push({
            code: "PAGE_LINKAGE_PAYLOAD_REF_INVALID",
            severity: "error",
            path: `linkageRules[${ruleIndex}].target.payloadRef`,
            message: `Linkage rule "${rule.id}" action payloadRef "${payloadRef}" is not a valid emitted ref for event "${rule.source.event}" and does not match any bound field on the page.`,
          });
        }
      }
    });

    return finalizeReport(f);
  },

  project(model: PageModel): Projection {
    const nodes: Projection["nodes"] = [
      { id: pageNodeId(model.id), label: model.name, kind: "page" },
      ...model.components.map(component => ({
        id: componentNodeId(component.id),
        label: component.label,
        kind: component.type,
      })),
    ];
    const edges: Projection["edges"] = [
      ...model.components.map(component => ({
        from: pageNodeId(model.id),
        to: componentNodeId(component.id),
        label: "contains",
        kind: "contains",
      })),
      ...model.linkageRules.map(rule => ({
        from: componentNodeId(rule.source.component),
        to: componentNodeId(rule.target.component),
        label: rule.target.payloadRef
          ? `${rule.source.event}:${rule.target.action}(${rule.target.payloadRef})`
          : `${rule.source.event}:${rule.target.action}`,
        kind: "linkage",
      })),
      ...model.components.flatMap(component => {
        const pepEdges: Projection["edges"] = [];
        if (component.bindingSchema) {
          pepEdges.push({
            from: componentNodeId(component.id),
            to: dataModelFieldNodeId(component.bindingSchema.field),
            label: "BindingSchema",
            kind: "binding",
          });
        }
        component.permissionRender?.roleRefs.forEach(role => {
          pepEdges.push({
            from: componentNodeId(component.id),
            to: rbacRoleNodeId(role),
            label: "PDP role",
            kind: "permission",
          });
        });
        component.permissionRender?.permissionRefs?.forEach(permission => {
          pepEdges.push({
            from: componentNodeId(component.id),
            to: rbacPermissionNodeId(permission),
            label: "PDP permission",
            kind: "permission",
          });
        });
        // Project visibility edges to advance V2 diagram semantics for page/region/component/field visibility
        component.visibleToRoles?.forEach(role => {
          pepEdges.push({
            from: componentNodeId(component.id),
            to: rbacRoleNodeId(role),
            label: "visibleTo",
            kind: "visibility",
          });
        });
        return pepEdges;
      }),
      // V2 resource ref edges (workflow launch, route, asset, menu) for page resource gate diagram semantics
      ...(model.workflowLaunchRefs ?? []).map(wf => ({
        from: pageNodeId(model.id),
        to: `wf_${sanitizeId(wf)}`,
        label: "launch",
        kind: "launch",
      })),
      ...(model.routeRefs ?? []).map(r => ({
        from: pageNodeId(model.id),
        to: `route_${sanitizeId(r)}`,
        label: "route",
        kind: "route",
      })),
      ...(model.assetRefs ?? []).map(a => ({
        from: pageNodeId(model.id),
        to: `asset_${sanitizeId(a)}`,
        label: "asset",
        kind: "asset",
      })),
      ...(model.appMenuRefs ?? []).map(m => ({
        from: pageNodeId(model.id),
        to: `menu_${sanitizeId(m)}`,
        label: "menu",
        kind: "menu",
      })),
    ];

    const lines: string[] = ["flowchart LR"];
    for (const n of nodes) lines.push(`  ${n.id}["${n.label}"]`);
    for (const e of edges) lines.push(`  ${e.from} -->|${e.label ?? ""}| ${e.to}`);
    return { nodes, edges, mermaid: lines.join("\n") };
  },

  resolve(model: PageModel): ResolvableSurface {
    const surf: any = {
      page: [model.id],
      component: model.components.map(c => c.id),
      entity: [model.entity],
      field: [
        ...new Set(model.components.flatMap(c => {
          const field = c.bindingSchema?.field ?? c.field;
          return field ? [field] : [];
        })),
      ],
    };
    if (model.pageVersion) surf.pageVersion = model.pageVersion;
    if (model.published !== undefined) surf.published = model.published;
    if (model.snapshotRefs && model.snapshotRefs.length > 0) surf.snapshotRefs = [...model.snapshotRefs];
    return surf as ResolvableSurface;
  },

  async generate(intent: string): Promise<PageModel> {
    if (/purchase|procurement|采购/i.test(intent)) return purchaseApprovalPage;
    if (/请假|leave|审批/i.test(intent)) return leaveApprovalPage;
    throw new Error(`pageSkill.generate: needs the reasoning engine to generate a page model for intent: "${intent}"`);
  },
};

export const leaveApprovalPage: PageModel = {
  id: "page_leave_request",
  name: "请假申请页",
  entity: "leave_request",
  components: [
    { id: "applicant", type: "select", label: "申请人", field: "leave_request.applicant", visibleToRoles: ["employee", "manager"] },
    { id: "leaveType", type: "select", label: "请假类型", field: "leave_request.leaveType", visibleToRoles: ["employee", "manager"] },
    { id: "days", type: "number", label: "天数", field: "leave_request.days", visibleToRoles: ["employee", "manager"] },
    { id: "reason", type: "input", label: "事由", field: "leave_request.reason", visibleToRoles: ["employee", "manager"] },
    { id: "submit", type: "button", label: "提交请假", visibleToRoles: ["employee"] },
    { id: "approve", type: "button", label: "审批通过", field: "leave_request.approved", visibleToRoles: ["manager"] },
  ],
  linkageRules: [
    {
      id: "lk_type_days",
      source: { component: "leaveType", event: "onChange" },
      target: { component: "days", action: "setVisible" },
    },
    {
      id: "lk_approve_reason",
      source: { component: "approve", event: "onClick" },
      target: { component: "reason", action: "setDisabled" },
    },
  ],
};

leaveApprovalPage.traceSpan = "page.leave.request.v2";
leaveApprovalPage.componentVersion = "1.0.0";
for (const component of leaveApprovalPage.components) {
  if (component.field) {
    component.bindingSchema = { entity: leaveApprovalPage.entity, field: component.field };
  }
  if (component.visibleToRoles?.length) {
    component.permissionRender = { roleRefs: [...component.visibleToRoles] };
  }
  if (component.id === "submit") {
    component.permissionRender = { roleRefs: ["employee"], permissionRefs: ["leave:create"] };
  }
  if (component.id === "approve") {
    component.permissionRender = { roleRefs: ["manager"], permissionRefs: ["leave:approve"] };
  }
  component.componentVersion = "1.0.0";
}
leaveApprovalPage.pageVersion = "1.0.0";
leaveApprovalPage.published = true;
leaveApprovalPage.snapshotRefs = ["page:page_leave_request@1.0.0"];

export const purchaseApprovalPage: PageModel = {
  id: "page_purchase_request",
  name: "Purchase Request Page",
  entity: "purchase_request",
  components: [
    { id: "requester", type: "select", label: "Requester", field: "purchase_request.requester", visibleToRoles: ["requester", "department_manager", "finance", "procurement"] },
    { id: "department", type: "select", label: "Department", field: "purchase_request.department", visibleToRoles: ["requester", "department_manager", "finance", "procurement"] },
    { id: "vendor", type: "select", label: "Vendor", field: "purchase_request.vendor", visibleToRoles: ["requester", "department_manager", "finance", "procurement"] },
    { id: "amount", type: "number", label: "Amount", field: "purchase_request.amount", visibleToRoles: ["finance"] },
    { id: "status", type: "select", label: "Approval Status", field: "purchase_request.status", visibleToRoles: ["requester", "department_manager", "finance", "procurement"] },
    { id: "budgetCheck", type: "switch", label: "Budget Check", field: "purchase_request.budgetChecked", visibleToRoles: ["department_manager", "finance"] },
    { id: "submit", type: "button", label: "Submit Purchase", visibleToRoles: ["requester"] },
    { id: "managerApprove", type: "button", label: "Manager Approve", field: "purchase_request.managerApproved", visibleToRoles: ["department_manager"] },
    { id: "financeApprove", type: "button", label: "Finance Approve", field: "purchase_request.financeApproved", visibleToRoles: ["finance"] },
    { id: "procurementFulfill", type: "button", label: "Procurement Fulfill", field: "purchase_request.procurementFulfilled", visibleToRoles: ["procurement"] },
  ],
  linkageRules: [
    {
      id: "lk_amount_budget",
      source: { component: "amount", event: "onChange" },
      target: { component: "budgetCheck", action: "setVisible" },
    },
    {
      id: "lk_finance_status",
      source: { component: "financeApprove", event: "onClick" },
      target: { component: "status", action: "setValue" },
    },
  ],
};

purchaseApprovalPage.traceSpan = "page.purchase.request.v2";
purchaseApprovalPage.componentVersion = "1.0.0";
for (const component of purchaseApprovalPage.components) {
  if (component.field) {
    component.bindingSchema = { entity: purchaseApprovalPage.entity, field: component.field };
  }
  if (component.visibleToRoles?.length) {
    component.permissionRender = { roleRefs: [...component.visibleToRoles] };
  }
  if (component.id === "submit") {
    component.permissionRender = { roleRefs: ["requester"], permissionRefs: ["purchase:create"] };
  }
  if (component.id === "managerApprove") {
    component.permissionRender = { roleRefs: ["department_manager"], permissionRefs: ["purchase:manager_approve"] };
  }
  if (component.id === "financeApprove") {
    component.permissionRender = { roleRefs: ["finance"], permissionRefs: ["purchase:finance_approve"] };
  }
  if (component.id === "procurementFulfill") {
    component.permissionRender = { roleRefs: ["procurement"], permissionRefs: ["purchase:fulfill"] };
  }
  component.componentVersion = "1.0.0";
}
purchaseApprovalPage.pageVersion = "1.0.0";
purchaseApprovalPage.published = true;
purchaseApprovalPage.snapshotRefs = ["page:page_purchase_request@1.0.0"];
