/**
 * Vision analysis REST API routes.
 *
 * POST /api/vision/analyze - Generic image understanding.
 * POST /api/vision/ocr - OCR recognition with optional artifact persistence.
 * GET /api/vision/outputs/:outputId/:filename - Download generated OCR outputs.
 */

import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";

import { Router } from "express";
import type { Request, Response } from "express";

import { analyzeImages, type VisionAnalysisResult } from "../core/vision-provider.js";
import { recognizeImagesText, type OCRRecognitionResult } from "../core/ocr-provider.js";
import {
  OCR_OUTPUT_FORMATS,
  type OCROutputFormat,
  resolveVisionOutputAbsolutePath,
  validateVisionOutputSegment,
  writeOCRArtifacts,
} from "../core/vision-output.js";
import { getMimeType } from "./artifact-utils.js";

interface VisionImageInput {
  base64DataUrl: string;
  name: string;
}

interface VisionAnalyzeRequestBody {
  images: VisionImageInput[];
  prompt?: string;
}

interface VisionAnalyzeResponseBody {
  results: Array<{ name: string; analysis: VisionAnalysisResult }>;
}

interface VisionOCRRequestBody {
  images: VisionImageInput[];
  prompt?: string;
  persistOutput?: boolean;
  outputId?: string;
  outputFormats?: OCROutputFormat[];
}

interface VisionOCRResponseBody {
  results: Array<{ name: string; recognition: OCRRecognitionResult }>;
  output?: {
    outputId: string;
    artifacts: Awaited<ReturnType<typeof writeOCRArtifacts>>["artifacts"];
  };
}

const router = Router();

function validateImages(
  body: VisionAnalyzeRequestBody | VisionOCRRequestBody | undefined,
  res: Response
): body is VisionAnalyzeRequestBody | VisionOCRRequestBody {
  if (!body || !Array.isArray(body.images) || body.images.length === 0) {
    res.status(400).json({
      error: "Request body must include a non-empty 'images' array.",
    });
    return false;
  }

  for (let index = 0; index < body.images.length; index++) {
    const image = body.images[index];
    if (
      !image ||
      typeof image.base64DataUrl !== "string" ||
      !image.base64DataUrl
    ) {
      res.status(400).json({
        error: `images[${index}].base64DataUrl is required and must be a non-empty string.`,
      });
      return false;
    }

    if (!image.name || typeof image.name !== "string") {
      res.status(400).json({
        error: `images[${index}].name is required and must be a non-empty string.`,
      });
      return false;
    }
  }

  return true;
}

router.post("/analyze", async (req: Request, res: Response) => {
  const body = req.body as VisionAnalyzeRequestBody | undefined;

  if (!validateImages(body, res)) {
    return;
  }

  if (body.prompt !== undefined && typeof body.prompt !== "string") {
    return res.status(400).json({
      error: "'prompt' must be a string when provided.",
    });
  }

  try {
    const resultMap = await analyzeImages(body.images, body.prompt);

    const results: VisionAnalyzeResponseBody["results"] = body.images.map(image => ({
      name: image.name,
      analysis: resultMap.get(image.name) ?? {
        description: "",
        elements: [],
        textContent: "",
        rawResponse: "",
      },
    }));

    return res.json({ results } satisfies VisionAnalyzeResponseBody);
  } catch (error) {
    console.error("[Vision] /api/vision/analyze error:", error);
    return res.status(500).json({
      error: "Vision analysis failed. Please try again later.",
    });
  }
});

router.post("/ocr", async (req: Request, res: Response) => {
  const body = req.body as VisionOCRRequestBody | undefined;

  if (!validateImages(body, res)) {
    return;
  }

  if (body.prompt !== undefined && typeof body.prompt !== "string") {
    return res.status(400).json({
      error: "'prompt' must be a string when provided.",
    });
  }

  if (body.persistOutput !== undefined && typeof body.persistOutput !== "boolean") {
    return res.status(400).json({
      error: "'persistOutput' must be a boolean when provided.",
    });
  }

  if (
    body.outputId !== undefined &&
    (typeof body.outputId !== "string" ||
      !body.outputId.trim() ||
      !validateVisionOutputSegment(body.outputId.trim()))
  ) {
    return res.status(400).json({
      error:
        "'outputId' must contain only letters, numbers, dots, underscores, or hyphens.",
    });
  }

  if (
    body.outputFormats !== undefined &&
    (!Array.isArray(body.outputFormats) ||
      body.outputFormats.length === 0 ||
      body.outputFormats.some(
        format => !OCR_OUTPUT_FORMATS.includes(format as OCROutputFormat)
      ))
  ) {
    return res.status(400).json({
      error: "'outputFormats' must be a non-empty array of supported formats.",
      supported: [...OCR_OUTPUT_FORMATS],
    });
  }

  try {
    const resultMap = await recognizeImagesText(body.images, body.prompt);

    const results: VisionOCRResponseBody["results"] = body.images.map(image => ({
      name: image.name,
      recognition: resultMap.get(image.name) ?? {
        text: "",
        fragments: [],
        pages: [{ page: 1, text: "" }],
        rawResponse: "",
      },
    }));

    let output: VisionOCRResponseBody["output"];
    if (body.persistOutput !== false) {
      const persisted = await writeOCRArtifacts(results, {
        outputId: body.outputId?.trim(),
        formats: body.outputFormats,
      });

      output = {
        outputId: persisted.outputId,
        artifacts: persisted.artifacts,
      };
    }

    return res.json({ results, output } satisfies VisionOCRResponseBody);
  } catch (error) {
    console.error("[Vision] /api/vision/ocr error:", error);
    return res.status(500).json({
      error: "OCR recognition failed. Please try again later.",
    });
  }
});

router.get("/outputs/:outputId/:filename", async (req: Request, res: Response) => {
  const { outputId, filename } = req.params;

  if (
    !validateVisionOutputSegment(outputId) ||
    !validateVisionOutputSegment(filename)
  ) {
    return res.status(403).json({ error: "Invalid output path" });
  }

  const absolutePath = resolveVisionOutputAbsolutePath(outputId, filename);

  try {
    await access(absolutePath, fsConstants.R_OK);
  } catch {
    return res.status(404).json({ error: "Output artifact not found" });
  }

  res.setHeader("Content-Type", getMimeType(filename));
  if (req.query.download === "1") {
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return res.sendFile(absolutePath);
});

export default router;
