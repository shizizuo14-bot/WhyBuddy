import { Router } from "express";

import {
  executeTransactionFlowNode,
  isTransactionFlowNodeType,
  type TransactionFlowNodeAdapterDeps,
} from "./node-adapters/transaction-flow-node-adapter.js";

export interface TransactionFlowRouterDeps
  extends TransactionFlowNodeAdapterDeps {}

function mapStatusToHttpStatus(status: string | undefined): number {
  if (status === "approval_required") {
    return 409;
  }
  if (status === "denied") {
    return 403;
  }
  if (status === "degraded") {
    return 503;
  }
  if (status === "failed") {
    return 500;
  }
  return 200;
}

export function createTransactionFlowRouter(
  deps: TransactionFlowRouterDeps = {},
): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;
    if (!isTransactionFlowNodeType(nodeType)) {
      return res.status(400).json({ error: "nodeType must be transaction_flow" });
    }

    try {
      const result = await executeTransactionFlowNode(
        {
          nodeType,
          input: req.body?.input,
        },
        deps,
      );

      return res.status(mapStatusToHttpStatus(result.output.status)).json(result);
    } catch (error: any) {
      const message = error?.message || "Transaction flow node execution failed.";
      const status =
        /requires agentId/i.test(message) ||
        /requires token/i.test(message) ||
        /requires transaction\.service/i.test(message) ||
        /requires transaction\.action/i.test(message) ||
        /requires transaction\.resource/i.test(message)
          ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}

const router = createTransactionFlowRouter();

export default router;
