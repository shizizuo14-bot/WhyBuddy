/**
 * 子域 2：Clarification 的服务层壳（方案 B）。
 *
 * 对外提供 `ClarificationService` 接口，当前实现只把 `ctx.blueprintStores` 里的会话读出。
 * 真正的创建 / 答题 / readiness 合并仍走 `server/routes/blueprint.ts`；等 intake 子域完成
 * 物理迁移后再把这两段串起来（需求 2.1 子域 2）。
 *
 * 对应 `.kiro/specs/autopilot-blueprint-refactor-split`：
 * - 需求 2.1、2.2、3.2、3.6、5.1、7.3
 */

import type {
  BlueprintClarificationAnswer,
  BlueprintClarificationSession,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";

export interface CreateClarificationSessionRequest {
  strategyId?: string;
  templateId?: string;
  forceNew?: boolean;
}

export interface SaveClarificationAnswersRequest {
  answeredBy?: string;
  answers: BlueprintClarificationAnswer[];
}

export interface ClarificationService {
  getSession(sessionId: string): BlueprintClarificationSession | null;
  createSession(
    intakeId: string,
    request: CreateClarificationSessionRequest
  ): Promise<BlueprintClarificationSession>;
  saveAnswers(
    sessionId: string,
    request: SaveClarificationAnswersRequest
  ): BlueprintClarificationSession;
}

export function createClarificationService(
  ctx: BlueprintServiceContext
): ClarificationService {
  return {
    getSession(sessionId) {
      return ctx.blueprintStores.clarificationSessions.get(sessionId) ?? null;
    },
    createSession: async () => {
      throw new Error(
        "ClarificationService.createSession is not wired yet. " +
          "Current POST /intake/:id/clarifications is served by server/routes/blueprint.ts. " +
          "Physical migration happens in a follow-up iteration."
      );
    },
    saveAnswers: () => {
      throw new Error(
        "ClarificationService.saveAnswers is not wired yet. " +
          "Current POST|PATCH /clarifications/:id/answers is served by server/routes/blueprint.ts."
      );
    },
  };
}
