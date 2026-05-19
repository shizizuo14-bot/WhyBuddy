/**
 * Autopilot 右栏底部叙事 Swiper — 共享 source-routing 模块
 *
 * 本文件只导出类型与纯同步函数，不引入任何运行时副作用，亦不依赖任何
 * React / store / DOM API。设计契约对应：
 *
 * - `.kiro/specs/autopilot-right-rail-narrative-swiper/requirements.md`
 *   §Requirement 4：双控制台职责边界（`Right_Rail_Console_Boundary`）
 *   - 4.1 / 4.2：左下 Mini Console 与右下 Narrative Swiper 不应展示同一阶段
 *     叙事卡片源
 *   - 4.3：纯系统流水（job 调度、HTTP 错误堆栈、原始 SSE 报文）不入叙事
 *   - 4.4：同一条 entry 同时具备双重价值时，左右两侧展示字段焦点不同
 *   - 4.5：以共享 source-routing 模块表达职责边界，避免左右两侧各自维护
 *     一份不一致的过滤规则
 *
 * - `.kiro/specs/autopilot-right-rail-narrative-swiper/design.md`
 *   §"right-rail-console-routing.ts"：固定路由表
 *
 * 关键约束：
 * 1. 纯同步函数，零副作用：函数只读 `entry.kind` / `line.channel` 两个字段，
 *    不写入任何外部状态、不发起任何异步调用、不依赖时钟。
 * 2. 不引入新的 npm 依赖。
 * 3. 不重复定义 `MiroFishStreamEntry` / `ConsoleLine`，仅以 `import type`
 *    形式引用既有契约，确保后续上游字段演进时本模块零改动。
 * 4. 中文 JSDoc 与项目其它模块一致；prompt 字面量与 promptId 不进入 i18n。
 */

import type { MiroFishStreamEntry } from "./mirofish-stream/mirofish-stream-types";
import type { ConsoleLine } from "../AutopilotRoutePage";

// ─── RoutingTarget ─────────────────────────────────────────────────────────

/**
 * 路由目标三态枚举（Req 4.5）。
 *
 * - `narrative-only`：仅在右下 Narrative Swiper 展示，左下 Mini Console
 *   过滤掉
 * - `console-only`：仅在左下 Mini Console 展示，右下 Narrative Swiper
 *   过滤掉
 * - `both`：左右两侧同时展示，但展示字段焦点不同（左下展示 jobId / raw，
 *   右下展示 headline / actorAvatar）
 */
export type RoutingTarget = "narrative-only" | "console-only" | "both";

/**
 * `routeMiroFishEntry()` / `routeConsoleLine()` 的返回结构（Req 4.4 / 4.5）。
 *
 * 字段语义：
 * - `target`：三态目标，决定 entry 是否进入左 / 右 / 双侧队列
 * - `consoleFields`：当 `target === "both"` 时，左下 Mini Console 应展示的
 *   字段子集；其它 target 下可选。当前合法值为 `"jobId" | "channel" | "raw"`。
 * - `narrativeFields`：当 `target === "both"` 时，右下 Narrative Swiper 应
 *   展示的字段子集；其它 target 下可选。当前合法值为
 *   `"headline" | "actorAvatar" | "severity"`。
 *
 * 字段子集的目的是让"双侧同时展示"时，左下和右下的视觉焦点不重叠：左下
 * 看 jobId / 原始报文，右下看 headline / 演员头像。
 */
export interface RoutingDecision {
  target: RoutingTarget;
  /** 当 `target === "both"` 时，左下 Mini Console 展示的字段子集。 */
  consoleFields?: ReadonlyArray<"jobId" | "channel" | "raw">;
  /** 当 `target === "both"` 时，右下 Narrative Swiper 展示的字段子集。 */
  narrativeFields?: ReadonlyArray<"headline" | "actorAvatar" | "severity">;
}

// ─── 默认 fallback 决策 ────────────────────────────────────────────────────

/**
 * 未知 entry kind 的默认决策：进入右下 Narrative Swiper，不携带字段子集。
 *
 * 选择 `narrative-only` 而不是 `console-only` 或 `both` 的理由：
 * - 后续如果上游 `MiroFishStreamEntryKind` 新增 entry 类型（例如 `clarification`
 *   / `reasoning_v2`），多数情况是叙事性事件而非系统流水
 * - 默认进入叙事侧不会污染左下 Mini Console 的"系统流水审计"心智
 * - 即便误判，叙事 Swiper 的 FIFO + 容量 8 + 节流也会自然兜底
 */
const DEFAULT_MIRO_FISH_DECISION: RoutingDecision = {
  target: "narrative-only",
};

/**
 * 未知 console channel 的默认决策：进入左下 Mini Console，不携带字段子集。
 *
 * 选择 `console-only` 的理由：
 * - `ConsoleLine` 本身就是左下控制台的派生产物，未识别的 channel 默认留在
 *   左下不会引入新风险
 * - 右下 Narrative Swiper 已经有 6 类 source 各自的精确入队路径，不需要
 *   通过未知 channel 兜底
 */
const DEFAULT_CONSOLE_DECISION: RoutingDecision = {
  target: "console-only",
};

// ─── routeMiroFishEntry ────────────────────────────────────────────────────

/**
 * 根据 `MiroFishStreamEntry.kind` 决定 entry 应进入哪一侧（Req 4.1 / 4.3 / 4.4）。
 *
 * 固定路由表（与 design.md 一致）：
 *
 * | entry.kind              | target          | 字段子集                                  |
 * | ----------------------- | --------------- | ----------------------------------------- |
 * | `reasoning`             | narrative-only  | —                                         |
 * | `capability_invocation` | narrative-only  | —                                         |
 * | `node_completed`        | narrative-only  | —（设计文档：折叠为 collapsed group）     |
 * | `route_decision`        | both            | console: jobId/raw；narrative: headline   |
 * | `artifact_created`      | both            | console: jobId/raw；narrative: headline   |
 * | `system_note`           | console-only    | —                                         |
 *
 * 注意：`agentReasoning` / `capabilityStatuses` / `agentProgress`
 * （RoleStatus / FleetActivation）等来源在 `useNarrativeCardStream` 中走的是
 * 独立 derive 函数，不经过 `MiroFishStreamEntry`，因此本函数无需为它们
 * 额外分支——它们由 hook 内部直接标记为 `narrative-only`。
 *
 * @param entry  待路由的 MiroFish 流式卡片 entry
 * @returns      路由决策；包含 `target` 与可选字段子集
 */
export function routeMiroFishEntry(
  entry: MiroFishStreamEntry
): RoutingDecision {
  switch (entry.kind) {
    case "reasoning":
    case "capability_invocation":
    case "node_completed":
      // agent 推理 / capability 调用 / 节点完成属于纯叙事信号，左下系统流水
      // 不需要重复展示。
      return { target: "narrative-only" };

    case "route_decision":
      // 路线决策同时具备"叙事 + 流水"双重价值（Req 4.4）：
      // - 左下展示 jobId / 原始字段，承担决策审计
      // - 右下展示 headline，承担"AI 选择了这条路线"的叙事
      return {
        target: "both",
        consoleFields: ["jobId", "raw"] as const,
        narrativeFields: ["headline"] as const,
      };

    case "artifact_created":
      // 产物落地同样属于双侧关注：左下记录 jobId 用于回溯 artifact 来源，
      // 右下用 headline + actorAvatar 表达"哪个角色刚刚交付了什么"。
      return {
        target: "both",
        consoleFields: ["jobId", "raw"] as const,
        narrativeFields: ["headline", "actorAvatar"] as const,
      };

    case "system_note":
      // HTTP 错误 / SSE error 等系统流水信号，仅在左下 Mini Console 展示
      // （Req 4.3）。右下 Narrative Swiper 不显示原始堆栈以保持叙事节奏。
      return { target: "console-only" };

    default:
      // 上游若新增 entry kind，默认进入叙事侧；详见 `DEFAULT_MIRO_FISH_DECISION`
      // JSDoc 中的理由说明。
      return DEFAULT_MIRO_FISH_DECISION;
  }
}

// ─── routeConsoleLine ──────────────────────────────────────────────────────

/**
 * 根据 `ConsoleLine.channel` 决定 line 应进入哪一侧（Req 4.1 / 4.3）。
 *
 * 固定路由表（与 design.md 一致）：
 *
 * | line.channel              | target          | 备注                              |
 * | ------------------------- | --------------- | --------------------------------- |
 * | `scheduler` / `scheduler.*` / `job.*` / `api.error` / `api.*` | console-only | 系统流水信号 |
 * | 其它已知叙事 channel（如 `intake.created` / `clarification.session` / `route.set` / `route.selection` / `spec.tree` / `capability.invocation` / `capability.evidence` / `preview.projection`） | narrative-only | 叙事侧已有更精确派生，本函数不重复入队 |
 * | 未知 channel              | console-only    | 见 `DEFAULT_CONSOLE_DECISION` 默认理由 |
 *
 * 设计取舍说明：
 * - `ConsoleLine` 本身由 `buildConsoleLines()` 在主页里派生而成，主要用途是
 *   左下 Mini Console；本函数主要价值是过滤掉那些已经被叙事 Swiper 通过
 *   `routeMiroFishEntry()` / 独立 derive 函数承接的 channel，避免左下重复
 *   出现"叙事卡片同款文本"。
 * - 因此对叙事 channel 的判定要尽量保守：只把"明确属于纯流水"的 channel
 *   归为 `console-only`，对暧昧的 channel 默认归为 `console-only`（保留
 *   左下流水审计能力）。
 *
 * @param line  待路由的 ConsoleLine
 * @returns     路由决策；包含 `target` 字段
 */
export function routeConsoleLine(line: ConsoleLine): RoutingDecision {
  const channel = line.channel;

  // 系统流水类 channel：调度器、job 阶段事件、API 错误、HTTP / SSE 失败等。
  // 这些信号必须留在左下 Mini Console，不应进入右下 Narrative Swiper。
  if (
    channel === "scheduler" ||
    channel.startsWith("scheduler.") ||
    channel.startsWith("job.") ||
    channel === "api.error" ||
    channel.startsWith("api.")
  ) {
    return { target: "console-only" };
  }

  // 叙事类 channel：这些事件已经由 `useNarrativeCardStream` 通过更精确的
  // 派生路径（reasoning / capability / route / artifact / spec_tree 等）
  // 进入叙事队列，左下 Mini Console 不必再展示它们的派生文本。
  //
  // 注意：这里返回 `narrative-only` 表示"左下 Mini Console 应过滤掉此条
  // ConsoleLine"，而不是"把这条 ConsoleLine 入队到叙事 Swiper"——叙事
  // Swiper 的入队来源是更上游的 entry 派生，不复用 ConsoleLine 文本。
  switch (channel) {
    case "intake.created":
    case "clarification.session":
    case "route.set":
    case "route.selection":
    case "spec.tree":
    case "capability.invocation":
    case "capability.evidence":
    case "preview.projection":
      return { target: "narrative-only" };

    default:
      // 未知 channel 默认留在左下，详见 `DEFAULT_CONSOLE_DECISION` JSDoc。
      return DEFAULT_CONSOLE_DECISION;
  }
}
