/**
 * `server/routes/blueprint/index.ts`：蓝图栈服务端 barrel。
 *
 * 当前状态（方案 B）：
 * - 路由装配仍由 `server/routes/blueprint.ts` 中的 `createBlueprintRouter(deps)` 承担。
 * - 8 个子域 service 壳（`intake/`、`clarification/`、`jobs/`、`agent-crew/`、`routeset/`、
 *   `spec-documents/`、`downstream/`、`artifact-memory/`）已经通过此 barrel 暴露，
 *   便于后续物理搬运时逐步把路由装配点切进来。
 * - `BlueprintServiceContext` 也从此 barrel 导出，取代对 `defaultJobStore` 等模块级单例的
 *   直接引用（需求 3.2、3.6）。
 *
 * 下游（例如 `server/index.ts`、集成测试）继续使用：
 *   `import { createBlueprintRouter } from "./blueprint.js"`
 * 该 import 保持不变；当物理迁移完成，`createBlueprintRouter` 会切到本 barrel 的实现。
 *
 * 对应需求 2.2、3.3、3.4、6.1、6.4。
 */

// 上下文与事件总线
export * from "./context.js";
export * from "./event-bus.js";

// 8 个子域的 service 接口与壳实现
export * from "./intake/service.js";
export * from "./clarification/service.js";
export * from "./jobs/service.js";
export * from "./agent-crew/service.js";
export * from "./routeset/handoff-projection.js";
export * from "./spec-documents/service.js";
export * from "./downstream/service.js";
export * from "./artifact-memory/service.js";

// 对外装配入口：继续从原有 `../blueprint.js` re-export，保持向后兼容。
export {
  createBlueprintRouter,
  createMemoryBlueprintJobStore,
  createFileBlueprintJobStore,
  collectBlueprintSpecs,
  type BlueprintJobStore,
  type BlueprintRouterDeps,
} from "../blueprint.js";
