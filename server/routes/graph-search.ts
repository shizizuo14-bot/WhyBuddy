import { Router } from "express";

import {
  executeGraphSearchNode,
  isGraphSearchNodeType,
  type GraphSearchNodeAdapterDeps,
} from "./node-adapters/graph-search-node-adapter.js";

export interface GraphSearchRouterDeps extends GraphSearchNodeAdapterDeps {}

export function createGraphSearchRouter(
  deps: GraphSearchRouterDeps,
): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;
    if (!isGraphSearchNodeType(nodeType)) {
      return res.status(400).json({ error: "nodeType must be graph_search" });
    }

    try {
      const result = await executeGraphSearchNode(
        {
          nodeType,
          input: req.body?.input,
        },
        deps,
      );
      return res.status(200).json(result);
    } catch (error: any) {
      const message = error?.message || "Graph search node execution failed.";
      const status =
        /requires entityid/i.test(message) ||
        /requires sourceentityid and targetentityid/i.test(message) ||
        /requires entityids/i.test(message) ||
        /requires projectid/i.test(message) ||
        /requires query/i.test(message)
          ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}

export default createGraphSearchRouter;
