// Page metamodel - distilled from the page designer layer. It stays runtime-less:
// no renderer, no database, only component binding + visibility + linkage rules.

export type ComponentType = "input" | "select" | "number" | "date" | "switch" | "table" | "button" | "text";

export type TriggerEvent = "onChange" | "onClick" | "onLoad";

export type LinkageAction = "setOptions" | "setVisible" | "setDisabled" | "setValue";

export const ALLOWED_TRIGGER_EVENTS: readonly TriggerEvent[] = ["onChange", "onClick", "onLoad"];

/** V2 event schema: represents inputs received by the trigger and emitted payload refs for action payload binding. */
export interface EventSchema {
  event: TriggerEvent;
  /** Declarative inputs conceptually provided to the event handler (runtime-less). */
  inputs: readonly string[];
  /** Payload refs that downstream linkage actions may reference (e.g. for setValue). */
  emitted: readonly string[];
}

export const PAGE_EVENT_SCHEMAS: Record<TriggerEvent, EventSchema> = {
  onChange: { event: "onChange", inputs: ["value"], emitted: ["value"] },
  onClick: { event: "onClick", inputs: [], emitted: [] },
  onLoad: { event: "onLoad", inputs: [], emitted: ["loadedAt"] },
};

export interface PageComponent {
  id: string;
  type: ComponentType;
  label: string;
  /** Cross-skill DataModel field ref, e.g. leave_request.days. Kept for backward compatibility; prefer bindingSchema in V2. */
  field?: string;
  /** Cross-skill RBAC role refs controlling visibility. Kept for backward compatibility; prefer permissionRender in V2. */
  visibleToRoles?: string[];
  /** V2 PEP binding to DataModel SSOT. Page renders the field but does not own the data truth. */
  bindingSchema?: BindingSchema;
  /** V2 PEP permission delegation to RBAC PDP for visibility or action enablement. */
  permissionRender?: PermissionRender;
  /** Component version metadata for traceable page snapshots. */
  componentVersion?: string;
  /** V2 page resource ref (e.g. asset, route, workflow launch target, or app menu target for this component). */
  resourceRef?: string;
}

export interface LinkageRule {
  id: string;
  source: { component: string; event: TriggerEvent };
  target: {
    component: string;
    action: LinkageAction;
    /** Optional V2: payload ref for the action. Must resolve to an emitted ref from source event schema OR a page binding field. */
    payloadRef?: string;
    /** V2 resource ref support (e.g. workflow launch ref or route target via linkage when applicable). */
    resourceRef?: string;
  };
}

export interface BindingSchema {
  entity: string;
  /** DataModel SSOT field ref, e.g. leave_request.days. */
  field: string;
}

export interface PermissionRender {
  /** RBAC PDP role refs mapped from legacy visibleToRoles. */
  roleRefs: string[];
  /** Optional RBAC PDP permission refs for component actions. */
  permissionRefs?: string[];
}

export interface PageModel {
  id: string;
  name: string;
  /** Cross-skill DataModel entity ref. */
  entity: string;
  components: PageComponent[];
  linkageRules: LinkageRule[];
  /** V2 page resource refs (assets, routes, workflow launch refs, app menu refs) validated before publish. */
  assetRefs?: string[];
  routeRefs?: string[];
  workflowLaunchRefs?: string[];
  appMenuRefs?: string[];
  /** V2 PEP trace span for the local rendering/linkage execution graph. */
  traceSpan?: string;
  /** Page-level component schema version for reproducible snapshots. */
  componentVersion?: string;
  /** V2 page version id for immutable page definition snapshot (distinct from componentVersion). */
  pageVersion?: string;
  /** Published state: true when page definition is a frozen immutable snapshot. */
  published?: boolean;
  /** Snapshot refs for AppBundle to pin the immutable page version definition. */
  snapshotRefs?: string[];
}
