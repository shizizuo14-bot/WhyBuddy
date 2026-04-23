import { Router } from "express";

import {
  executeFileSlicingNode,
  isFileSlicingNodeType,
} from "./node-adapters/file-slicing-node-adapter.js";

export function createFileSlicingRouter(): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;

    if (!isFileSlicingNodeType(nodeType)) {
      return res.status(400).json({ error: "nodeType must be file_slicing" });
    }

    try {
      const result = await executeFileSlicingNode({
        nodeType,
        input: req.body?.input,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      const message = error?.message || "File slicing node execution failed.";
      const status =
        /requires sourceId/i.test(message) ||
        /requires projectId/i.test(message) ||
        /requires content/i.test(message)
          ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}

const router = createFileSlicingRouter();

export default router;
