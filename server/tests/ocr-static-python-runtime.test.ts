import { describe, expect, it } from "vitest";

import {
  executeOcrRecognitionNode,
  mapPythonOcrRecognitionRuntimeResponse,
} from "../routes/node-adapters/ocr-recognition-node-adapter.js";
import {
  executeStaticWebpageReadNode,
  mapPythonStaticWebpageRuntimeResponse,
} from "../routes/node-adapters/static-webpage-read-node-adapter.js";

const pythonOcrRuntime = {
  backend: "python",
  provider: "fake",
  source: "python-ocr-recognition-runtime",
  externalCalls: false,
} as const;

const pythonStaticRuntime = {
  backend: "python",
  provider: "fake",
  source: "python-static-webpage-read-runtime",
  externalCalls: false,
} as const;

describe("ocr static python runtime node mapping", () => {
  describe("ocr recognition", () => {
    it("maps python success to completed and retains provenance/permission", async () => {
      const result = await executeOcrRecognitionNode(
        {
          nodeType: "ocr_recognition",
          input: {
            images: [
              { name: "doc.png", base64DataUrl: "data:image/png;base64,aaa" },
            ],
            context: { requestId: "ocr-ctx" },
          },
        },
        {
          executePythonRuntime: async () => ({
            ok: true,
            status: "success",
            text: "Extracted via python",
            confidence: 0.88,
            pages: [{ page: 1, text: "Extracted via python" }],
            fragments: [{ text: "Extracted via python", page: 1 }],
            warnings: [],
            runtime: pythonOcrRuntime,
            metadata: { req: "meta-1" },
            provenance: { provider: "py-fake", source: "ocr-bridge" },
            permission: { allowed: true, auditId: "a-99" },
          }),
        },
      );

      expect(result.ok).toBe(true);
      expect(result.output.status).toBe("completed");
      expect(result.output.pythonStatus).toBe("success");
      expect(result.output.text).toBe("Extracted via python");
      expect(result.output.runtime).toMatchObject(pythonOcrRuntime);
      expect(result.output.context.metadata).toMatchObject({ req: "meta-1" });
      expect(result.output.provenance).toMatchObject({ provider: "py-fake" });
      expect(result.output.permission).toMatchObject({ allowed: true });
      expect(result.output.status).not.toBe("error");
    });

    it.each([
      ["degraded", "provider_degraded", "degraded"],
      ["provider_missing", "provider_missing", "error"],
      ["error", "runtime_error", "error"],
    ] as const)("maps python %s without masquerading as success", async (pyStatus, errCode, nodeStatus) => {
      const result = mapPythonOcrRecognitionRuntimeResponse({
        ok: false,
        status: pyStatus,
        error: { code: errCode, message: "py issue" },
        warnings: ["warn"],
        runtime: pythonOcrRuntime,
        metadata: {},
        provenance: { src: "py" },
      });

      expect(result.ok).toBe(false);
      expect(result.output.status).toBe(nodeStatus);
      expect(result.output.pythonStatus).toBe(pyStatus);
      expect(result.output.pythonStatus).not.toBe("success");
      expect(result.output.error?.code).toBe(errCode);
      expect(result.output.runtime).toMatchObject(pythonOcrRuntime);
      expect(result.output.provenance).toMatchObject({ src: "py" });
      expect(result.output.text).toBe("");
      expect(result.output.pages).toEqual([]);
    });
  });

  describe("static webpage read", () => {
    it("maps python success to completed with page and provenance", async () => {
      const result = await executeStaticWebpageReadNode(
        {
          nodeType: "static_webpage_read",
          input: {
            url: "https://example.test/doc",
            context: { wf: "1" },
          },
        },
        {
          executePythonRuntime: async () => ({
            ok: true,
            status: "success",
            page: {
              title: "Doc Title",
              url: "https://example.test/doc",
              content: "Body from py runtime.",
              snippet: "Body from py",
              links: [{ href: "https://ex", label: "ex" }],
              contentSource: "fake_static_page",
              fetched: false,
            },
            warnings: [],
            runtime: pythonStaticRuntime,
            metadata: { trace: "t1" },
            provenance: { provider: "py-static", source: "bridge" },
            permission: { allowed: true },
          }),
        },
      );

      expect(result.ok).toBe(true);
      expect(result.output.status).toBe("completed");
      expect(result.output.pythonStatus).toBe("success");
      expect(result.output.page?.title).toBe("Doc Title");
      expect(result.output.page?.content).toContain("Body from py");
      expect(result.output.runtime).toMatchObject(pythonStaticRuntime);
      expect(result.output.provenance).toMatchObject({ provider: "py-static" });
      expect(result.output.context.metadata).toMatchObject({ trace: "t1" });
    });

    it.each([
      ["degraded", "provider_degraded", "degraded"],
      ["provider_missing", "provider_missing", "error"],
      ["error", "runtime_error", "error"],
    ] as const)("maps python static %s without success", async (pyStatus, errCode, nodeStatus) => {
      const result = mapPythonStaticWebpageRuntimeResponse({
        ok: false,
        status: pyStatus,
        error: { code: errCode, message: `${pyStatus} msg` },
        runtime: pythonStaticRuntime,
        provenance: { p: "static-py" },
      });

      expect(result.ok).toBe(false);
      expect(result.output.status).toBe(nodeStatus);
      expect(result.output.pythonStatus).toBe(pyStatus);
      expect(result.output.pythonStatus).not.toBe("success");
      expect(result.output.error?.code).toBe(errCode);
      expect(result.output.runtime).toMatchObject(pythonStaticRuntime);
      expect(result.output.provenance).toMatchObject({ p: "static-py" });
      expect(result.output.page).toBeUndefined();
    });
  });
});
