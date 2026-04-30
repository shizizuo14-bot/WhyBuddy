import { describe, expect, it } from "vitest";

import {
  buildProjectCockpitEvidenceArtifactSummary,
  buildProjectReplayTimeline,
  buildProjectSpecSourceReferenceSummary,
  buildProjectSvgArtifactReference,
  buildProjectTaskEvidenceArtifactSummary,
  summarizeProjectReplayTimeline,
} from "./project-replay";
import type {
  ProjectArtifact,
  ProjectEvidence,
  ProjectMission,
  ProjectSpec,
} from "./project-store";

describe("project-replay", () => {
  const evidence: ProjectEvidence[] = [
    {
      id: "evidence-old",
      projectId: "project-1",
      type: "source",
      title: "Initial request",
      detail: "User asked for RBAC.",
      sourceMissionId: "mission-1",
      createdAt: "2026-04-30T08:00:00.000Z",
    },
    {
      id: "evidence-other",
      projectId: "project-2",
      type: "decision",
      title: "Other project decision",
      detail: "Not part of project 1.",
      createdAt: "2026-04-30T12:00:00.000Z",
    },
  ];

  const artifacts: ProjectArtifact[] = [
    {
      id: "artifact-new",
      projectId: "project-1",
      type: "svg",
      title: "Architecture diagram",
      path: "docs/architecture.svg",
      sourceMissionId: "mission-1",
      sourceSpecId: "spec-1",
      createdAt: "2026-04-30T10:00:00.000Z",
    },
  ];

  const missions: ProjectMission[] = [
    {
      id: "project-mission-1",
      projectId: "project-1",
      missionId: "mission-1",
      status: "completed",
      createdAt: "2026-04-30T07:30:00.000Z",
      updatedAt: "2026-04-30T09:00:00.000Z",
    },
  ];

  it("normalizes docs SVG diagrams as project artifact references", () => {
    expect(
      buildProjectSvgArtifactReference({
        projectId: "project-1",
        title: "Architecture diagram",
        path: ".\\docs\\architecture.svg",
        sourceMissionId: "mission-1",
        sourceSpecId: "spec-1",
      })
    ).toEqual({
      projectId: "project-1",
      type: "svg",
      title: "Architecture diagram",
      path: "docs/architecture.svg",
      sourceMissionId: "mission-1",
      sourceSpecId: "spec-1",
    });

    expect(
      buildProjectSvgArtifactReference({
        projectId: "project-1",
        title: "Progress diagram",
        uri: "docs/progress.svg",
      })
    ).toEqual({
      projectId: "project-1",
      type: "svg",
      title: "Progress diagram",
      path: "docs/progress.svg",
      uri: "docs/progress.svg",
    });
  });

  it("merges project evidence, artifacts and missions into newest-first replay items", () => {
    const timeline = buildProjectReplayTimeline({
      projectId: "project-1",
      evidence,
      artifacts,
      missions,
    });

    expect(timeline.map(item => item.id)).toEqual([
      "artifact-new",
      "project-mission-1",
      "evidence-old",
    ]);
    expect(timeline).toContainEqual(
      expect.objectContaining({
        id: "artifact-new",
        kind: "artifact",
        detail: "docs/architecture.svg",
        artifactType: "svg",
        sourceMissionId: "mission-1",
        sourceSpecId: "spec-1",
      })
    );
    expect(timeline).toContainEqual(
      expect.objectContaining({
        id: "project-mission-1",
        kind: "mission",
        missionStatus: "completed",
        occurredAt: "2026-04-30T09:00:00.000Z",
      })
    );
    expect(timeline.some(item => item.projectId === "project-2")).toBe(false);
  });

  it("limits replay items and summarizes counts for a project", () => {
    const timeline = buildProjectReplayTimeline({
      projectId: "project-1",
      evidence,
      artifacts,
      missions,
      limit: 2,
    });

    expect(timeline).toHaveLength(2);
    expect(summarizeProjectReplayTimeline("project-1", timeline)).toEqual({
      projectId: "project-1",
      totalItems: 2,
      evidenceCount: 0,
      artifactCount: 1,
      missionCount: 1,
      sourceMissionCount: 1,
      latestOccurredAt: "2026-04-30T10:00:00.000Z",
    });
  });

  it("builds recent evidence and artifact input for the project cockpit", () => {
    const summary = buildProjectCockpitEvidenceArtifactSummary({
      projectId: "project-1",
      evidence: [
        ...evidence,
        {
          id: "evidence-new",
          projectId: "project-1",
          type: "decision",
          title: "Approved route",
          detail: "User approved the spec-first route.",
          createdAt: "2026-04-30T11:00:00.000Z",
        },
      ],
      artifacts,
      limit: 2,
    });

    expect(summary).toEqual({
      projectId: "project-1",
      items: [
        expect.objectContaining({
          id: "evidence-new",
          kind: "evidence",
          evidenceType: "decision",
        }),
        expect.objectContaining({
          id: "artifact-new",
          kind: "artifact",
          artifactType: "svg",
          sourceSpecId: "spec-1",
        }),
      ],
      evidenceCount: 2,
      artifactCount: 1,
      latestEvidenceAt: "2026-04-30T11:00:00.000Z",
      latestArtifactAt: "2026-04-30T10:00:00.000Z",
    });
  });

  it("resolves spec version evidence and artifact source references", () => {
    const spec: ProjectSpec = {
      id: "spec-1",
      projectId: "project-1",
      version: 2,
      title: "Permission Spec",
      content: "Track RBAC decisions.",
      status: "accepted",
      sourceMessageIds: [],
      sourceEvidenceIds: ["evidence-old", "missing-evidence"],
      sourceArtifactIds: ["artifact-new", "artifact-other-project"],
      createdAt: "2026-04-30T09:30:00.000Z",
    };
    const summary = buildProjectSpecSourceReferenceSummary({
      spec,
      evidence,
      artifacts: [
        ...artifacts,
        {
          id: "artifact-other-project",
          projectId: "project-2",
          type: "doc",
          title: "Other project doc",
          createdAt: "2026-04-30T12:00:00.000Z",
        },
      ],
    });

    expect(summary).toEqual({
      specId: "spec-1",
      projectId: "project-1",
      version: 2,
      references: [
        expect.objectContaining({
          id: "artifact-new",
          kind: "artifact",
          artifactType: "svg",
          sourceSpecId: "spec-1",
        }),
        expect.objectContaining({
          id: "evidence-old",
          kind: "evidence",
          evidenceType: "source",
          sourceMissionId: "mission-1",
        }),
      ],
      missingEvidenceIds: ["missing-evidence"],
      missingArtifactIds: ["artifact-other-project"],
      evidenceCount: 1,
      artifactCount: 1,
    });
  });

  it("builds task-level evidence and artifact input for the execution center", () => {
    const summary = buildProjectTaskEvidenceArtifactSummary({
      projectId: "project-1",
      missionId: "mission-1",
      evidence: [
        ...evidence,
        {
          id: "evidence-task-new",
          projectId: "project-1",
          type: "runtime",
          title: "Runtime checkpoint",
          detail: "Executor reached validation.",
          sourceMissionId: "mission-1",
          createdAt: "2026-04-30T11:00:00.000Z",
        },
        {
          id: "evidence-other-mission",
          projectId: "project-1",
          type: "log",
          title: "Other task log",
          detail: "Not part of this mission.",
          sourceMissionId: "mission-2",
          createdAt: "2026-04-30T12:00:00.000Z",
        },
      ],
      artifacts: [
        ...artifacts,
        {
          id: "artifact-other-mission",
          projectId: "project-1",
          type: "report",
          title: "Other task report",
          sourceMissionId: "mission-2",
          createdAt: "2026-04-30T12:30:00.000Z",
        },
      ],
      limit: 2,
    });

    expect(summary).toEqual({
      projectId: "project-1",
      missionId: "mission-1",
      items: [
        expect.objectContaining({
          id: "evidence-task-new",
          kind: "evidence",
          evidenceType: "runtime",
          sourceMissionId: "mission-1",
        }),
        expect.objectContaining({
          id: "artifact-new",
          kind: "artifact",
          artifactType: "svg",
          sourceMissionId: "mission-1",
          sourceSpecId: "spec-1",
        }),
      ],
      evidenceCount: 2,
      artifactCount: 1,
      latestOccurredAt: "2026-04-30T11:00:00.000Z",
    });
  });
});
