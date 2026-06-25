import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentLoopPage from "./AgentLoopPage";
import * as api from "./dashboard/agentLoopApi";

describe("AgentLoopPage", () => {
  it("mounts the ported AgentLoop dashboard shell (overview workbench)", () => {
    const html = renderToStaticMarkup(<AgentLoopPage />);

    // Page-level chrome-free wrapper renders under SSR; the antd + g6 dashboard itself
    // is client-only and mounts after hydration, so SSR shows the loading placeholder.
    expect(html).toContain('data-testid="agent-loop-page"');
    expect(html).toContain('data-testid="agent-loop-loading"');
    expect(html).toContain("AgentLoop 控制台加载中");
  });
});

describe("agentLoopApi (wired capabilities)", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("exports the control surface used by the bridge (overview, detail, settings, run, cancel)", () => {
    expect(typeof api.fetchOverview).toBe("function");
    expect(typeof api.fetchDetail).toBe("function");
    expect(typeof api.fetchSettings).toBe("function");
    expect(typeof api.saveSettings).toBe("function");
    expect(typeof api.runQueue).toBe("function");
    expect(typeof api.runSingleTask).toBe("function");
    expect(typeof api.cancelCurrent).toBe("function");
    expect(typeof api.fetchProviderHealth).toBe("function");
  });

  it("fetchOverview hits the documented /runs/overview endpoint", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);

    await api.fetchOverview();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/agent-loop/runs/overview"));
  });

  it("fetchDetail and derived paths include reportPath/landingPath/statePath for UI buttons", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        runId: "2026-06-25T12-00-00-000Z",
        status: "DONE_FIXED",
        task: { path: "tasks/foo.md" },
        options: { task: "tasks/foo.md" },
        iterations: [],
        events: [],
      }),
    } as any);

    const d = await api.fetchDetail("2026-06-25T12-00-00-000Z");
    expect(d.reportPath).toBeTruthy();
    expect(d.reportJsonPath).toBeTruthy();
    expect(d.landingPath).toBeTruthy();
    expect(d.statePath).toBeTruthy();
    // paths should target stable documented routes
    expect(d.reportPath).toMatch(/\/api\/agent-loop\/runs\//);
    expect(d.statePath).toMatch(/\/snapshot$/);
  });

  it("fetchSettings/saveSettings hit the Python /settings surface", async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ effective: { fixAgent: "grok" }, keys: {} }) } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as any);

    const s = await api.fetchSettings();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/agent-loop/settings"));
    expect(s.effective || s).toBeTruthy();

    await api.saveSettings({ fixAgent: "codex" });
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/agent-loop/settings"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
