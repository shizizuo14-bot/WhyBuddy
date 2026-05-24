declare module "pdf-parse" {
  export interface PdfParseResult {
    text?: string;
    [key: string]: unknown;
  }

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
