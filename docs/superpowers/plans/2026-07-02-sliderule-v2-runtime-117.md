# SlideRule V2 Runtime 117 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the six SlideRule business Skills from static V2 contracts into pure executable runtime closures.

**Architecture:** Keep the existing Skill model: pure TypeScript functions plus tests under `client/src/lib/skills`. Each runtime helper is deterministic and in-memory only. AgentLoop runs each task in an isolated queue worktree with Grok as both implementation and review agent, then main landing stays serial.

**Tech Stack:** TypeScript, Vitest, AgentLoop queue worktrees, Grok CLI.

---

## File Structure

- `client/src/lib/skills/rbac/*`: runtime PDP decisions, row/field access, SoD denial.
- `client/src/lib/skills/datamodel/*`: lineage, migration planning, dataset binding runtime.
- `client/src/lib/skills/workflow/*`: pure instance engine, assignee PDP resolution, form binding.
- `client/src/lib/skills/page/*`: render policy, binding expressions, workflow task view projection.
- `client/src/lib/skills/aigc/*`: invocation policy and output evidence validation.
- `client/src/lib/skills/appbundle/*`: runtime closure, snapshot, rollback planning.
- `agent-loop/tasks/sliderule-v2-*-117.md`: executable task specs.
- `agent-loop/scripts/sliderule-v2-runtime-117-*-queue.json`: one isolated Grok queue per task.

## Execution Order

Run all 16 queue shards in parallel only because each shard has its own queue worktree. Do not apply patches to main concurrently. After queues finish, inspect landing patches and apply them serially in dependency order: RBAC, DataModel, Workflow, Page, AIGC, AppBundle, integration tests.

## Tasks

### Task 1: RBAC runtime PDP decision

**Task spec:** `agent-loop/tasks/sliderule-v2-rbac-runtime-pdp-decision-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-01-rbac-runtime-pdp-decision-queue.json`

**Goal:** Turn RBAC PDP from static validation into a pure executable decision function with allow/deny/fail-closed semantics.

**Runtime symbols:** `evaluateRbacRuntimePolicy`, `RBAC_RUNTIME_FAIL_CLOSED`, `denyPrecedence`

**Validation:** `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 2: RBAC row and field runtime permission checks

**Task spec:** `agent-loop/tasks/sliderule-v2-rbac-field-row-permission-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-02-rbac-field-row-permission-runtime-queue.json`

**Goal:** Make row-level and field-level policy refs executable through the RBAC PDP surface.

**Runtime symbols:** `evaluateRbacFieldAccess`, `evaluateRbacRowAccess`, `RBAC_FIELD_ACCESS_DENIED`

**Validation:** `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 3: RBAC runtime SoD policy enforcement

**Task spec:** `agent-loop/tasks/sliderule-v2-rbac-sod-policy-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-03-rbac-sod-policy-runtime-queue.json`

**Goal:** Make SoD rules block runtime actions, not only model validation.

**Runtime symbols:** `evaluateRbacSodPolicy`, `RBAC_RUNTIME_SOD_DENIED`, `selfApproval`

**Validation:** `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 4: DataModel field lineage runtime index

**Task spec:** `agent-loop/tasks/sliderule-v2-datamodel-field-lineage-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-04-datamodel-field-lineage-runtime-queue.json`

**Goal:** Build a queryable pure field lineage index used by impact analysis and binding checks.

**Runtime symbols:** `buildFieldLineageIndex`, `traceFieldLineage`, `DM_LINEAGE_FIELD_MISSING`

**Validation:** `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`; `pnpm exec vitest run client/src/lib/skills/impact.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 5: DataModel migration plan runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-datamodel-migration-plan-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-05-datamodel-migration-plan-runtime-queue.json`

**Goal:** Generate executable pure migration plans for field version/lifecycle changes.

**Runtime symbols:** `planDataModelMigration`, `DM_MIGRATION_REMOVED_FIELD_BLOCKER`, `migrationActions`

**Validation:** `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 6: DataModel dataset binding runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-06-datamodel-dataset-binding-runtime-queue.json`

**Goal:** Make dataset and field bindings resolvable by Page, Workflow, and AIGC without wild field refs.

**Runtime symbols:** `resolveDatasetBindingRuntime`, `DM_DATASET_BINDING_FIELD_MISSING`, `bindingEvidence`

**Validation:** `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 7: Workflow pure instance engine

**Task spec:** `agent-loop/tasks/sliderule-v2-workflow-instance-engine-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-07-workflow-instance-engine-queue.json`

**Goal:** Add a pure workflow instance state machine for start/transition/approve/reject/timeout.

**Runtime symbols:** `startWorkflowInstance`, `transitionWorkflowInstance`, `WF_RUNTIME_INVALID_TRANSITION`

**Validation:** `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 8: Workflow assignee policy runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-workflow-assignee-policy-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-08-workflow-assignee-policy-runtime-queue.json`

**Goal:** Resolve workflow assignees through RBAC PDP surfaces instead of local role assumptions.

**Runtime symbols:** `resolveWorkflowAssignees`, `WF_ASSIGNEE_PDP_DENIED`, `policyEvidence`

**Validation:** `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 9: Workflow form binding runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-workflow-form-binding-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-09-workflow-form-binding-runtime-queue.json`

**Goal:** Bind workflow task forms to DataModel fields and RBAC field permissions.

**Runtime symbols:** `buildWorkflowFormRuntime`, `WF_FORM_FIELD_PDP_DENIED`, `frozenFormFieldRefs`

**Validation:** `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 10: Page runtime render policy

**Task spec:** `agent-loop/tasks/sliderule-v2-page-runtime-render-policy-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-10-page-runtime-render-policy-queue.json`

**Goal:** Make Page components renderable as visible/read-only/hidden/disabled through RBAC and DataModel evidence.

**Runtime symbols:** `renderPageRuntimePolicy`, `PAGE_RUNTIME_COMPONENT_HIDDEN`, `PermissionRender`

**Validation:** `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 11: Page binding expression runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-page-binding-expression-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-11-page-binding-expression-runtime-queue.json`

**Goal:** Evaluate Page binding and linkage expressions as pure deterministic runtime output.

**Runtime symbols:** `evaluatePageBindingExpressions`, `PAGE_BINDING_RUNTIME_ERROR`, `linkageEvidence`

**Validation:** `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 12: Page workflow task view projection

**Task spec:** `agent-loop/tasks/sliderule-v2-page-workflow-task-view-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-12-page-workflow-task-view-queue.json`

**Goal:** Project a workflow instance state into an actionable task page view.

**Runtime symbols:** `projectWorkflowTaskView`, `PAGE_WORKFLOW_TASK_VIEW_INVALID`, `taskActions`

**Validation:** `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 13: AIGC RAG and tool policy runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-aigc-rag-tool-policy-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-13-aigc-rag-tool-policy-runtime-queue.json`

**Goal:** Make AIGC capability invocation policy executable before retrieval/tool/model use.

**Runtime symbols:** `evaluateAigcRuntimePolicy`, `AIGC_RUNTIME_POLICY_DENIED`, `toolCallBudget`

**Validation:** `pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 14: AIGC output schema and evidence runtime

**Task spec:** `agent-loop/tasks/sliderule-v2-aigc-output-schema-evidence-runtime-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-14-aigc-output-schema-evidence-runtime-queue.json`

**Goal:** Validate AIGC outputs against schema and citation/evidence policy.

**Runtime symbols:** `validateAigcRuntimeOutput`, `AIGC_RUNTIME_OUTPUT_SCHEMA_INVALID`, `citationEvidence`

**Validation:** `pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 15: AppBundle runtime publish closure

**Task spec:** `agent-loop/tasks/sliderule-v2-appbundle-publish-runtime-closure-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-15-appbundle-publish-runtime-closure-queue.json`

**Goal:** Make AppBundle publish gate execute a full runtime closure check across all six Skills.

**Runtime symbols:** `evaluateAppBundleRuntimeClosure`, `APPBUNDLE_RUNTIME_CLOSURE_BLOCKED`, `runtimeClosure`

**Validation:** `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`; `pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

### Task 16: AppBundle runtime snapshot and rollback

**Task spec:** `agent-loop/tasks/sliderule-v2-appbundle-runtime-snapshot-rollback-117.md`

**Queue:** `agent-loop/scripts/sliderule-v2-runtime-117-16-appbundle-runtime-snapshot-rollback-queue.json`

**Goal:** Generate app runtime snapshots and rollback plans from version-pinned Skill models.

**Runtime symbols:** `createAppBundleRuntimeSnapshot`, `planAppBundleRollback`, `APPBUNDLE_ROLLBACK_UNPINNED`

**Validation:** `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.


## Self Review

- No task is documentation-only.
- Every task names runtime symbols that gates can enforce.
- Every task has at least one focused Vitest command and TypeScript check.
- Worktree isolation is queue-scoped per task to avoid concurrent main writes.
- Queue landing remains manual/serial after all shards finish.

Generated: 2026-07-02T11:58:02.048Z
