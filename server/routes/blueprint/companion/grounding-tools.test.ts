import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BlueprintServiceContext } from "../context.js";
import {
  verifyFileCitations,
  verificationToFinding,
} from "./grounding-tools.js";

function makeCtx(files: Record<string, string> | null): BlueprintServiceContext {
  return {
    now: () => new Date("2026-06-08T00:00:00.000Z"),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    companionRepositoryReader: files
      ? {
          readFile: vi.fn(async (filePath: string) =>
            Object.hasOwn(files, filePath)
              ? { ok: true, content: files[filePath] }
              : { ok: false, reason: "missing" },
          ),
        }
      : undefined,
  } as unknown as BlueprintServiceContext;
}

describe("companion grounding tools", () => {
  it("reads at most maxFileReads citations and reports missing files as error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 11, max: 24 }), async (citationCount) => {
        const citations = Array.from(
          { length: citationCount },
          (_, index) => `src/file-${index}.ts`,
        );
        const artifact = citations.map((citation) => `[${citation}]`).join("\n");
        const existingFiles = Object.fromEntries(
          citations.slice(0, 5).map((citation) => [citation, "present section"]),
        );
        const ctx = makeCtx(existingFiles);

        const result = await verifyFileCitations({
          ctx,
          triggerCtx: {
            jobId: "job-1",
            stage: "spec_docs",
            hasRealRepo: true,
          },
          artifact,
          maxFileReads: 10,
        });

        expect(result.filesRead.length).toBeLessThanOrEqual(10);
        expect(result.filesRead.length + result.missingFiles.length).toBe(10);
        expect(result.missingFiles.length).toBeGreaterThan(0);
        expect(verificationToFinding(ctx, result)?.severity).toBe("error");
      }),
      { numRuns: 25 },
    );
  });

  it("maps missing sections to warn and missing repo access to info", async () => {
    const sectionResult = await verifyFileCitations({
      ctx: makeCtx({ "src/auth.ts": "export const auth = true;" }),
      triggerCtx: {
        jobId: "job-1",
        stage: "spec_docs",
        hasRealRepo: true,
      },
      artifact: "[src/auth.ts#MissingSection]",
    });
    expect(sectionResult.filesRead).toEqual(["src/auth.ts"]);
    expect(sectionResult.missingSections).toEqual([
      { filePath: "src/auth.ts", sectionRef: "MissingSection" },
    ]);
    expect(verificationToFinding(makeCtx({}), sectionResult)?.severity).toBe("warn");

    const noAccessResult = await verifyFileCitations({
      ctx: makeCtx(null),
      triggerCtx: {
        jobId: "job-1",
        stage: "spec_docs",
        hasRealRepo: true,
      },
      artifact: "[src/auth.ts]",
    });
    const finding = verificationToFinding(makeCtx(null), noAccessResult);
    expect(noAccessResult.degradedReason).toBe("repo_reader_unavailable");
    expect(finding?.severity).toBe("info");
  });
});
