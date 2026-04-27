import { describe, expect, it } from "vitest";

import {
  FRONTEND_AUTOPILOT_PROGRESS_SPECS,
  normalizeFrontendAutopilotViewModel,
  summarizeFrontendAutopilotProgress,
} from "./autopilot-frontend-model";

function tasks(done: number, total = 12): string {
  return Array.from({ length: total }, (_, index) => {
    const checked = index < done ? "x" : " ";
    return `- [${checked}] task ${index + 1}`;
  }).join("\n");
}

describe("autopilot frontend view model", () => {
  it("keeps selectedRouteId stable from planning into projection", () => {
    const planned = normalizeFrontendAutopilotViewModel({
      draft: {
        destinationText: "Ship launch notes",
      },
      planning: {
        candidates: [
          { id: "route-fast", label: "Fast route" },
          { id: "route-safe", label: "Safe route", selected: true },
        ],
      },
    });

    expect(planned.selectedRouteId).toBe("route-safe");
    expect(planned.sourceLayer).toBe("planning");
    expect(planned.planning.candidates).toContainEqual(
      expect.objectContaining({
        id: "route-safe",
        selected: true,
      })
    );

    const projected = normalizeFrontendAutopilotViewModel({
      planning: planned.planning,
      projection: {
        taskId: "task-1",
        status: "active",
        progress: 37,
      },
    });

    expect(projected.selectedRouteId).toBe("route-safe");
    expect(projected.projection.selectedRouteId).toBe("route-safe");
    expect(projected.sourceLayer).toBe("projection");
  });

  it("lets projection override selectedRouteId after route handoff", () => {
    const viewModel = normalizeFrontendAutopilotViewModel({
      planning: {
        selectedRouteId: "route-draft",
        lockedRouteId: "route-locked",
      },
      projection: {
        taskId: "task-2",
        selectedRouteId: "route-runtime",
        status: "waiting",
        waitingFor: "approval",
      },
    });

    expect(viewModel.selectedRouteId).toBe("route-runtime");
    expect(viewModel.sourceLayer).toBe("projection");
    expect(viewModel.projection.waitingFor).toBe("approval");
  });

  it("marks planning as locked when a locked route is present", () => {
    const viewModel = normalizeFrontendAutopilotViewModel({
      planning: {
        candidates: [
          { id: "route-fast", label: "Fast route" },
          { id: "route-safe", label: "Safe route", locked: true },
        ],
      },
    });

    expect(viewModel.planning.status).toBe("locked");
    expect(viewModel.planning.lockedRouteId).toBe("route-safe");
    expect(viewModel.selectedRouteId).toBe("route-safe");
    expect(viewModel.sourceLayer).toBe("planning");
  });

  it("marks a locked route as needing replan when the destination changes after lock", () => {
    const viewModel = normalizeFrontendAutopilotViewModel({
      draft: {
        destinationText: "Ship launch notes with finance approval",
        lockedDestinationText: "Ship launch notes",
        confirmedAt: "2026-04-26T10:00:00.000Z",
      },
      planning: {
        candidates: [
          { id: "route-fast", label: "Fast route" },
          { id: "route-safe", label: "Safe route", locked: true },
        ],
      },
    });

    expect(viewModel.draft.lockState).toBe("modified");
    expect(viewModel.draft.destinationChangedAfterLock).toBe(true);
    expect(viewModel.replanNeeded).toBe(true);
    expect(viewModel.planning).toMatchObject({
      status: "replanning",
      lockedRouteId: "route-safe",
      replanNeeded: true,
      replanReason:
        "Destination changed after route lock; route replan is needed before continuing.",
      routeImpact: {
        kind: "route-replan",
        summary:
          "Destination changed after route lock; route replan is needed before continuing.",
        fromRouteId: "route-safe",
        toRouteId: null,
        requiresConfirmation: true,
      },
    });
    expect(viewModel.warnings).toEqual([
      "Destination changed after route lock; route replan is needed before continuing.",
    ]);
  });

  it("preserves explicit route impact copy while exposing replan-needed semantics", () => {
    const viewModel = normalizeFrontendAutopilotViewModel({
      draft: {
        destinationText: "Ship launch notes with finance approval",
        lockedDestinationText: "Ship launch notes",
      },
      planning: {
        selectedRouteId: "route-fast",
        lockedRouteId: "route-fast",
        routeImpact: {
          kind: "route-replan",
          summary: "Finance approval moves the plan onto the safer route.",
          fromRouteId: "route-fast",
          toRouteId: "route-safe",
          affectedStageCount: 2,
          requiresConfirmation: true,
        },
      },
    });

    expect(viewModel.replanNeeded).toBe(true);
    expect(viewModel.routeImpact).toMatchObject({
      kind: "route-replan",
      summary: "Finance approval moves the plan onto the safer route.",
      fromRouteId: "route-fast",
      toRouteId: "route-safe",
      affectedStageCount: 2,
      requiresConfirmation: true,
    });
    expect(viewModel.planning.replanReason).toBe(
      "Finance approval moves the plan onto the safer route."
    );
    expect(viewModel.warnings).toEqual([
      "Finance approval moves the plan onto the safer route.",
    ]);
  });

  it("falls back safely when optional fields are missing or malformed", () => {
    const viewModel = normalizeFrontendAutopilotViewModel({
      draft: {
        destinationText: "  ",
        attachments: ["deck.pdf", "deck.pdf", "", 42],
        missingFields: ["owner", null, "owner"],
        status: "not-a-status",
      },
      planning: {
        candidates: [
          { id: "", label: "No id" },
          { id: "route-a", label: "", locked: true },
        ],
        status: "not-a-status",
      },
      projection: {
        taskId: 42,
        progressPercent: 140,
        status: "not-a-status",
      },
    });

    expect(viewModel.draft).toMatchObject({
      status: "empty",
      destinationText: "",
      attachments: ["deck.pdf"],
      missingFields: ["owner"],
    });
    expect(viewModel.planning).toMatchObject({
      status: "idle",
      selectedRouteId: null,
      lockedRouteId: "route-a",
    });
    expect(viewModel.planning.candidates).toEqual([
      expect.objectContaining({
        id: "route-a",
        label: "route-a",
        locked: true,
      }),
    ]);
    expect(viewModel.projection).toMatchObject({
      status: "missing",
      taskId: null,
      selectedRouteId: "route-a",
      progressPercent: 100,
    });
    expect(viewModel.replanNeeded).toBe(false);
    expect(viewModel.selectedRouteId).toBe("route-a");
    expect(viewModel.sourceLayer).toBe("planning");
  });
});

describe("summarizeFrontendAutopilotProgress", () => {
  it("reports 0 / 144 when no frontend spec files are provided", () => {
    const summary = summarizeFrontendAutopilotProgress({});

    expect(summary.done).toBe(0);
    expect(summary.total).toBe(144);
    expect(summary.expectedTotal).toBe(144);
    expect(summary.percent).toBe(0);
    expect(summary.completedSpecs).toBe(0);
    expect(summary.totalSpecs).toBe(12);
    expect(summary.specs).toHaveLength(12);
    expect(summary.specs.every(spec => spec.missing)).toBe(true);
  });

  it("summarizes partial completion across the 12 frontend specs", () => {
    const files = new Map<string, string>([
      [FRONTEND_AUTOPILOT_PROGRESS_SPECS[0], tasks(12)],
      [FRONTEND_AUTOPILOT_PROGRESS_SPECS[1], tasks(6)],
      [FRONTEND_AUTOPILOT_PROGRESS_SPECS[2], tasks(0)],
    ]);

    const summary = summarizeFrontendAutopilotProgress(files);

    expect(summary.done).toBe(18);
    expect(summary.total).toBe(144);
    expect(summary.expectedTotal).toBe(144);
    expect(summary.percent).toBe(13);
    expect(summary.completedSpecs).toBe(1);
    expect(summary.specs.slice(0, 3)).toEqual([
      expect.objectContaining({
        slug: FRONTEND_AUTOPILOT_PROGRESS_SPECS[0],
        done: 12,
        total: 12,
        missing: false,
        percent: 100,
      }),
      expect.objectContaining({
        slug: FRONTEND_AUTOPILOT_PROGRESS_SPECS[1],
        done: 6,
        total: 12,
        missing: false,
        percent: 50,
      }),
      expect.objectContaining({
        slug: FRONTEND_AUTOPILOT_PROGRESS_SPECS[2],
        done: 0,
        total: 12,
        missing: false,
        percent: 0,
      }),
    ]);
  });

  it("allows a caller supplied spec list for local progress slices", () => {
    const summary = summarizeFrontendAutopilotProgress(
      {
        "local-a": tasks(2, 4),
        "local-b": tasks(1, 4),
      },
      ["local-a", "local-b"],
      4
    );

    expect(summary).toMatchObject({
      done: 3,
      total: 8,
      expectedTotal: 8,
      percent: 38,
      totalSpecs: 2,
    });
  });
});
