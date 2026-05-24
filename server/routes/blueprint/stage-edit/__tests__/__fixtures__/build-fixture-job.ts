import type {
  BlueprintClarificationAnswer,
  BlueprintClarificationSession,
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
  BlueprintIntake,
} from "../../../../../../shared/blueprint/contracts.js";
import {
  ARTIFACT_TYPE_BY_STAGE,
  BLUEPRINT_STAGES,
  buildFixtureArtifact,
  buildFixtureJob,
  buildFixtureStaleSource,
  FIXTURE_CREATED_AT,
} from "../../../staleness/__tests__/__fixtures__/build-fixture-job.js";

export { ARTIFACT_TYPE_BY_STAGE, BLUEPRINT_STAGES, FIXTURE_CREATED_AT };

export function buildFixtureIntake(
  overrides: Partial<BlueprintIntake> = {},
): BlueprintIntake {
  return {
    id: "intake-stage-edit",
    targetText: "Build a stage edit workflow.",
    githubUrls: ["https://github.com/example/stage-edit"],
    sources: [],
    duplicateGithubUrls: [],
    domainNotes: [],
    assets: [],
    evidence: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 0,
      requiredTotal: 0,
      missingQuestionIds: [],
    },
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    ...overrides,
  };
}

export function buildFixtureClarificationAnswers(
  answers: readonly string[] = ["Goal", "Audience"],
): BlueprintClarificationAnswer[] {
  return answers.map((answer, index) => ({
    questionId: `question-${index + 1}`,
    answer,
    answeredAt: FIXTURE_CREATED_AT,
    answeredBy: "tester",
  }));
}

export function buildFixtureClarificationSession(
  overrides: Partial<BlueprintClarificationSession> = {},
): BlueprintClarificationSession {
  const answers = overrides.answers ?? buildFixtureClarificationAnswers();
  return {
    id: "clarification-stage-edit",
    intakeId: "intake-stage-edit",
    questions: answers.map((answer) => ({
      id: answer.questionId,
      kind: "goal",
      prompt: `Prompt for ${answer.questionId}`,
      required: true,
      sourceIds: [],
      evidenceIds: [],
    })),
    answers,
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: answers.length,
      requiredTotal: answers.length,
      missingQuestionIds: [],
    },
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    ...overrides,
  };
}

export function buildStageEditArtifactChain(
  options: {
    staleStages?: readonly BlueprintGenerationStage[];
  } = {},
): BlueprintGenerationArtifact[] {
  const staleStages = new Set(options.staleStages ?? []);
  return BLUEPRINT_STAGES.map((stage) => {
    const staleSince = staleStages.has(stage)
      ? "2026-05-23T01:00:00.000Z"
      : undefined;
    return buildFixtureArtifact({
      id: `artifact-${stage}`,
      type: ARTIFACT_TYPE_BY_STAGE[stage],
      staleSince,
      invalidatedBy: staleSince
        ? buildFixtureStaleSource({
            stage,
            artifactId: `source-${stage}`,
            artifactType: ARTIFACT_TYPE_BY_STAGE[stage],
            triggeredAt: staleSince,
          })
        : undefined,
    });
  });
}

export function buildJobLinkedToIntakeAndSession({
  intakeId = "intake-stage-edit",
  sessionId = "clarification-stage-edit",
  fromStage: _fromStage = "input",
  staleStages = [],
  ...overrides
}: Partial<BlueprintGenerationJob> & {
  intakeId?: string;
  sessionId?: string;
  fromStage?: BlueprintGenerationStage;
  staleStages?: readonly BlueprintGenerationStage[];
} = {}): BlueprintGenerationJob {
  const artifacts =
    overrides.artifacts ?? buildStageEditArtifactChain({ staleStages });
  return buildFixtureJob({
    id: "job-stage-edit",
    request: {
      intakeId,
      clarificationSessionId: sessionId,
      targetText: "Build a stage edit workflow.",
    },
    stage: "engineering_landing",
    status: "completed",
    artifacts,
    staleArtifactIds: artifacts
      .filter((artifact) => Boolean(artifact.staleSince))
      .map((artifact) => artifact.id),
    ...overrides,
  });
}
