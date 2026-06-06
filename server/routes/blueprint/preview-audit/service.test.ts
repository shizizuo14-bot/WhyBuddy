/**
 * `blueprint-v4-full-alignment` Module E — 出图审计单元测试（E.9）。
 *
 * 覆盖：
 * - detectFallbackFraud：(fallback, ok:true) 触发；诚实失败 (fallback, ok:false) 与
 *   (model, ok:true) 不触发。
 * - detectFakeSuccess：ok:true + 非空 errorIndicators / 小文件触发；干净大文件通过。
 * - detectDuplicates：相同 contentHash ≥2 张各产出一条发现；唯一哈希无发现。
 * - 服务 env gate 关闭 → 全 pass，不触台账 / 事件。
 * - 服务 env gate 开启 → fail 检测写台账（preview_audit / effect_preview），
 *   failCount>0 且 retryCount<max 时 emit preview.audit.regenerate_requested。
 * - retry 耗尽：retryCount >= max → 记台账 fail（retry 耗尽）且不再 emit（防死循环）。
 * - 回炉处理器：订阅后收到事件触发一次回炉尝试；retryCount 即将超限时停止且不再回炉。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectFallbackFraud,
  detectFakeSuccess,
  detectDuplicates,
} from "./detectors.js";
import { createPreviewAuditService } from "./service.js";
import { createPreviewAuditRegenerationHandler } from "./regeneration-handler.js";
import type { BlueprintServiceContext } from "../context.js";
import type {
  PreviewImageMeta,
  BlueprintPreviewProvenance,
} from "../../../../shared/blueprint/preview-audit/types.js";

const FIXED = "2026-05-28T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProvenance(
  overrides: Partial<BlueprintPreviewProvenance> = {},
): BlueprintPreviewProvenance {
  return {
    source: "model",
    ok: true,
    errorIndicators: [],
    generatedAt: FIXED,
    retryCount: 0,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<PreviewImageMeta> = {}): PreviewImageMeta {
  return {
    imageId: overrides.imageId ?? "node-1",
    jobId: overrides.jobId ?? "job-1",
    nodeId: overrides.nodeId ?? "node-1",
    filePath: overrides.filePath ?? "job-1/node-1.png",
    contentHash: overrides.contentHash ?? "hash-unique-1",
    fileSizeBytes: overrides.fileSizeBytes ?? 2048,
    provenance: overrides.provenance ?? makeProvenance(),
  };
}

function makeCtx(opts: {
  recordCheck?: ReturnType<typeof vi.fn>;
  emit?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
  runStageC?: ReturnType<typeof vi.fn>;
  hasImageService?: boolean;
  previewAuditService?: unknown;
  jobGet?: (id: string) => unknown;
} = {}): {
  ctx: BlueprintServiceContext;
  recordCheck: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  runStageC: ReturnType<typeof vi.fn>;
} {
  const recordCheck =
    opts.recordCheck ??
    vi.fn((input: Record<string, unknown>) => ({
      ...input,
      id: "chk-x",
      triggeredAt: FIXED,
    }));
  const emit = opts.emit ?? vi.fn();
  const subscribe = opts.subscribe ?? vi.fn(() => () => {});
  const runStageC =
    opts.runStageC ??
    vi.fn(async () => ({ progressPlan: [], imageBase64ByNodeId: {} }));

  const ctx = {
    now: () => new Date(FIXED),
    jobStore: {
      get: opts.jobGet ?? ((_id: string) => null),
      save: vi.fn(),
      list: () => [],
      latest: () => null,
    },
    eventBus: { emit, subscribe },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    checksLedger: {
      recordCheck,
      getChecks: vi.fn(),
      isGatePassed: vi.fn(),
      renderMarkdown: vi.fn(),
    },
    ...(opts.hasImageService === false
      ? {}
      : { effectPreviewImageService: { runStageC } }),
    ...(opts.previewAuditService !== undefined
      ? { previewAuditService: opts.previewAuditService }
      : {}),
  } as unknown as BlueprintServiceContext;

  return { ctx, recordCheck, emit, subscribe, runStageC };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// detectFallbackFraud (R12.4)
// ---------------------------------------------------------------------------

describe("detectFallbackFraud", () => {
  it("fires on (source: fallback, ok: true)", () => {
    const finding = detectFallbackFraud(
      makeMeta({ provenance: makeProvenance({ source: "fallback", ok: true }) }),
    );
    expect(finding).not.toBeNull();
    expect(finding?.reason).toBe("fallback_pretending");
    expect(finding?.severity).toBe("error");
  });

  it("returns null on honest failure (source: fallback, ok: false)", () => {
    const finding = detectFallbackFraud(
      makeMeta({ provenance: makeProvenance({ source: "fallback", ok: false }) }),
    );
    expect(finding).toBeNull();
  });

  it("returns null on (source: model, ok: true)", () => {
    const finding = detectFallbackFraud(
      makeMeta({ provenance: makeProvenance({ source: "model", ok: true }) }),
    );
    expect(finding).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectFakeSuccess (R12.5)
// ---------------------------------------------------------------------------

describe("detectFakeSuccess", () => {
  it("fires on ok:true + non-empty errorIndicators", () => {
    const finding = detectFakeSuccess(
      makeMeta({
        provenance: makeProvenance({ ok: true, errorIndicators: ["503_exhausted"] }),
        fileSizeBytes: 4096,
      }),
    );
    expect(finding).not.toBeNull();
    expect(finding?.reason).toBe("fake_success");
    expect(finding?.severity).toBe("error");
  });

  it("fires on ok:true + fileSizeBytes < 1024", () => {
    const finding = detectFakeSuccess(
      makeMeta({ provenance: makeProvenance({ ok: true }), fileSizeBytes: 512 }),
    );
    expect(finding).not.toBeNull();
    expect(finding?.reason).toBe("fake_success");
  });

  it("passes on ok:true + clean + large file", () => {
    const finding = detectFakeSuccess(
      makeMeta({
        provenance: makeProvenance({ ok: true, errorIndicators: [] }),
        fileSizeBytes: 4096,
      }),
    );
    expect(finding).toBeNull();
  });

  it("returns null when ok is false regardless of size", () => {
    const finding = detectFakeSuccess(
      makeMeta({ provenance: makeProvenance({ ok: false }), fileSizeBytes: 1 }),
    );
    expect(finding).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectDuplicates (R12.6)
// ---------------------------------------------------------------------------

describe("detectDuplicates", () => {
  it("emits a duplicate finding for each image in a group of 2+ identical hashes", () => {
    const metas = [
      makeMeta({ imageId: "a", nodeId: "a", contentHash: "dup" }),
      makeMeta({ imageId: "b", nodeId: "b", contentHash: "dup" }),
      makeMeta({ imageId: "c", nodeId: "c", contentHash: "unique" }),
    ];
    const findings = detectDuplicates(metas);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.reason === "duplicate_content")).toBe(true);
    expect(findings.every((f) => f.severity === "warn")).toBe(true);
    expect(new Set(findings.map((f) => f.imageId))).toEqual(new Set(["a", "b"]));
  });

  it("returns no findings when all hashes are unique", () => {
    const metas = [
      makeMeta({ imageId: "a", nodeId: "a", contentHash: "h1" }),
      makeMeta({ imageId: "b", nodeId: "b", contentHash: "h2" }),
    ];
    expect(detectDuplicates(metas)).toHaveLength(0);
  });

  it("ignores empty contentHash (failed/no-file nodes)", () => {
    const metas = [
      makeMeta({ imageId: "a", nodeId: "a", contentHash: "" }),
      makeMeta({ imageId: "b", nodeId: "b", contentHash: "" }),
    ];
    expect(detectDuplicates(metas)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Service — env gate OFF (R12.2)
// ---------------------------------------------------------------------------

describe("createPreviewAuditService — env gate OFF", () => {
  it("reports all images pass and does not touch ledger/eventBus", async () => {
    vi.stubEnv("BLUEPRINT_PREVIEW_AUDIT_ENABLED", "false");
    const { ctx, recordCheck, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);

    const metas = [
      makeMeta({ imageId: "a", provenance: makeProvenance({ source: "fallback", ok: true }) }),
    ];
    const result = await service.auditPreviews("job-1", metas);

    expect(result.overallStatus).toBe("pass");
    expect(result.totalImages).toBe(1);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(recordCheck).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Service — env gate ON (R12 / R13 / R14)
// ---------------------------------------------------------------------------

describe("createPreviewAuditService — env gate ON", () => {
  beforeEach(() => {
    vi.stubEnv("BLUEPRINT_PREVIEW_AUDIT_ENABLED", "true");
  });

  it("writes ledger with preview_audit/effect_preview and emits regenerate on fail (retryCount < max)", async () => {
    const { ctx, recordCheck, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);

    const metas = [
      makeMeta({
        imageId: "fraud",
        nodeId: "fraud",
        provenance: makeProvenance({ source: "fallback", ok: true }),
      }),
      makeMeta({ imageId: "ok", nodeId: "ok" }),
    ];
    const result = await service.auditPreviews("job-1", metas);

    expect(result.overallStatus).toBe("fail");
    expect(result.failCount).toBe(1);
    expect(result.passCount).toBe(1);

    // R13: ledger write
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        stage: "effect_preview",
        checkType: "preview_audit",
        checkName: "preview_audit_batch",
        status: "fail",
        validator: "preview-audit/service.ts",
      }),
    );
    const batchCall = recordCheck.mock.calls.find(
      (c) => c[0].checkName === "preview_audit_batch",
    );
    expect(batchCall?.[0].output).toContain("failedImages");
    expect(batchCall?.[0].metadata).toEqual(
      expect.objectContaining({ fallbackDetected: true }),
    );

    // R14.1: regenerate event
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "preview.audit.regenerate_requested",
        family: "preview",
        stage: "effect_preview",
        jobId: "job-1",
        payload: expect.objectContaining({
          jobId: "job-1",
          failedImageIds: ["fraud"],
          retryCount: 0,
        }),
      }),
    );
  });

  it("records warn (no emit) when only duplicate findings exist", async () => {
    const { ctx, recordCheck, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);

    const metas = [
      makeMeta({ imageId: "a", nodeId: "a", contentHash: "dup" }),
      makeMeta({ imageId: "b", nodeId: "b", contentHash: "dup" }),
    ];
    const result = await service.auditPreviews("job-1", metas);

    expect(result.overallStatus).toBe("warn");
    expect(result.failCount).toBe(0);
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({ status: "warn", checkType: "preview_audit" }),
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it("reports all pass with no ledger fail / no emit when images are clean", async () => {
    const { ctx, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);

    const result = await service.auditPreviews("job-1", [
      makeMeta({ imageId: "a", nodeId: "a" }),
      makeMeta({ imageId: "b", nodeId: "b", contentHash: "hash-unique-2" }),
    ]);

    expect(result.overallStatus).toBe("pass");
    expect(emit).not.toHaveBeenCalled();
  });

  it("does NOT treat honest failure (fallback, ok:false) as fraud", async () => {
    const { ctx, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);

    const result = await service.auditPreviews("job-1", [
      makeMeta({
        imageId: "missing",
        nodeId: "missing",
        contentHash: "",
        fileSizeBytes: 0,
        provenance: makeProvenance({ source: "fallback", ok: false }),
      }),
    ]);

    expect(result.overallStatus).toBe("pass");
    expect(result.failCount).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it("on retry exhaustion (retryCount >= max) records fail and does NOT emit", async () => {
    const { ctx, recordCheck, emit } = makeCtx();
    const service = createPreviewAuditService(ctx);
    // default maxRetries = 2; call with retryCount = 2 → exhausted
    const metas = [
      makeMeta({
        imageId: "fraud",
        nodeId: "fraud",
        provenance: makeProvenance({ source: "fallback", ok: true }),
      }),
    ];
    const result = await service.auditWithRetry("job-1", metas, 2);

    expect(result.overallStatus).toBe("fail");
    expect(emit).not.toHaveBeenCalled();
    const exhaustionCall = recordCheck.mock.calls.find(
      (c) => c[0].checkName === "preview_audit_retry_exhausted",
    );
    expect(exhaustionCall).toBeDefined();
    expect(exhaustionCall?.[0].status).toBe("fail");
    expect(exhaustionCall?.[0].output).toContain("exhausted");
  });
});

// ---------------------------------------------------------------------------
// Regeneration handler (E.5b / R14.4)
// ---------------------------------------------------------------------------

describe("createPreviewAuditRegenerationHandler", () => {
  beforeEach(() => {
    vi.stubEnv("BLUEPRINT_PREVIEW_AUDIT_ENABLED", "true");
  });

  function regenerateEvent(retryCount: number) {
    return {
      id: "evt-1",
      jobId: "job-1",
      type: "preview.audit.regenerate_requested",
      family: "preview",
      stage: "effect_preview",
      payload: { jobId: "job-1", failedImageIds: ["node-1"], retryCount },
    };
  }

  it("subscribes on construction", () => {
    const { ctx, subscribe } = makeCtx({
      previewAuditService: { auditWithRetry: vi.fn(), maxRetries: 2 },
    });
    createPreviewAuditRegenerationHandler(ctx);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("triggers a regeneration attempt (runStageC) and re-audits when retry is allowed", async () => {
    let listener: ((event: unknown) => unknown) | undefined;
    const subscribe = vi.fn((l: (event: unknown) => unknown) => {
      listener = l;
      return () => {};
    });
    const auditWithRetry = vi.fn(async () => ({}));
    const { ctx, runStageC } = makeCtx({
      subscribe,
      previewAuditService: { auditWithRetry, maxRetries: 2 },
    });

    createPreviewAuditRegenerationHandler(ctx);
    expect(listener).toBeDefined();

    await listener!(regenerateEvent(0));

    expect(runStageC).toHaveBeenCalledTimes(1);
    expect(runStageC).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: "job-1",
        rasterTargets: ["node-1"],
      }),
    );
    // re-audit with incremented retryCount
    expect(auditWithRetry).toHaveBeenCalledWith("job-1", expect.any(Array), 1);
  });

  it("stops without regenerating or re-emitting when retry would exceed max", async () => {
    let listener: ((event: unknown) => unknown) | undefined;
    const subscribe = vi.fn((l: (event: unknown) => unknown) => {
      listener = l;
      return () => {};
    });
    const auditWithRetry = vi.fn(async () => ({}));
    const { ctx, runStageC, recordCheck, emit } = makeCtx({
      subscribe,
      previewAuditService: { auditWithRetry, maxRetries: 2 },
    });

    createPreviewAuditRegenerationHandler(ctx);
    // retryCount = 2 → 2 + 1 = 3 > maxRetries(2) → stop
    await listener!(regenerateEvent(2));

    expect(runStageC).not.toHaveBeenCalled();
    expect(auditWithRetry).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        checkName: "preview_audit_regen_exhausted",
        status: "fail",
      }),
    );
  });

  it("records a warn and stops when effectPreviewImageService is unavailable", async () => {
    let listener: ((event: unknown) => unknown) | undefined;
    const subscribe = vi.fn((l: (event: unknown) => unknown) => {
      listener = l;
      return () => {};
    });
    const { ctx, recordCheck } = makeCtx({
      subscribe,
      hasImageService: false,
      previewAuditService: { auditWithRetry: vi.fn(), maxRetries: 2 },
    });

    createPreviewAuditRegenerationHandler(ctx);
    await listener!(regenerateEvent(0));

    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        checkName: "preview_audit_regen_skipped",
        status: "warn",
      }),
    );
  });
});
