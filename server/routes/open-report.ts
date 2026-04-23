import { Router } from "express";

import {
  executeOpenReportNode,
  isOpenReportNodeType,
  type OpenReportNodeAdapterDeps,
} from "./node-adapters/open-report-node-adapter.js";

export interface OpenReportRouterDeps extends OpenReportNodeAdapterDeps {}

function mapStatusToHttpStatus(status: string | undefined): number {
  if (status === "denied") {
    return 403;
  }
  if (status === "not_found") {
    return 404;
  }
  return 200;
}

export function createOpenReportRouter(
  deps: OpenReportRouterDeps = {},
): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;
    if (!isOpenReportNodeType(nodeType)) {
      return res.status(400).json({ error: "nodeType must be open_report" });
    }

    try {
      const result = await executeOpenReportNode(
        {
          nodeType,
          input: req.body?.input,
        },
        deps,
      );

      return res.status(mapStatusToHttpStatus(result.output.status)).json(result);
    } catch (error: any) {
      const message = error?.message || "Open report node execution failed.";
      const status =
        /requires reportType/i.test(message) ||
        /requires workflowId/i.test(message) ||
        /requires managerId/i.test(message) ||
        /requires replayId/i.test(message) ||
        /requires agentId/i.test(message) ||
        /requires token/i.test(message)
          ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}

const router = createOpenReportRouter();

export default router;
