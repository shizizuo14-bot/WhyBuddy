import { Router } from "express";

import {
  executeOrchestrationRecognitionJumpNode,
  isOrchestrationRecognitionJumpNodeType,
  type OrchestrationRecognitionJumpNodeAdapterDeps,
} from "./node-adapters/orchestration-recognition-jump-node-adapter.js";

export interface OrchestrationRecognitionJumpRouterDeps
  extends OrchestrationRecognitionJumpNodeAdapterDeps {}

function mapStatusToHttpStatus(status: string | undefined): number {
  if (status === "denied") {
    return 403;
  }
  return 200;
}

export function createOrchestrationRecognitionJumpRouter(
  deps: OrchestrationRecognitionJumpRouterDeps = {},
): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;
    if (!isOrchestrationRecognitionJumpNodeType(nodeType)) {
      return res.status(400).json({
        error: "nodeType must be orchestration_recognition_jump",
      });
    }

    try {
      const result = await executeOrchestrationRecognitionJumpNode(
        {
          nodeType,
          input: req.body?.input,
        },
        deps,
      );

      return res.status(mapStatusToHttpStatus(result.output.status)).json(result);
    } catch (error: any) {
      const message =
        error?.message || "Orchestration recognition jump node execution failed.";
      const status =
        /requires query or candidates/i.test(message) ||
        /requires agentId/i.test(message) ||
        /requires token/i.test(message)
          ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}

const router = createOrchestrationRecognitionJumpRouter();

export default router;
