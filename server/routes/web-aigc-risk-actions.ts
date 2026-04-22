import { Router } from "express";

import type { VectorInsertActionInput } from "../../shared/web-aigc-risk-actions.js";
import type { VectorInsertAdapter } from "../web-aigc/vector-insert-adapter.js";

export interface WebAigcRiskActionRouterDeps {
  vectorInsertAdapter: VectorInsertAdapter;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function createWebAigcRiskActionRouter(
  deps: WebAigcRiskActionRouterDeps,
): Router {
  const router = Router();

  router.post("/vector-insert", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Partial<VectorInsertActionInput>;
      if (!body.agentId || !body.token || !body.namespace || !body.payload) {
        return res.status(400).json({
          ok: false,
          error: "agentId, token, namespace, and payload are required",
        });
      }

      const payload = body.payload;
      if (
        !payload.sourceType ||
        !payload.sourceId ||
        !payload.projectId ||
        !payload.content ||
        !payload.timestamp
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "payload.sourceType, sourceId, projectId, content, and timestamp are required",
        });
      }

      const result = await deps.vectorInsertAdapter.execute({
        agentId: body.agentId,
        token: body.token,
        namespace: body.namespace,
        collection: body.collection,
        payload,
        requireApproval: body.requireApproval,
        metadata: body.metadata,
      });

      const statusCode =
        result.status === "denied"
          ? 403
          : result.status === "approval_required"
            ? 409
            : result.status === "failed"
              ? 500
              : result.status === "unavailable"
                ? 503
              : 200;

      return res.status(statusCode).json(result);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: errorMessage(error),
      });
    }
  });

  return router;
}
