// RBAC metamodel — distilled from rbac-system-pc's real tables, with the runtime stripped off:
//   roles, permissions, menus, departments, positions, users,
//   role_permissions, role_menus, user_roles, position_roles, user_departments,
//   data_rules / data_scope_configs / role_data_rules.
// Pure data. No ORM, no MySQL, no Redis. This is the "能力抽象化" layer.

export type MenuType = "directory" | "menu" | "button";

/** Row-level data scope, mirrors data_scope_configs.scope_type. */
export type DataScope = "all" | "self" | "dept" | "dept_and_sub" | "custom";

export interface Permission {
  /** Unique code, e.g. "leave:approve". The atom roles are granted. */
  code: string;
  name: string;
  resource: string; // e.g. "leave_request"
  action: string; // e.g. "approve"
}

export interface Menu {
  id: string;
  parentId: string | null;
  name: string;
  type: MenuType;
  /** menu/button entries are guarded by this permission; directories usually are not. */
  permissionCode?: string | null;
}

export interface Role {
  /** Stable id — THIS is what other skills reference (workflow assignee, page visibility, data rule). */
  id: string;
  name: string;
  code: string;
  isSystem?: boolean;
  permissionCodes: string[];
  menuIds: string[];
  /** V2 PDP role inheritance: permissions are the union of own + inherited. */
  inheritsRoleIds?: string[];
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  leaderUserId?: string | null;
}

export interface Position {
  id: string;
  name: string;
  roleIds: string[]; // position_roles
}

export interface User {
  id: string;
  name: string;
  roleIds: string[]; // user_roles
  departmentId?: string | null;
  positionId?: string | null;
}

export interface DataRule {
  id: string;
  name: string;
  /** CROSS-SKILL reference: an entity id owned by the DataModel skill, e.g. "leave_request". */
  modelRef: string;
  scope: DataScope;
  roleIds: string[]; // role_data_rules
}

/** Separation-of-Duties constraint (PDP kernel ◆ SoD): a set of permission codes no single
 *  role may hold together, e.g. 不能既"发起"又"审批"同一业务。 */
export interface SodConstraint {
  name: string;
  /** permission codes that are mutually exclusive within one role */
  mutuallyExclusive: string[];
}

/** V2 SoD rule (role-based separation-of-duty for PDP). */
export interface SoDRule {
  id: string;
  name: string;
  /** roles that are mutually exclusive for the same subject (no single principal holds >1) */
  exclusiveRoleIds: string[];
  severity: "error" | "warning";
}

/** 115.10.03: Self-grant denial SoD policy: subject may not self-grant/exercise these permissions on self (e.g. finance self-approve). */
export interface SelfGrantDenial {
  id: string;
  name: string;
  /** permission codes that are denied for self-grant/self-approval */
  deniedSelfGrantPermissionCodes: string[];
}

/** 115.10.03: Dual-control SoD policy: declares actions/resources requiring multiple distinct approvers. */
export interface DualControlPolicy {
  id: string;
  name: string;
  action: string;
  resource: string;
  minApprovers: number;
}

/** Typed policy request/context for PDP decisions (V2). */
export interface FieldContext {
  /** V2: explicit field/attribute context for PDP decisions. Required in PolicyContext; absence results in RBAC_DECISION_FAIL_CLOSED. */
  fields?: string[];
  attributes?: Record<string, unknown>;
}

export interface PolicyContext {
  /** subject role refs (and optional finer subject) */
  subject: {
    roleIds: string[];
    userId?: string;
  };
  action: string;
  resourceType: string;
  resourceId?: string;
  tenantId: string;
  scope?: string;
  /** 115.10.05 field context shape (required PDP context for V2 fail-closed: missing or absent fieldContext must result in deny) */
  fieldContext: FieldContext;
  /** when true, subject is acting on self (used by self-grant SoD checks) */
  isSelf?: boolean;
  /** dual-control context: count or distinct approver userIds (pure data for minApprovers check) */
  approverCount?: number;
  approverUserIds?: string[];
}

/** PDP decision result. Default is deny (fail-closed) when proof of allow is absent. */
export interface PolicyDecision {
  allow: boolean;
  code: string; // RBAC_DECISION_ALLOW | RBAC_DECISION_FAIL_CLOSED
  reason: string;
  expandedRoles?: string[];
  matchedPermission?: string;
  /** Stable machine-readable reason for specialized deny cases, e.g. RBAC_SOD_SELF_GRANT. */
  reasonCode?: string;
  /** 115.10.08: policy version/lifecycle reported so PDP can explain which policy version was used */
  policyVersion?: string;
  policyLifecycleState?: PolicyLifecycleState;
}

/** 115.10.06: policy effect for explicit allow/deny rules (deny must override allow). */
export type PolicyEffect = "allow" | "deny";

/** 115.10.08: RBAC policy lifecycle states. Effective policies (used by PDP) are published and not retired. */
export type PolicyLifecycleState = "draft" | "published" | "effective" | "retired";

/** 115.10.06: explicit policy rule with allow/deny effect.
 * Deterministic precedence contract: deny rules win over direct or inherited allow at any scope.
 * Scope evaluation order for determinism (most-to-least specific): field, row (resourceType), permission, role, tenant.
 * Matching a deny at any applicable scope results in deny decision.
 * 115.10.07: row (resourceType) and field policy refs delegate to DataModel SSOT via entity/field ids (modelRef/fieldRef surface). */
export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  /** tenant scope filter */
  tenantId?: string;
  /** role scope (denies/allows apply after role inheritance expansion) */
  roleId?: string;
  /** permission scope */
  permissionCode?: string;
  /** row scope: DataModel entity id (SSOT ref for row-level policy) */
  resourceType?: string;
  /** field scope: DataModel "entity.field" id (SSOT stable field identity ref); delegates to datamodel field surface */
  fieldRef?: string;
  /** field scope (compat): bare field key or legacy value; when fieldRef present its key part is preferred for matching */
  field?: string;
  reason?: string;
  /** 115.10.08: policy version and lifecycle data; PDP decisions report the version used */
  version?: string;
  lifecycleState?: PolicyLifecycleState;
}

export interface RbacModel {
  roles: Role[];
  permissions: Permission[];
  menus: Menu[];
  departments: Department[];
  positions: Position[];
  users: User[];
  dataRules: DataRule[];
  /** optional design-time SoD constraints enforced by the validator. */
  sodConstraints?: SodConstraint[];
  /** V2 PDP SoD rules (role based). */
  sodRules?: SoDRule[];
  /** 115.10.03 SoD policy records covering self-grant denial and dual-control checks (mutually exclusive permissions via sodConstraints). */
  selfGrantDenials?: SelfGrantDenial[];
  dualControlPolicies?: DualControlPolicy[];
  /** fail-closed policy posture: true means default-deny for unauthenticated or unruled decisions. */
  failClosed?: boolean;
  /** 115.10.06: explicit allow/deny policy rules; presence enables deny-over-allow precedence. */
  policyRules?: PolicyRule[];
}
