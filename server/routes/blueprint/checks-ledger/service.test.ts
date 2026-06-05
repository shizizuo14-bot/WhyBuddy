/**
 * `blueprint-checks-ledger` spec Tasks 8.1.1–8.1.6：
 * ChecksLedgerService 单元测试。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChecksLedgerService } from "./service.js";
import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintGenerationJob } from "../../../../shared/blueprint/contracts.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockJob(overrides: Partial<BlueprintGenerationJob> = {}): BlueprintGenerationJob {
  return {
    id: "job-12345678-test",
    request: { targetText: "test" } as any,
    status: "running" as any,
    stage: "spec_tree" as any,
    version: "1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    artifacts: [],
    events: [],
    ...overrides,
  };
}

function createMockCtx(
  jobs: BlueprintGenerationJob[] = [],
  envEnabled = true,
): BlueprintServiceContext {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  if (envEnabled) {
    vi.stubEnv("BLUEPRINT_CHECKS_LEDGER_ENABLED", "true");
  } else {
    vi.stubEnv("BLUEPRINT_CHECKS_LEDGER_ENABLED", "false");
  }

  return {
    now: () => new Date("2026-05-28T12:00:00Z"),
    jobStore: {
      get: (id: string) => jobMap.get(id) ?? null,
      save: (job: BlueprintGenerationJob) => { jobMap.set(job.id, job); },
      list: () => [...jobMap.values()],
      latest: () => null,
    },
    eventBus: {
      emit: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as BlueprintServiceContext;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ChecksLedgerService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  // ── 8.1.1: 必填字段校验 ──────────────────────────────────────────────────

  describe("recordCheck - required fields validation", () => {
    it("throws when jobId is missing", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      expect(() =>
        service.recordCheck({
          jobId: "",
          stage: "spec_tree",
          checkType: "schema",
          checkName: "Test",
          status: "pass",
          validator: "test.ts",
        }),
      ).toThrow(/missing required fields.*jobId/);
    });

    it("throws when checkName is missing", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      expect(() =>
        service.recordCheck({
          jobId: job.id,
          stage: "spec_tree",
          checkType: "schema",
          checkName: "",
          status: "pass",
          validator: "test.ts",
        }),
      ).toThrow(/missing required fields.*checkName/);
    });
  });

  // ── 8.1.2: output 截断 ──────────────────────────────────────────────────

  describe("recordCheck - output truncation", () => {
    it("truncates output exceeding 4096 bytes", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);
      const longOutput = "x".repeat(5000);

      const entry = service.recordCheck({
        jobId: job.id,
        stage: "spec_tree",
        checkType: "schema",
        checkName: "Test",
        status: "pass",
        validator: "test.ts",
        output: longOutput,
      });

      expect(entry.output!.endsWith("\n[truncated]")).toBe(true);
      expect(Buffer.byteLength(entry.output!, "utf8")).toBeLessThanOrEqual(
        4096 + Buffer.byteLength("\n[truncated]", "utf8"),
      );
    });

    it("does not truncate output within limit", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);
      const shortOutput = "ok";

      const entry = service.recordCheck({
        jobId: job.id,
        stage: "spec_tree",
        checkType: "schema",
        checkName: "Test",
        status: "pass",
        validator: "test.ts",
        output: shortOutput,
      });

      expect(entry.output).toBe("ok");
    });
  });

  // ── 8.1.3: entry ID 唯一性与格式 ─────────────────────────────────────────

  describe("recordCheck - entry ID format and uniqueness", () => {
    it("generates ID with format chk-{jobIdPrefix}-{sequence}", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      const entry = service.recordCheck({
        jobId: job.id,
        stage: "spec_tree",
        checkType: "schema",
        checkName: "Test",
        status: "pass",
        validator: "test.ts",
      });

      expect(entry.id).toBe("chk-job-1234-1");
    });

    it("generates sequential IDs", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      const e1 = service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "pass", validator: "test.ts",
      });
      const e2 = service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "invariant",
        checkName: "B", status: "pass", validator: "test.ts",
      });

      expect(e1.id).toBe("chk-job-1234-1");
      expect(e2.id).toBe("chk-job-1234-2");
    });
  });

  // ── 8.1.4: env gate disabled ──────────────────────────────────────────────

  describe("recordCheck - env gate disabled", () => {
    it("returns placeholder without persisting when disabled", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job], false);
      const service = createChecksLedgerService(ctx);

      const entry = service.recordCheck({
        jobId: job.id,
        stage: "spec_tree",
        checkType: "schema",
        checkName: "Test",
        status: "pass",
        validator: "test.ts",
      });

      expect(entry.id).toBe("chk-disabled-0");
      expect(ctx.eventBus.emit).not.toHaveBeenCalled();
      expect(job.checksLedger).toBeUndefined();
    });
  });

  // ── 8.1.5: gate 状态转移 ──────────────────────────────────────────────────

  describe("recordCheck - gate state transitions", () => {
    it("emits checks.gate.passed on first pass entry (no fails)", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "pass", validator: "test.ts",
      });

      const emitCalls = (ctx.eventBus.emit as any).mock.calls;
      const gatePassedEvents = emitCalls.filter(
        (call: any) => call[0]?.type === "checks.gate.passed",
      );
      expect(gatePassedEvents.length).toBe(1);
    });

    it("emits checks.gate.failed on first fail entry", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "fail", validator: "test.ts",
      });

      const emitCalls = (ctx.eventBus.emit as any).mock.calls;
      const gateFailedEvents = emitCalls.filter(
        (call: any) => call[0]?.type === "checks.gate.failed",
      );
      expect(gateFailedEvents.length).toBe(1);
    });

    it("does not emit checks.gate.passed if there are fail entries", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "fail", validator: "test.ts",
      });
      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "invariant",
        checkName: "B", status: "pass", validator: "test.ts",
      });

      const emitCalls = (ctx.eventBus.emit as any).mock.calls;
      const gatePassedEvents = emitCalls.filter(
        (call: any) => call[0]?.type === "checks.gate.passed",
      );
      expect(gatePassedEvents.length).toBe(0);
    });
  });

  // ── 8.1.6: jobId 不存在时抛错 ─────────────────────────────────────────────

  describe("recordCheck - job not found", () => {
    it("throws when jobId does not exist in jobStore", () => {
      const ctx = createMockCtx([]);
      const service = createChecksLedgerService(ctx);

      expect(() =>
        service.recordCheck({
          jobId: "nonexistent-job",
          stage: "spec_tree",
          checkType: "schema",
          checkName: "Test",
          status: "pass",
          validator: "test.ts",
        }),
      ).toThrow(/job_not_found/);
    });
  });

  // ── getChecks ─────────────────────────────────────────────────────────────

  describe("getChecks", () => {
    it("returns entries sorted by triggeredAt", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "pass", validator: "test.ts",
      });
      service.recordCheck({
        jobId: job.id, stage: "effect_preview", checkType: "schema",
        checkName: "B", status: "fail", validator: "test.ts",
      });

      const response = service.getChecks(job.id);
      expect(response.entries.length).toBe(2);
      expect(response.summary.total).toBe(2);
      expect(response.summary.pass).toBe(1);
      expect(response.summary.fail).toBe(1);
    });

    it("filters by stage", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "pass", validator: "test.ts",
      });
      service.recordCheck({
        jobId: job.id, stage: "effect_preview", checkType: "schema",
        checkName: "B", status: "pass", validator: "test.ts",
      });

      const response = service.getChecks(job.id, { stage: "spec_tree" });
      expect(response.entries.length).toBe(1);
      expect(response.entries[0].checkName).toBe("A");
    });

    it("returns empty for nonexistent job", () => {
      const ctx = createMockCtx([]);
      const service = createChecksLedgerService(ctx);

      const response = service.getChecks("missing-job");
      expect(response.entries).toEqual([]);
      expect(response.summary.total).toBe(0);
    });
  });

  // ── isGatePassed ──────────────────────────────────────────────────────────

  describe("isGatePassed", () => {
    it("returns true when all pass and no fail", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "pass", validator: "test.ts",
      });

      expect(service.isGatePassed(job.id)).toBe(true);
    });

    it("returns false when there is a fail", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "A", status: "fail", validator: "test.ts",
      });

      expect(service.isGatePassed(job.id)).toBe(false);
    });

    it("returns false for empty ledger", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      expect(service.isGatePassed(job.id)).toBe(false);
    });
  });

  // ── renderMarkdown ────────────────────────────────────────────────────────

  describe("renderMarkdown", () => {
    it("renders empty state message when no entries", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      const md = service.renderMarkdown(job.id);
      expect(md).toContain("暂无校验记录");
    });

    it("renders table with entries", () => {
      const job = createMockJob();
      const ctx = createMockCtx([job]);
      const service = createChecksLedgerService(ctx);

      service.recordCheck({
        jobId: job.id, stage: "spec_tree", checkType: "schema",
        checkName: "Schema Check", status: "pass", validator: "schema.ts",
        durationMs: 12,
      });

      const md = service.renderMarkdown(job.id);
      expect(md).toContain("## 校验台账");
      expect(md).toContain("Schema Check");
      expect(md).toContain("✅ pass");
      expect(md).toContain("12ms");
      expect(md).toContain("总计: 1");
    });
  });
});
