/**
 * File parser for binary file formats (PDF, Word, Excel).
 * Extracts text content from binary buffers so the file-slicing node
 * can apply its existing text slicing strategies.
 *
 * - xlsx: uses the `xlsx` package (already in project dependencies)
 * - pdf-parse: optional dependency, throws descriptive error if missing
 * - mammoth: optional dependency, throws descriptive error if missing
 */

import * as XLSX from "xlsx";

type PdfParseFn = (buf: Buffer) => Promise<{ text?: string }>;
type PdfParseModule = { default?: PdfParseFn } | PdfParseFn;

/**
 * Parse an Excel (.xlsx/.xls) buffer into plain text.
 * Each sheet is rendered as tab-separated rows, sheets separated by double newlines.
 */
export function parseXlsxToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
    const trimmed = csv.trim();
    if (trimmed) {
      parts.push(`[${sheetName}]\n${trimmed}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Parse a PDF buffer into plain text.
 * Requires the optional `pdf-parse` package.
 */
export async function parsePdfToText(buffer: Buffer): Promise<string> {
  let pdfParse: PdfParseFn;
  try {
    // Dynamic import for optional dependency
    const mod = (await import("pdf-parse")) as unknown as PdfParseModule;
    const resolvedPdfParse = typeof mod === "function" ? mod : mod.default;
    if (!resolvedPdfParse) {
      throw new Error("pdf-parse default export is unavailable");
    }
    pdfParse = resolvedPdfParse;
  } catch {
    throw new Error(
      "PDF parsing requires the 'pdf-parse' package. Install it with: pnpm add pdf-parse",
    );
  }

  const result = await pdfParse(buffer);
  return (result.text ?? "").trim();
}

/**
 * Parse a Word (.docx) buffer into plain text.
 * Requires the optional `mammoth` package.
 */
export async function parseDocxToText(buffer: Buffer): Promise<string> {
  let mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
  try {
    // Dynamic import for optional dependency
    const mod = await import("mammoth");
    mammoth = mod.default ?? mod;
  } catch {
    throw new Error(
      "Word (.docx) parsing requires the 'mammoth' package. Install it with: pnpm add mammoth",
    );
  }

  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
}

/**
 * Dispatcher: parse a binary file buffer to text based on file type.
 */
export async function parseFileToText(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  switch (fileType) {
    case "pdf":
      return parsePdfToText(buffer);
    case "docx":
      return parseDocxToText(buffer);
    case "xlsx":
      return parseXlsxToText(buffer);
    default:
      throw new Error(`Unsupported binary file type for parsing: ${fileType}`);
  }
}

/** File types that require binary parsing (base64 input) */
export const BINARY_FILE_TYPES = ["pdf", "docx", "xlsx"] as const;
export type BinaryFileType = (typeof BINARY_FILE_TYPES)[number];

export function isBinaryFileType(fileType: string): fileType is BinaryFileType {
  return BINARY_FILE_TYPES.includes(fileType as BinaryFileType);
}
