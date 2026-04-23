import { Router } from "express";

import {
  AudioRecognitionNodeError,
  executeAudioRecognitionNode,
  isAudioRecognitionNodeType,
  type AudioRecognitionNodeAdapterDeps,
} from "./node-adapters/audio-recognition-node-adapter.js";

export interface AudioRecognitionRouterDeps
  extends AudioRecognitionNodeAdapterDeps {}

export function createAudioRecognitionRouter(
  deps: AudioRecognitionRouterDeps = {},
): Router {
  const router = Router();

  router.post("/nodes/execute", async (req, res) => {
    const nodeType = req.body?.nodeType;
    if (!isAudioRecognitionNodeType(nodeType)) {
      return res
        .status(400)
        .json({ error: "nodeType must be audio_recognition" });
    }

    try {
      const result = await executeAudioRecognitionNode(
        {
          nodeType,
          input: req.body?.input,
        },
        deps,
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AudioRecognitionNodeError) {
        return res.status(error.status).json({ error: error.message });
      }

      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Audio recognition node execution failed.",
      });
    }
  });

  return router;
}

const router = createAudioRecognitionRouter();

export default router;
