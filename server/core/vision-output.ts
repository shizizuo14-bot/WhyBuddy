import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getMimeType } from "../routes/artifact-utils.js";
import type { OCRRecognitionResult } from "./ocr-provider.js";

export const OCR_OUTPUT_FORMATS = ["json", "txt", "md"] as const;

export type OCROutputFormat = (typeof OCR_OUTPUT_FORMATS)[number];

export interface OCRResultDocument {
  name: string;
  recognition: OCRRecognitionResult;
}

export interface VisionOutputArtifact {
  kind: "file";
  name: string;
  path: string;
  mimeType: string;
  downloadUrl: string;
  description: string;
}

export interface PersistedVisionOutput {
  outputId: string;
  artifacts: VisionOutputArtifact[];
}

const VISION_OUTPUT_ROOT = path.join(process.cwd(), "tmp", "vision-outputs");

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "output";
}

export function validateVisionOutputSegment(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

export function resolveVisionOutputAbsolutePath(
  outputId: string,
  filename?: string,
): string {
  const targetDirectory = path.join(
    VISION_OUTPUT_ROOT,
    sanitizePathSegment(outputId),
  );

  return filename
    ? path.join(targetDirectory, sanitizePathSegment(filename))
    : targetDirectory;
}

function normalizeFormats(formats?: OCROutputFormat[]): OCROutputFormat[] {
  const requested =
    Array.isArray(formats) && formats.length > 0
      ? formats
      : (["json", "txt"] as OCROutputFormat[]);
  return [...new Set(requested)];
}

function toRepoRelativePath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

function buildTxtContent(results: OCRResultDocument[]): string {
  return results
    .map(result => [`[${result.name}]`, result.recognition.text || ""].join("\n").trimEnd())
    .join("\n\n");
}

function buildMarkdownContent(results: OCRResultDocument[]): string {
  const body =
    results.length > 0
      ? results
          .map(result => {
            const fragments =
              result.recognition.fragments.length > 0
                ? result.recognition.fragments
                    .map(fragment => {
                      const meta = [
                        fragment.page > 1 ? `page ${fragment.page}` : null,
                        fragment.region,
                      ]
                        .filter(Boolean)
                        .join(", ");
                      return meta
                        ? `- ${fragment.text} (${meta})`
                        : `- ${fragment.text}`;
                    })
                    .join("\n")
                : "- No fragments";

            return [
              `## ${result.name}`,
              "",
              "### Text",
              "",
              result.recognition.text || "(empty)",
              "",
              "### Fragments",
              "",
              fragments,
            ].join("\n");
          })
          .join("\n\n")
      : "";

  return ["# OCR Results", "", body].join("\n").trimEnd() + "\n";
}

function buildJsonContent(results: OCRResultDocument[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2,
  );
}

function createArtifactDescriptor(
  outputId: string,
  filename: string,
  absolutePath: string,
): VisionOutputArtifact {
  return {
    kind: "file",
    name: filename,
    path: toRepoRelativePath(absolutePath),
    mimeType: getMimeType(filename),
    downloadUrl: `/api/vision/outputs/${encodeURIComponent(outputId)}/${encodeURIComponent(filename)}`,
    description: `OCR output artifact (${filename})`,
  };
}

export async function writeOCRArtifacts(
  results: OCRResultDocument[],
  options?: {
    outputId?: string;
    formats?: OCROutputFormat[];
  },
): Promise<PersistedVisionOutput> {
  const outputId = sanitizePathSegment(options?.outputId || `ocr_${randomUUID()}`);
  const formats = normalizeFormats(options?.formats);
  const outputDirectory = resolveVisionOutputAbsolutePath(outputId);

  await mkdir(outputDirectory, { recursive: true });

  const filePayloads = formats.map(format => {
    if (format === "md") {
      return {
        filename: "ocr-results.md",
        content: buildMarkdownContent(results),
      };
    }

    if (format === "txt") {
      return {
        filename: "ocr-results.txt",
        content: buildTxtContent(results),
      };
    }

    return {
      filename: "ocr-results.json",
      content: buildJsonContent(results),
    };
  });

  await Promise.all(
    filePayloads.map(file =>
      writeFile(path.join(outputDirectory, file.filename), file.content, "utf-8"),
    ),
  );

  return {
    outputId,
    artifacts: filePayloads.map(file =>
      createArtifactDescriptor(
        outputId,
        file.filename,
        path.join(outputDirectory, file.filename),
      ),
    ),
  };
}
