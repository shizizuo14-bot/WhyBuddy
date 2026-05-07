import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  BlueprintArtifactDiff,
  BlueprintArtifactDiffRequest,
  BlueprintArtifactDiffResponse,
  BlueprintArtifactFeedback,
  BlueprintArtifactFeedbackRequest,
  BlueprintArtifactFeedbackResponse,
  BlueprintArtifactLedgerResponse,
  BlueprintArtifactLineageEdge,
  BlueprintArtifactMemoryEntry,
  BlueprintArtifactPayloadSummary,
  BlueprintArtifactReplayResponse,
  BlueprintArtifactReplaySnapshot,
  BlueprintArtifactReplayTimelineEntry,
  BlueprintArtifactReplaysResponse,
  BlueprintArtifactSourceIds,
  BlueprintCapabilityUsage,
  BlueprintCapabilityEvidence,
  BlueprintCapabilityEvidenceResponse,
  BlueprintCapabilityInvocation,
  BlueprintCapabilityInvocationRequest,
  BlueprintCapabilityInvocationsResponse,
  BlueprintCapabilityRegistryResponse,
  BlueprintClarificationAnswer,
  BlueprintClarificationQuestion,
  BlueprintClarificationReadiness,
  BlueprintClarificationSession,
  BlueprintFetchCapabilityEvidenceRequest,
  BlueprintFetchCapabilityInvocationsRequest,
  BlueprintGithubSource,
  BlueprintInvokeCapabilityResponse,
  BlueprintRuntimeCapability,
  BlueprintCreateGenerationJobResponse,
  BlueprintCreateArtifactReplayRequest,
  BlueprintDomainAsset,
  BlueprintDomainEvidence,
  BlueprintIntake,
  BlueprintIntakeRequest,
  BlueprintProjectDomainContext,
  BlueprintEffectPreview,
  BlueprintEffectPreviewMilestone,
  BlueprintEffectPreviewNode,
  BlueprintEffectPreviewPrototypeCue,
  BlueprintEffectPreviewSourceStatus,
  BlueprintEffectPreviewStatus,
  BlueprintEffectPreviewsResponse,
  BlueprintEngineeringLandingPlan,
  BlueprintEngineeringLandingPlanStatus,
  BlueprintEngineeringLandingPlansResponse,
  BlueprintEngineeringLandingRiskLevel,
  BlueprintEngineeringLandingStep,
  BlueprintEngineeringLandingStepMode,
  BlueprintEngineeringRun,
  BlueprintEngineeringRunStatus,
  BlueprintEngineeringRunsResponse,
  BlueprintEngineeringVerificationResult,
  BlueprintGenerateEngineeringLandingPlansRequest,
  BlueprintGenerateImplementationPromptPackagesRequest,
  BlueprintGenerateEffectPreviewsRequest,
  BlueprintGenerationArtifact,
  BlueprintGenerationEvent,
  BlueprintGenerationEventsResponse,
  BlueprintGenerationJob,
  BlueprintGenerationRequest,
  BlueprintGenerationStage,
  BlueprintGenerationStatus,
  BlueprintLatestGenerationJobResponse,
  BlueprintImplementationPromptItem,
  BlueprintImplementationPromptPackagesResponse,
  BlueprintImplementationPromptPackage,
  BlueprintImplementationPromptSection,
  BlueprintImplementationPromptSourceStatus,
  BlueprintImplementationPromptTarget,
  BlueprintImplementationPromptTargetPlatform,
  BlueprintPlatformHandoff,
  BlueprintReviewSpecDocumentRequest,
  BlueprintReviewSpecDocumentResponse,
  BlueprintRouteCandidate,
  BlueprintRouteComplexity,
  BlueprintRouteCostLevel,
  BlueprintRouteRiskLevel,
  BlueprintRouteSelection,
  BlueprintRouteSelectionRequest,
  BlueprintRouteSet,
  BlueprintRouteStep,
  BlueprintResetRouteSelectionResponse,
  BlueprintGenerateSpecDocumentsRequest,
  BlueprintSelectRouteResponse,
  BlueprintSaveSpecDocumentVersionResponse,
  BlueprintSpecDocument,
  BlueprintSpecDocumentStatus,
  BlueprintSpecDocumentsResponse,
  BlueprintSpecDocumentType,
  BlueprintSpecDocumentVersionSnapshot,
  BlueprintSpecTree,
  BlueprintSpecTreeActionRequest,
  BlueprintSpecTreeActionResponse,
  BlueprintSpecTreeNode,
  BlueprintSpecTreeNodeStatus,
  BlueprintSpecTreeNodeType,
  BlueprintSpecTreeVersionSnapshot,
  BlueprintSaveSpecTreeVersionResponse,
  BlueprintRecordEngineeringRunRequest,
  BlueprintRecordEngineeringRunResponse,
  BlueprintUpdateSpecTreeNodeRequest,
  BlueprintUpdateSpecTreeNodeResponse,
} from "../../shared/blueprint/contracts.js";

export type BlueprintSpecStatus = "ready" | "partial" | "empty";

export interface BlueprintSpecDocs {
  requirements: boolean;
  design: boolean;
  tasks: boolean;
  config: boolean;
}

export interface BlueprintTaskStats {
  completed: number;
  total: number;
}

export interface BlueprintSpecSummary {
  id: string;
  title: string;
  phase: string;
  order: number;
  summary: string;
  path: string;
  docs: BlueprintSpecDocs;
  taskStats: BlueprintTaskStats;
  status: BlueprintSpecStatus;
}

export interface BlueprintSpecsResponse {
  generatedAt: string;
  root: string;
  totalSpecs: number;
  totalDocs: number;
  completedTasks: number;
  totalTasks: number;
  specs: BlueprintSpecSummary[];
}

export interface BlueprintRouterDeps {
  specsRoot?: string;
  now?: () => Date;
  jobStore?: BlueprintJobStore;
}

interface BlueprintIntakeStores {
  intakes: Map<string, BlueprintIntake>;
  clarificationSessions: Map<string, BlueprintClarificationSession>;
  projectContexts: Map<string, BlueprintProjectDomainContext>;
}

export interface BlueprintJobStore {
  list(): BlueprintGenerationJob[];
  get(jobId: string): BlueprintGenerationJob | null;
  save(job: BlueprintGenerationJob): void;
  latest(): BlueprintGenerationJob | null;
}

interface BlueprintConfigMetadata {
  title?: string;
  name?: string;
  phase?: string;
  order?: number | string;
  summary?: string;
}

interface BlueprintPhaseMetadata {
  phase: string;
  order: number;
}

const CONFIG_FILE = ".config.kiro";
const KNOWN_WORD_LABELS: Record<string, string> = {
  api: "API",
  aigc: "AIGC",
  github: "GitHub",
  mcp: "MCP",
  spec: "SPEC",
  specs: "SPECS",
  ui: "UI",
};

const BLUEPRINT_METADATA: Record<string, BlueprintPhaseMetadata> = {
  "blueprint-input-github-ingestion": { phase: "intake", order: 1 },
  "blueprint-clarification-workflow": { phase: "intake", order: 2 },
  "blueprint-autopilot-route-orchestrator": { phase: "planning", order: 3 },
  "blueprint-domain-and-asset-store": { phase: "planning", order: 4 },
  "blueprint-spec-tree-workbench": { phase: "planning", order: 5 },
  "blueprint-spec-document-generator": { phase: "planning", order: 6 },
  "blueprint-effect-preview-generator": { phase: "generation", order: 7 },
  "blueprint-implementation-prompt-packager": {
    phase: "generation",
    order: 8,
  },
  "blueprint-generation-api-and-job-contract": {
    phase: "generation",
    order: 9,
  },
  "blueprint-runtime-capability-bridge": { phase: "execution", order: 10 },
  "blueprint-engineering-landing-bridge": { phase: "execution", order: 11 },
  "blueprint-artifact-memory-and-replay": { phase: "execution", order: 12 },
};

const DOC_NAMES: Array<keyof BlueprintSpecDocs> = [
  "requirements",
  "design",
  "tasks",
  "config",
];

const SPEC_DOCUMENT_TYPES: BlueprintSpecDocumentType[] = [
  "requirements",
  "design",
  "tasks",
];

const PROMPT_TARGET_PLATFORMS: BlueprintImplementationPromptTargetPlatform[] = [
  "codex",
  "claude",
  "cursor",
  "kiro",
  "trae",
  "windsurf",
];

const defaultJobStore = createFileBlueprintJobStore();

export function createMemoryBlueprintJobStore(
  initialJobs: BlueprintGenerationJob[] = []
): BlueprintJobStore {
  const jobs = new Map<string, BlueprintGenerationJob>(
    initialJobs.map(job => [job.id, job])
  );

  return {
    list() {
      return [...jobs.values()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
    },
    get(jobId) {
      return jobs.get(jobId) ?? null;
    },
    save(job) {
      jobs.set(job.id, job);
    },
    latest() {
      return this.list()[0] ?? null;
    },
  };
}

export function createFileBlueprintJobStore(
  storageFile = path.resolve(".kiro/blueprint-assets/jobs.json")
): BlueprintJobStore {
  const resolvedStorageFile = path.resolve(storageFile);

  const readJobs = (): BlueprintGenerationJob[] => {
    if (!existsSync(resolvedStorageFile)) {
      return [];
    }

    try {
      const raw = readFileSync(resolvedStorageFile, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : isPlainRecord(parsed) && Array.isArray(parsed.jobs)
          ? parsed.jobs
          : [];

      return records.filter(isBlueprintGenerationJob);
    } catch {
      return [];
    }
  };

  const writeJobs = (jobs: BlueprintGenerationJob[]): void => {
    mkdirSync(path.dirname(resolvedStorageFile), { recursive: true });
    writeFileSync(
      resolvedStorageFile,
      JSON.stringify(
        {
          version: "blueprint-job-store/v1",
          updatedAt: new Date().toISOString(),
          jobs,
        },
        null,
        2
      ),
      "utf8"
    );
  };

  return {
    list() {
      return readJobs().sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
    },
    get(jobId) {
      return readJobs().find(job => job.id === jobId) ?? null;
    },
    save(job) {
      const jobs = readJobs();
      const nextJobs = jobs.some(item => item.id === job.id)
        ? jobs.map(item => (item.id === job.id ? job : item))
        : jobs.concat(job);
      writeJobs(nextJobs);
    },
    latest() {
      return this.list()[0] ?? null;
    },
  };
}

export function createBlueprintRouter(deps: BlueprintRouterDeps = {}): Router {
  const router = Router();
  const jobStore = deps.jobStore ?? defaultJobStore;
  const blueprintStores: BlueprintIntakeStores = {
    intakes: new Map<string, BlueprintIntake>(),
    clarificationSessions: new Map<string, BlueprintClarificationSession>(),
    projectContexts: new Map<string, BlueprintProjectDomainContext>(),
  };

  router.get("/specs", async (_req, res) => {
    try {
      const payload = await collectBlueprintSpecs(deps);
      res.json(payload);
    } catch (error) {
      res.status(500).json({
        error: "Failed to read blueprint specs.",
        message: errorMessage(error),
      });
    }
  });

  router.get("/capabilities", (_req, res) => {
    res.json({
      capabilities: getDefaultRuntimeCapabilities(),
    } satisfies BlueprintCapabilityRegistryResponse);
  });

  router.post("/intake", (req, res) => {
    const parsed = parseIntakeRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint intake request.",
        message: parsed.message,
      });
      return;
    }

    const intake = createBlueprintIntake(parsed.request, {
      now: deps.now,
      stores: blueprintStores,
    });
    const projectContext = intake.projectId
      ? blueprintStores.projectContexts.get(intake.projectId)
      : undefined;

    res.status(201).json({ intake, projectContext });
  });

  router.get("/intake/:intakeId", (req, res) => {
    const intake = blueprintStores.intakes.get(req.params.intakeId);
    if (!intake) {
      res.status(404).json({
        error: "Blueprint intake not found.",
        message: `No blueprint intake exists for ${req.params.intakeId}.`,
      });
      return;
    }
    const projectContext = intake.projectId
      ? blueprintStores.projectContexts.get(intake.projectId)
      : undefined;

    res.json({ intake, projectContext });
  });

  router.post("/intake/:intakeId/clarifications", (req, res) => {
    const intake = blueprintStores.intakes.get(req.params.intakeId);
    if (!intake) {
      res.status(404).json({
        error: "Blueprint intake not found.",
        message: `No blueprint intake exists for ${req.params.intakeId}.`,
      });
      return;
    }

    const session = createClarificationSession(intake, {
      now: deps.now,
      stores: blueprintStores,
    });

    res.status(201).json({ session });
  });

  router.get("/clarifications/:sessionId", (req, res) => {
    const session = blueprintStores.clarificationSessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({
        error: "Blueprint clarification session not found.",
        message: `No blueprint clarification session exists for ${req.params.sessionId}.`,
      });
      return;
    }

    res.json({ session });
  });

  const handleClarificationAnswers = (req: Request, res: Response) => {
    const session = blueprintStores.clarificationSessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({
        error: "Blueprint clarification session not found.",
        message: `No blueprint clarification session exists for ${req.params.sessionId}.`,
      });
      return;
    }

    const parsed = parseClarificationAnswersRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint clarification answers request.",
        message: parsed.message,
      });
      return;
    }

    const updated = updateClarificationSession(session, parsed.request.answers, {
      now: deps.now,
      stores: blueprintStores,
    });

    res.json({ session: updated });
  };

  router.post("/clarifications/:sessionId/answers", handleClarificationAnswers);
  router.patch("/clarifications/:sessionId/answers", handleClarificationAnswers);

  router.get("/projects/:projectId/context", (req, res) => {
    const context =
      blueprintStores.projectContexts.get(req.params.projectId) ??
      createEmptyProjectContext(req.params.projectId, deps.now?.() ?? new Date());

    res.json({ context });
  });

  const handleCreateGenerationJob = (req: Request, res: Response) => {
    const parsed = parseGenerationRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint generation request.",
        message: parsed.message,
      });
      return;
    }

    const resolved = resolveGenerationRequest(parsed.request, blueprintStores);
    if (!resolved.ok) {
      res.status(resolved.status).json({
        error: resolved.error,
        message: resolved.message,
      });
      return;
    }

    const result = createGenerationJob(resolved.request, {
      now: deps.now,
      store: jobStore,
      context: resolved.context,
      intake: resolved.intake,
      clarificationSession: resolved.clarificationSession,
    });

    res.status(201).json(result);
  };

  const handleJobDetails = (req: Request, res: Response) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.json(createJobDetailsPayload(job));
  };

  const handleJobEvents = (req: Request, res: Response) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.json({
      job,
      events: job.events,
    } satisfies BlueprintGenerationEventsResponse);
  };

  const handleJobEventStream = (req: Request, res: Response) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    for (const event of job.events) {
      res.write(formatServerSentEvent(event.type, event, event.id));
    }

    res.write(
      formatServerSentEvent("done", {
        jobId: job.id,
        status: job.status,
        eventCount: job.events.length,
      })
    );
    res.end();
  };

  router.post("/jobs", handleCreateGenerationJob);
  router.post("/generations", handleCreateGenerationJob);

  router.get("/jobs", (_req, res) => {
    res.json({ jobs: jobStore.list() });
  });

  router.get("/jobs/latest", (_req, res) => {
    const job = jobStore.latest();
    res.json(createJobDetailsPayload(job));
  });

  router.get("/jobs/:jobId/events", handleJobEvents);
  router.get("/jobs/:jobId/events/stream", handleJobEventStream);
  router.get("/generations/:jobId/events", handleJobEvents);
  router.get("/generations/:jobId/events/stream", handleJobEventStream);
  router.get("/generations/:jobId", handleJobDetails);

  router.get("/jobs/:jobId/capabilities", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const result = getOrCreateCapabilityRegistry(job, {
      now: deps.now,
      store: jobStore,
    });

    res.json({
      job: result.job,
      routeSet: extractRouteSet(result.job),
      specTree: extractSpecTree(result.job),
      capabilities: result.capabilities,
      invocations: extractCapabilityInvocations(result.job),
    } satisfies BlueprintCapabilityInvocationsResponse);
  });

  router.get("/jobs/:jobId/capability-invocations", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseCapabilityInvocationFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint capability invocation filters.",
        message: parsed.message,
      });
      return;
    }

    const registry = getOrCreateCapabilityRegistry(job, {
      now: deps.now,
      store: jobStore,
    });

    res.json({
      job: registry.job,
      routeSet: extractRouteSet(registry.job),
      specTree: extractSpecTree(registry.job),
      capabilities: registry.capabilities,
      invocations: filterCapabilityInvocations(
        extractCapabilityInvocations(registry.job),
        parsed.filters
      ),
    } satisfies BlueprintCapabilityInvocationsResponse);
  });

  router.post("/jobs/:jobId/capability-invocations", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseCapabilityInvocationRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint capability invocation request.",
        message: parsed.message,
      });
      return;
    }

    const result = invokeCapability(job, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.get("/jobs/:jobId/capability-evidence", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseCapabilityEvidenceFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint capability evidence filters.",
        message: parsed.message,
      });
      return;
    }

    const registry = getOrCreateCapabilityRegistry(job, {
      now: deps.now,
      store: jobStore,
    });

    res.json({
      job: registry.job,
      routeSet: extractRouteSet(registry.job),
      specTree: extractSpecTree(registry.job),
      evidence: filterCapabilityEvidence(
        extractCapabilityEvidence(registry.job),
        parsed.filters
      ),
    } satisfies BlueprintCapabilityEvidenceResponse);
  });

  router.post("/jobs/:jobId/route-selection", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const routeSet = extractRouteSet(job);
    if (!routeSet) {
      res.status(409).json({
        error: "Blueprint RouteSet not ready.",
        message: `Blueprint generation job ${req.params.jobId} does not have a RouteSet artifact yet.`,
      });
      return;
    }

    const parsed = parseRouteSelectionRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint route selection request.",
        message: parsed.message,
      });
      return;
    }

    const route = routeSet.routes.find(
      item => item.id === parsed.request.routeId
    );
    if (!route) {
      res.status(404).json({
        error: "Blueprint route not found.",
        message: `No route ${parsed.request.routeId} exists in RouteSet ${routeSet.id}.`,
      });
      return;
    }

    const response = selectRouteForSpecTree(job, routeSet, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    res.status(201).json(response);
  });

  router.get("/jobs/:jobId/spec-tree", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    res.json({
      job,
      routeSet: extractRouteSet(job),
      selection: extractRouteSelection(job),
      specTree,
    });
  });

  router.post("/jobs/:jobId/spec-documents", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseGenerateSpecDocumentsRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint SPEC document generation request.",
        message: parsed.message,
      });
      return;
    }

    if (
      parsed.request.nodeId &&
      !specTree.nodes.some(node => node.id === parsed.request.nodeId)
    ) {
      res.status(404).json({
        error: "Blueprint SPEC tree node not found.",
        message: `Blueprint SPEC tree node ${parsed.request.nodeId} does not exist in job ${req.params.jobId}.`,
      });
      return;
    }

    const response = generateSpecDocuments(job, specTree, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    res.status(201).json(response);
  });

  router.get("/jobs/:jobId/spec-documents", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseSpecDocumentFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint SPEC document filters.",
        message: parsed.message,
      });
      return;
    }

    res.json({
      job,
      specTree,
      documents: filterSpecDocuments(extractSpecDocuments(job), parsed.filters),
    });
  });

  router.post("/jobs/:jobId/effect-previews", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseGenerateEffectPreviewsRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint effect preview generation request.",
        message: parsed.message,
      });
      return;
    }

    if (
      parsed.request.nodeId &&
      !specTree.nodes.some(node => node.id === parsed.request.nodeId)
    ) {
      res.status(404).json({
        error: "Blueprint SPEC tree node not found.",
        message: `Blueprint SPEC tree node ${parsed.request.nodeId} does not exist in job ${req.params.jobId}.`,
      });
      return;
    }

    const result = generateEffectPreviews(job, specTree, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.get("/jobs/:jobId/effect-previews", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseEffectPreviewFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint effect preview filters.",
        message: parsed.message,
      });
      return;
    }

    res.json({
      job,
      specTree,
      effectPreviews: filterEffectPreviews(
        extractEffectPreviews(job),
        parsed.filters
      ),
    });
  });

  router.post("/jobs/:jobId/prompt-packages", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseGenerateImplementationPromptPackagesRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint implementation prompt package request.",
        message: parsed.message,
      });
      return;
    }

    if (
      parsed.request.nodeId &&
      !specTree.nodes.some(node => node.id === parsed.request.nodeId)
    ) {
      res.status(404).json({
        error: "Blueprint SPEC tree node not found.",
        message: `Blueprint SPEC tree node ${parsed.request.nodeId} does not exist in job ${req.params.jobId}.`,
      });
      return;
    }

    const result = generateImplementationPromptPackages(
      job,
      specTree,
      parsed.request,
      {
        now: deps.now,
        store: jobStore,
      }
    );

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.get("/jobs/:jobId/prompt-packages", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseImplementationPromptPackageFilters(req.query);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint implementation prompt package filters.",
        message: parsed.message,
      });
      return;
    }

    res.json({
      job,
      specTree,
      promptPackages: filterImplementationPromptPackages(
        extractImplementationPromptPackages(job),
        parsed.filters
      ),
    });
  });

  router.post("/jobs/:jobId/engineering-landing", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseGenerateEngineeringLandingPlansRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint engineering landing request.",
        message: parsed.message,
      });
      return;
    }

    const result = generateEngineeringLandingPlans(
      job,
      specTree,
      parsed.request,
      {
        now: deps.now,
        store: jobStore,
      }
    );

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.get("/jobs/:jobId/engineering-landing", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    res.json({
      job,
      specTree,
      engineeringLandingPlans: extractEngineeringLandingPlans(job),
    } satisfies BlueprintEngineeringLandingPlansResponse);
  });

  router.post("/jobs/:jobId/engineering-runs", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseRecordEngineeringRunRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint engineering run request.",
        message: parsed.message,
      });
      return;
    }

    const result = recordEngineeringRun(job, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.get("/jobs/:jobId/engineering-runs", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.json({
      job,
      engineeringLandingPlans: extractEngineeringLandingPlans(job),
      engineeringRuns: extractEngineeringRuns(job),
    } satisfies BlueprintEngineeringRunsResponse);
  });

  router.get("/jobs/:jobId/artifact-ledger", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.json({
      job,
      entries: buildArtifactLedger(job),
    } satisfies BlueprintArtifactLedgerResponse);
  });

  router.post("/jobs/:jobId/artifact-replay", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseCreateArtifactReplayRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint artifact replay request.",
        message: parsed.message,
      });
      return;
    }

    const response = createArtifactReplaySnapshot(job, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    res.status(201).json(response);
  });

  const handleResetRouteSelection = (req: Request, res: Response) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const routeSet = extractRouteSet(job);
    if (!routeSet) {
      res.status(404).json({
        error: "Blueprint RouteSet not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a RouteSet artifact yet.`,
      });
      return;
    }

    const result = resetRouteSelection(job, routeSet, {
      now: deps.now,
      store: jobStore,
    });

    res.json(result);
  };

  router.delete("/jobs/:jobId/route-selection", handleResetRouteSelection);
  router.delete("/generations/:jobId/route-selection", handleResetRouteSelection);

  router.get("/jobs/:jobId/artifact-replays", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    res.json({
      job,
      replays: extractArtifactReplays(job),
    } satisfies BlueprintArtifactReplaysResponse);
  });

  router.post("/jobs/:jobId/artifact-diff", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseArtifactDiffRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint artifact diff request.",
        message: parsed.message,
      });
      return;
    }

    const result = compareArtifactLedgerEntries(job, parsed.request);
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.json(result.response);
  });

  router.post("/jobs/:jobId/artifact-feedback", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const parsed = parseArtifactFeedbackRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint artifact feedback request.",
        message: parsed.message,
      });
      return;
    }

    const result = recordArtifactFeedback(job, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    res.status(201).json(result.response);
  });

  router.post(
    "/jobs/:jobId/spec-documents/:documentId/versions",
    (req, res) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) {
        res.status(404).json({
          error: "Blueprint generation job not found.",
          message: `No blueprint generation job exists for ${req.params.jobId}.`,
        });
        return;
      }

      const specTree = extractSpecTree(job);
      if (!specTree) {
        res.status(404).json({
          error: "Blueprint SPEC tree not found.",
          message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
        });
        return;
      }

      const parsed = parseSaveSpecDocumentVersionRequest(req.body);
      if (!parsed.ok) {
        res.status(400).json({
          error: "Invalid blueprint SPEC document version request.",
          message: parsed.message,
        });
        return;
      }

      const result = saveSpecDocumentVersion(
        job,
        specTree,
        req.params.documentId,
        parsed.request,
        {
          now: deps.now,
          store: jobStore,
        }
      );

      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          message: result.message,
        });
        return;
      }

      res.status(201).json(result.response);
    }
  );

  router.patch(
    "/jobs/:jobId/spec-documents/:documentId/review",
    (req, res) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) {
        res.status(404).json({
          error: "Blueprint generation job not found.",
          message: `No blueprint generation job exists for ${req.params.jobId}.`,
        });
        return;
      }

      const specTree = extractSpecTree(job);
      if (!specTree) {
        res.status(404).json({
          error: "Blueprint SPEC tree not found.",
          message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
        });
        return;
      }

      const parsed = parseReviewSpecDocumentRequest(req.body);
      if (!parsed.ok) {
        res.status(400).json({
          error: "Invalid blueprint SPEC document review request.",
          message: parsed.message,
        });
        return;
      }

      const result = reviewSpecDocument(
        job,
        specTree,
        req.params.documentId,
        parsed.request,
        {
          now: deps.now,
          store: jobStore,
        }
      );

      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          message: result.message,
        });
        return;
      }

      res.json(result.response);
    }
  );

  router.patch("/jobs/:jobId/spec-tree/nodes/:nodeId", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseUpdateSpecTreeNodeRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint SPEC tree node update.",
        message: parsed.message,
      });
      return;
    }

    const updateResult = updateSpecTreeNode(
      job,
      specTree,
      req.params.nodeId,
      parsed.request,
      {
        now: deps.now,
        store: jobStore,
      }
    );

    if (!updateResult.ok) {
      res.status(updateResult.status).json({
        error: updateResult.error,
        message: updateResult.message,
      });
      return;
    }

    res.json(updateResult.response);
  });

  router.post("/jobs/:jobId/spec-tree/actions", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseSpecTreeActionRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint SPEC tree action.",
        message: parsed.message,
      });
      return;
    }

    const actionResult = runSpecTreeAction(job, specTree, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    if (!actionResult.ok) {
      res.status(actionResult.status).json({
        error: actionResult.error,
        message: actionResult.message,
      });
      return;
    }

    res.json(actionResult.response);
  });

  router.post("/jobs/:jobId/spec-tree/versions", (req, res) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: "Blueprint generation job not found.",
        message: `No blueprint generation job exists for ${req.params.jobId}.`,
      });
      return;
    }

    const specTree = extractSpecTree(job);
    if (!specTree) {
      res.status(404).json({
        error: "Blueprint SPEC tree not found.",
        message: `Blueprint generation job ${req.params.jobId} does not have a SPEC tree artifact yet.`,
      });
      return;
    }

    const parsed = parseSaveSpecTreeVersionRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Invalid blueprint SPEC tree version request.",
        message: parsed.message,
      });
      return;
    }

    const response = saveSpecTreeVersion(job, specTree, parsed.request, {
      now: deps.now,
      store: jobStore,
    });

    res.status(201).json(response);
  });

  router.get("/jobs/:jobId", handleJobDetails);

  return router;
}

export async function collectBlueprintSpecs(
  deps: BlueprintRouterDeps = {}
): Promise<BlueprintSpecsResponse> {
  const specsRoot = path.resolve(deps.specsRoot ?? ".kiro/specs");
  const names = await listBlueprintSpecNames(specsRoot);
  const specs = await Promise.all(
    names.map((name, index) => readBlueprintSpec(specsRoot, name, index))
  );

  specs.sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  );

  return {
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    root: displayPath(specsRoot),
    totalSpecs: specs.length,
    totalDocs: specs.reduce((sum, spec) => sum + countDocs(spec.docs), 0),
    completedTasks: specs.reduce(
      (sum, spec) => sum + spec.taskStats.completed,
      0
    ),
    totalTasks: specs.reduce((sum, spec) => sum + spec.taskStats.total, 0),
    specs,
  };
}

type ParseGenerationRequestResult =
  | { ok: true; request: BlueprintGenerationRequest }
  | { ok: false; message: string };

interface CreateGenerationJobOptions {
  now?: () => Date;
  store: BlueprintJobStore;
  context?: BlueprintProjectDomainContext;
  intake?: BlueprintIntake;
  clarificationSession?: BlueprintClarificationSession;
}

type ParseIntakeRequestResult =
  | { ok: true; request: BlueprintIntakeRequest }
  | { ok: false; message: string };

type ParseClarificationAnswersRequestResult =
  | { ok: true; request: { answers: BlueprintClarificationAnswer[] } }
  | { ok: false; message: string };

type ResolveGenerationRequestResult =
  | {
      ok: true;
      request: BlueprintGenerationRequest;
      intake?: BlueprintIntake;
      clarificationSession?: BlueprintClarificationSession;
      context?: BlueprintProjectDomainContext;
    }
  | { ok: false; status: number; error: string; message: string };

function parseIntakeRequest(body: unknown): ParseIntakeRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const targetText = readString(body.targetText ?? body.goal ?? body.input);
  const githubUrls = readGithubUrlInputs(body.githubUrls, body.githubUrl);
  const domainNotes = normalizeStringList(body.domainNotes);

  if (!targetText && githubUrls.length === 0 && domainNotes.length === 0) {
    return {
      ok: false,
      message: "Provide targetText, at least one GitHub URL, or domainNotes.",
    };
  }

  return {
    ok: true,
    request: {
      projectId: readString(body.projectId),
      sourceId: readString(body.sourceId),
      targetText,
      githubUrls,
      domainNotes,
    },
  };
}

function createBlueprintIntake(
  request: BlueprintIntakeRequest,
  options: { now?: () => Date; stores: BlueprintIntakeStores }
): BlueprintIntake {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const intakeId = createId("blueprint-intake");
  const parsedSources = parseGithubSources(request.githubUrls ?? []);
  const evidence = buildIntakeEvidence(request, parsedSources.sources, createdAt);
  const assets = buildIntakeAssets(request, parsedSources.sources, evidence, createdAt);
  const intake: BlueprintIntake = {
    id: intakeId,
    projectId: request.projectId,
    sourceId: request.sourceId,
    targetText: request.targetText,
    githubUrls: parsedSources.sources.map(source => source.normalizedUrl),
    sources: parsedSources.sources,
    duplicateGithubUrls: parsedSources.duplicates,
    domainNotes: request.domainNotes ?? [],
    assets,
    evidence,
    readiness: calculateIntakeReadiness(request, parsedSources.sources),
    createdAt,
    updatedAt: createdAt,
  };

  options.stores.intakes.set(intake.id, intake);
  if (intake.projectId) {
    upsertProjectContext(intake.projectId, intake, options.stores, createdAt);
  }

  return intake;
}

function createClarificationSession(
  intake: BlueprintIntake,
  options: { now?: () => Date; stores: BlueprintIntakeStores }
): BlueprintClarificationSession {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const questions = buildClarificationQuestions(intake);
  const session: BlueprintClarificationSession = {
    id: createId("blueprint-clarification"),
    intakeId: intake.id,
    projectId: intake.projectId,
    questions,
    answers: [],
    readiness: calculateClarificationReadiness(questions, []),
    createdAt,
    updatedAt: createdAt,
  };

  options.stores.clarificationSessions.set(session.id, session);
  return session;
}

function parseClarificationAnswersRequest(
  body: unknown
): ParseClarificationAnswersRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const answers = normalizeClarifications(
    Array.isArray(body.answers) ? body.answers : [body]
  );
  if (answers.length === 0) {
    return {
      ok: false,
      message: "Provide at least one clarification answer.",
    };
  }

  return {
    ok: true,
    request: { answers },
  };
}

function updateClarificationSession(
  session: BlueprintClarificationSession,
  answers: BlueprintClarificationAnswer[],
  options: { now?: () => Date; stores: BlueprintIntakeStores }
): BlueprintClarificationSession {
  const updatedAt = (options.now?.() ?? new Date()).toISOString();
  const knownQuestionIds = new Set(session.questions.map(question => question.id));
  const answerByQuestionId = new Map(
    session.answers.map(answer => [answer.questionId, answer])
  );

  for (const answer of answers) {
    if (!knownQuestionIds.has(answer.questionId)) continue;
    answerByQuestionId.set(answer.questionId, answer);
  }

  const nextAnswers = [...answerByQuestionId.values()];
  const updated: BlueprintClarificationSession = {
    ...session,
    answers: nextAnswers,
    readiness: calculateClarificationReadiness(session.questions, nextAnswers),
    updatedAt,
  };

  options.stores.clarificationSessions.set(updated.id, updated);
  if (updated.projectId) {
    const intake = options.stores.intakes.get(updated.intakeId);
    if (intake) {
      const answerEvidence = buildClarificationEvidence(updated, updatedAt);
      const answerAssets = buildClarificationAssets(
        updated,
        answerEvidence,
        updatedAt
      );
      const context = upsertProjectContext(
        updated.projectId,
        {
          ...intake,
          assets: intake.assets.concat(answerAssets),
          evidence: intake.evidence.concat(answerEvidence),
          updatedAt,
        },
        options.stores,
        updatedAt
      );
      options.stores.projectContexts.set(updated.projectId, context);
    }
  }

  return updated;
}

function resolveGenerationRequest(
  request: BlueprintGenerationRequest,
  stores: BlueprintIntakeStores
): ResolveGenerationRequestResult {
  const intake = request.intakeId ? stores.intakes.get(request.intakeId) : undefined;
  if (request.intakeId && !intake) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint intake not found.",
      message: `No blueprint intake exists for ${request.intakeId}.`,
    };
  }

  const clarificationSession = request.clarificationSessionId
    ? stores.clarificationSessions.get(request.clarificationSessionId)
    : undefined;
  if (request.clarificationSessionId && !clarificationSession) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint clarification session not found.",
      message: `No blueprint clarification session exists for ${request.clarificationSessionId}.`,
    };
  }

  if (
    intake &&
    clarificationSession &&
    clarificationSession.intakeId !== intake.id
  ) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint intake/session mismatch.",
      message: `Clarification session ${clarificationSession.id} does not belong to intake ${intake.id}.`,
    };
  }

  const context = intake?.projectId
    ? stores.projectContexts.get(intake.projectId)
    : undefined;
  const requestClarifications = mergeClarificationAnswers(
    request.clarifications ?? [],
    clarificationSession?.answers ?? []
  );
  const resolved: BlueprintGenerationRequest = {
    ...request,
    projectId: request.projectId ?? intake?.projectId,
    sourceId: request.sourceId ?? intake?.sourceId,
    targetText: request.targetText ?? intake?.targetText,
    githubUrls: uniqueStrings([
      ...(intake?.githubUrls ?? []),
      ...(request.githubUrls ?? []),
    ]),
    clarifications: requestClarifications,
    domainContext: context,
  };

  if (!resolved.targetText && (resolved.githubUrls?.length ?? 0) === 0) {
    return {
      ok: false,
      status: 400,
      error: "Invalid blueprint generation request.",
      message: "Resolved intake does not include targetText or GitHub URLs.",
    };
  }

  return {
    ok: true,
    request: resolved,
    intake,
    clarificationSession,
    context,
  };
}

function parseGenerationRequest(body: unknown): ParseGenerationRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const githubUrls = normalizeGithubUrls(body.githubUrls, body.githubUrl);
  const targetText = readString(body.targetText ?? body.goal ?? body.input);
  const intakeId = readString(body.intakeId);
  const clarificationSessionId = readString(body.clarificationSessionId);
  if (!targetText && githubUrls.length === 0 && !intakeId) {
    return {
      ok: false,
      message: "Provide targetText or at least one GitHub URL.",
    };
  }

  return {
    ok: true,
    request: {
      projectId: readString(body.projectId),
      sourceId: readString(body.sourceId),
      version: readString(body.version) ?? "blueprint-generation/v1",
      mode: "autopilot_route",
      intakeId,
      clarificationSessionId,
      targetText,
      githubUrls,
      clarifications: normalizeClarifications(body.clarifications),
    },
  };
}

export function createGenerationJob(
  request: BlueprintGenerationRequest,
  options: CreateGenerationJobOptions
): BlueprintCreateGenerationJobResponse {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const jobId = createId("blueprint-job");
  const events: BlueprintGenerationEvent[] = [
    createGenerationEvent({
      jobId,
      stage: "input",
      status: "pending",
      type: "job.created",
      message: "Blueprint generation job accepted.",
      occurredAt: createdAt,
    }),
    createGenerationEvent({
      jobId,
      stage: "route_generation",
      status: "running",
      type: "job.stage",
      message: "Generating primary and alternative autopilot routes.",
      occurredAt: createdAt,
    }),
  ];
  const routeSet = buildRouteSet(request, jobId, createdAt);
  const routeArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "route_set",
    title: "Autopilot RouteSet",
    summary:
      "Primary and alternative routes prepared for SPEC tree derivation.",
    createdAt,
    payload: routeSet,
  };
  const contextArtifacts = buildGenerationContextArtifacts({
    createdAt,
    intake: options.intake,
    clarificationSession: options.clarificationSession,
    context: options.context,
  });

  events.push(
    createGenerationEvent({
      jobId,
      stage: "route_generation",
      status: "completed",
      type: "job.completed",
      message: "RouteSet generated and ready for SPEC tree derivation.",
      occurredAt: createdAt,
      payload: { routeSetId: routeSet.id },
    })
  );

  const job: BlueprintGenerationJob = {
    id: jobId,
    request,
    status: "completed",
    stage: "route_generation",
    projectId: request.projectId,
    sourceId: request.sourceId,
    version: request.version ?? "blueprint-generation/v1",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    artifacts: [...contextArtifacts, routeArtifact],
    events,
  };

  options.store.save(job);

  return {
    job,
    routeSet,
    intake: options.intake,
    clarificationSession: options.clarificationSession,
    projectContext: options.context,
  };
}

function buildRouteSet(
  request: BlueprintGenerationRequest,
  requestId: string,
  createdAt: string
): BlueprintRouteSet {
  const routeSetId = createId("blueprint-routeset");
  const primaryRouteId = `${routeSetId}:primary`;
  const targetLabel = summarizeRequestTarget(request);
  const hasGithub = (request.githubUrls?.length ?? 0) > 0;

  return {
    id: routeSetId,
    requestId,
    createdAt,
    primaryRouteId,
    routes: [
      buildRouteCandidate({
        id: primaryRouteId,
        kind: "primary",
        title: "Primary SPEC asset route",
        summary: `Clarify ${targetLabel}, derive the durable SPEC tree, then expand documents, preview, and implementation prompts.`,
        rationale:
          "Balances product clarification, architecture analysis, and asset persistence so the selected path can become the long-lived SPEC tree.",
        riskLevel: "medium",
        costLevel: "medium",
        complexity: "balanced",
        estimatedEffort: hasGithub
          ? "2-4 analysis passes"
          : "1-3 analysis passes",
        includeGithubStep: hasGithub,
      }),
      buildRouteCandidate({
        id: `${routeSetId}:alternative-docs-first`,
        kind: "alternative",
        title: "Documentation-first conservative route",
        summary:
          "Create a narrower SPEC tree first, freeze requirements/design/tasks, then preview and package prompts after review.",
        rationale:
          "Reduces downstream churn when the business boundary is still broad or governance matters more than speed.",
        riskLevel: "low",
        costLevel: "low",
        complexity: "light",
        estimatedEffort: "1-2 review passes",
        includeGithubStep: hasGithub,
      }),
      buildRouteCandidate({
        id: `${routeSetId}:alternative-preview-first`,
        kind: "alternative",
        title: "Preview-first exploratory route",
        summary:
          "Push route analysis toward effect preview early, then backfill SPEC documents from the selected prototype direction.",
        rationale:
          "Useful when the user needs to see the future system effect before locking detailed specifications.",
        riskLevel: "high",
        costLevel: "high",
        complexity: "deep",
        estimatedEffort: "3-5 exploration passes",
        includeGithubStep: hasGithub,
      }),
    ],
    nextAsset: {
      type: "spec_tree",
      menu: "deduction",
      description:
        "Use the selected RouteSet path as the source asset for the Deduction menu and SPEC tree workbench.",
    },
    provenance: {
      projectId: request.projectId,
      sourceId: request.sourceId,
      targetText: request.targetText,
      githubUrls: request.githubUrls ?? [],
    },
  };
}

function buildGenerationContextArtifacts(input: {
  createdAt: string;
  intake?: BlueprintIntake;
  clarificationSession?: BlueprintClarificationSession;
  context?: BlueprintProjectDomainContext;
}): BlueprintGenerationArtifact[] {
  const artifacts: BlueprintGenerationArtifact[] = [];

  if (input.intake) {
    artifacts.push({
      id: createId("blueprint-artifact"),
      type: "intake",
      title: "Blueprint Intake",
      summary: "Normalized target input and GitHub sources captured before route generation.",
      createdAt: input.createdAt,
      payload: input.intake,
    });

    for (const source of input.intake.sources) {
      artifacts.push({
        id: createId("blueprint-artifact"),
        type: "github_source",
        title: `GitHub Source: ${source.owner}/${source.repo}`,
        summary: `Repository source normalized from ${source.normalizedUrl}.`,
        createdAt: input.createdAt,
        payload: source,
      });
    }
  }

  if (input.clarificationSession) {
    artifacts.push({
      id: createId("blueprint-artifact"),
      type: "clarification_session",
      title: "Clarification Session",
      summary: `${input.clarificationSession.readiness.answeredRequired}/${input.clarificationSession.readiness.requiredTotal} required clarification answers recorded.`,
      createdAt: input.createdAt,
      payload: input.clarificationSession,
    });
  }

  if (input.context) {
    artifacts.push({
      id: createId("blueprint-artifact"),
      type: "project_context",
      title: "Project Domain Context",
      summary: `${input.context.assets.length} domain assets and ${input.context.evidence.length} evidence items available for routing.`,
      createdAt: input.createdAt,
      payload: input.context,
    });
  }

  return artifacts;
}

function buildRouteCandidate(input: {
  id: string;
  kind: "primary" | "alternative";
  title: string;
  summary: string;
  rationale: string;
  riskLevel: BlueprintRouteRiskLevel;
  costLevel: BlueprintRouteCostLevel;
  complexity: BlueprintRouteComplexity;
  estimatedEffort: string;
  includeGithubStep: boolean;
}): BlueprintRouteCandidate {
  const steps = buildRouteSteps(input.includeGithubStep);

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    rationale: input.rationale,
    riskLevel: input.riskLevel,
    costLevel: input.costLevel,
    complexity: input.complexity,
    estimatedEffort: input.estimatedEffort,
    capabilities: buildCapabilityUsage(input.includeGithubStep),
    steps,
    outputs: [
      "RouteSet outline",
      "Decision evidence",
      "SPEC tree seed",
      "Architecture notes",
      "Implementation prompt seed",
    ],
  };
}

function buildRouteSteps(includeGithubStep: boolean): BlueprintRouteStep[] {
  const steps: BlueprintRouteStep[] = [
    {
      id: "clarify-intent",
      title: "Clarify execution intent",
      description:
        "Collect target users, product boundary, constraints, and success criteria before route choice.",
      role: "Product strategist",
      status: "ready",
    },
  ];

  if (includeGithubStep) {
    steps.push({
      id: "scan-github-source",
      title: "Scan GitHub source",
      description:
        "Inspect repositories and extract technology stack, module boundaries, and reusable assets.",
      role: "Source analyst",
      status: "ready",
    });
  }

  return steps.concat([
    {
      id: "map-capability-pool",
      title: "Map capability pool",
      description:
        "Choose Docker, MCP, skills, AIGC nodes, and specialist roles for analysis coverage.",
      role: "Orchestrator",
      status: "ready",
    },
    {
      id: "derive-spec-tree-seed",
      title: "Derive SPEC tree seed",
      description:
        "Transform primary and alternative route nodes into an editable SPEC tree asset.",
      role: "SPEC curator",
      status: "pending",
    },
    {
      id: "plan-preview-and-prompts",
      title: "Plan previews and prompts",
      description:
        "Prepare the downstream effect preview, architecture diagram, and implementation prompt package.",
      role: "Preview planner",
      status: "pending",
    },
  ]);
}

function buildCapabilityUsage(
  includeGithubStep: boolean
): BlueprintCapabilityUsage[] {
  const capabilities: BlueprintCapabilityUsage[] = [
    {
      id: "role-product-strategy",
      label: "Product strategy role",
      kind: "role",
      purpose: "Clarify user intent, boundaries, and acceptance signals.",
    },
    {
      id: "role-system-architecture",
      label: "System architecture role",
      kind: "role",
      purpose: "Shape modules, dependencies, and engineering landing risks.",
    },
    {
      id: "docker-analysis-sandbox",
      label: "Docker analysis sandbox",
      kind: "docker",
      purpose:
        "Run repository inspection and artifact generation in isolation.",
    },
    {
      id: "skill-svg-architecture",
      label: "SVG architecture skill",
      kind: "skill",
      purpose: "Produce architecture diagrams and route evidence artifacts.",
    },
    {
      id: "aigc-spec-node",
      label: "AIGC SPEC derivation node",
      kind: "aigc_node",
      purpose: "Turn route nodes into SPEC tree candidates.",
    },
  ];

  if (includeGithubStep) {
    capabilities.unshift({
      id: "mcp-github-source",
      label: "GitHub source reader",
      kind: "mcp",
      purpose: "Read repository context before route generation.",
    });
  }

  return capabilities;
}

function getDefaultRuntimeCapabilities(): BlueprintRuntimeCapability[] {
  return [
    {
      id: "docker-analysis-sandbox",
      label: "Docker analysis sandbox",
      kind: "docker",
      purpose: "Run isolated repository analysis and deterministic command previews.",
      description:
        "Sandboxed container adapter for blueprint runtime inspection without host writes.",
      tags: ["runtime", "sandbox", "analysis"],
      securityLevel: "sandboxed",
      status: "available",
      adapter: "blueprint.runtime.docker.simulated",
      inputSchema: "text/plain",
      outputTypes: ["log", "document"],
      supportedStages: ["route_generation", "spec_tree", "runtime_capability"],
      requiresApproval: false,
      projectScoped: true,
    },
    {
      id: "mcp-github-source",
      label: "GitHub source reader",
      kind: "mcp",
      purpose: "Read network-backed repository context through an MCP adapter.",
      description:
        "Networked MCP source adapter used when blueprint execution needs external repository context.",
      tags: ["runtime", "mcp", "github"],
      securityLevel: "networked",
      status: "requires_approval",
      adapter: "blueprint.runtime.mcp.github.simulated",
      inputSchema: "application/json",
      outputTypes: ["document", "log"],
      supportedStages: ["route_generation", "runtime_capability"],
      requiresApproval: true,
      projectScoped: true,
    },
    {
      id: "skill-svg-architecture",
      label: "SVG architecture skill",
      kind: "skill",
      purpose: "Produce architecture diagram evidence from SPEC and preview inputs.",
      description:
        "Readonly skill adapter that summarizes architecture relationships as deterministic diagram evidence.",
      tags: ["runtime", "skill", "diagram"],
      securityLevel: "readonly",
      status: "available",
      adapter: "blueprint.runtime.skill.svg-architecture.simulated",
      inputSchema: "text/markdown",
      outputTypes: ["diagram", "document"],
      supportedStages: ["effect_preview", "runtime_capability"],
      requiresApproval: false,
      projectScoped: false,
    },
    {
      id: "aigc-spec-node",
      label: "AIGC SPEC derivation node",
      kind: "aigc_node",
      purpose: "Derive SPEC node alternatives and evidence summaries.",
      description:
        "Sandboxed AIGC node adapter for deterministic SPEC derivation simulations.",
      tags: ["runtime", "aigc", "spec"],
      securityLevel: "sandboxed",
      status: "available",
      adapter: "blueprint.runtime.aigc.spec-node.simulated",
      inputSchema: "text/plain",
      outputTypes: ["analysis", "document"],
      supportedStages: ["spec_tree", "runtime_capability"],
      requiresApproval: false,
      projectScoped: true,
    },
    {
      id: "role-system-architecture",
      label: "System architecture role",
      kind: "role",
      purpose: "Evaluate architecture risks, handoff readiness, and role coverage.",
      description:
        "Readonly specialist role adapter for runtime capability review and execution planning.",
      tags: ["runtime", "role", "architecture"],
      securityLevel: "readonly",
      status: "available",
      adapter: "blueprint.runtime.role.system-architecture.simulated",
      inputSchema: "text/plain",
      outputTypes: ["analysis", "safety"],
      supportedStages: [
        "route_generation",
        "prompt_packaging",
        "runtime_capability",
        "engineering_landing",
      ],
      requiresApproval: false,
      projectScoped: false,
    },
  ];
}

function createGenerationEvent(input: {
  jobId: string;
  type: BlueprintGenerationEvent["type"];
  stage: BlueprintGenerationStage;
  status: BlueprintGenerationStatus;
  message: string;
  occurredAt: string;
  payload?: unknown;
}): BlueprintGenerationEvent {
  return {
    id: createId("blueprint-event"),
    jobId: input.jobId,
    type: input.type,
    stage: input.stage,
    status: input.status,
    message: input.message,
    occurredAt: input.occurredAt,
    payload: input.payload,
  };
}

function extractRouteSet(
  job: BlueprintGenerationJob
): BlueprintRouteSet | undefined {
  const artifact = job.artifacts.find(item => item.type === "route_set");
  return artifact?.payload as BlueprintRouteSet | undefined;
}

function extractRouteSelection(
  job: BlueprintGenerationJob
): BlueprintRouteSelection | undefined {
  const artifact = job.artifacts.find(item => item.type === "route_selection");
  return artifact?.payload as BlueprintRouteSelection | undefined;
}

function extractSpecTree(
  job: BlueprintGenerationJob
): BlueprintSpecTree | undefined {
  const artifact = job.artifacts.find(item => item.type === "spec_tree");
  return artifact?.payload as BlueprintSpecTree | undefined;
}

function extractSpecTreeVersions(
  job: BlueprintGenerationJob
): BlueprintSpecTreeVersionSnapshot[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "spec_tree_version";
        payload: BlueprintSpecTreeVersionSnapshot;
      } => artifact.type === "spec_tree_version"
    )
    .map(artifact => artifact.payload as BlueprintSpecTreeVersionSnapshot)
    .filter((version): version is BlueprintSpecTreeVersionSnapshot =>
      isPlainRecord(version)
    )
    .sort((left, right) => left.version - right.version);
}

function extractSpecDocuments(
  job: BlueprintGenerationJob
): BlueprintSpecDocument[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: BlueprintSpecDocumentType;
        payload: BlueprintSpecDocument;
      } =>
        SPEC_DOCUMENT_TYPES.includes(artifact.type as BlueprintSpecDocumentType)
    )
    .map(artifact => artifact.payload as BlueprintSpecDocument)
    .filter((document): document is BlueprintSpecDocument =>
      isPlainRecord(document)
    )
    .sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) ||
        left.type.localeCompare(right.type)
    );
}

function extractSpecDocumentVersions(
  job: BlueprintGenerationJob
): BlueprintSpecDocumentVersionSnapshot[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "spec_document_version";
        payload: BlueprintSpecDocumentVersionSnapshot;
      } => artifact.type === "spec_document_version"
    )
    .map(artifact => artifact.payload as BlueprintSpecDocumentVersionSnapshot)
    .filter((version): version is BlueprintSpecDocumentVersionSnapshot =>
      isPlainRecord(version)
    )
    .sort(
      (left, right) =>
        left.sourceDocumentId.localeCompare(right.sourceDocumentId) ||
        left.version - right.version
    );
}

function extractEffectPreviews(job: BlueprintGenerationJob): BlueprintEffectPreview[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "effect_preview";
        payload: BlueprintEffectPreview;
      } => artifact.type === "effect_preview"
    )
    .map(artifact => artifact.payload as BlueprintEffectPreview)
    .filter((effectPreview): effectPreview is BlueprintEffectPreview =>
      isPlainRecord(effectPreview)
    )
    .sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) ||
        left.createdAt.localeCompare(right.createdAt)
    );
}

function extractImplementationPromptPackages(
  job: BlueprintGenerationJob
): BlueprintImplementationPromptPackage[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "prompt_pack";
        payload: BlueprintImplementationPromptPackage;
      } => artifact.type === "prompt_pack"
    )
    .map(artifact => artifact.payload as BlueprintImplementationPromptPackage)
    .filter(
      (
        promptPackage
      ): promptPackage is BlueprintImplementationPromptPackage =>
        isPlainRecord(promptPackage) &&
        typeof promptPackage.id === "string" &&
        typeof promptPackage.createdAt === "string" &&
        Array.isArray(promptPackage.nodeIds) &&
        Array.isArray(promptPackage.sourceDocumentIds) &&
        Array.isArray(promptPackage.sourcePreviewIds) &&
        isImplementationPromptTargetPlatform(promptPackage.targetPlatform)
    )
    .sort(
      (left, right) =>
        left.targetPlatform.localeCompare(right.targetPlatform) ||
        left.createdAt.localeCompare(right.createdAt)
    );
}

function extractEngineeringLandingPlans(
  job: BlueprintGenerationJob
): BlueprintEngineeringLandingPlan[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "engineering_plan";
        payload: BlueprintEngineeringLandingPlan;
      } => artifact.type === "engineering_plan"
    )
    .map(artifact => artifact.payload as BlueprintEngineeringLandingPlan)
    .filter(isEngineeringLandingPlanPayload)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.promptPackageIds.join("|").localeCompare(
          right.promptPackageIds.join("|")
        )
    );
}

function extractEngineeringRuns(
  job: BlueprintGenerationJob
): BlueprintEngineeringRun[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "engineering_run";
        payload: BlueprintEngineeringRun;
      } => artifact.type === "engineering_run"
    )
    .map(artifact => artifact.payload as BlueprintEngineeringRun)
    .filter(isEngineeringRunPayload)
    .sort(
      (left, right) =>
        (left.startedAt ?? left.completedAt ?? "").localeCompare(
          right.startedAt ?? right.completedAt ?? ""
        ) || left.id.localeCompare(right.id)
    );
}

function extractRuntimeCapabilities(
  job: BlueprintGenerationJob
): BlueprintRuntimeCapability[] {
  const registry = job.artifacts
    .filter(artifact => artifact.type === "capability_registry")
    .map(artifact => artifact.payload)
    .find(isCapabilityRegistryPayload);

  return registry?.capabilities ?? getDefaultRuntimeCapabilities();
}

function extractCapabilityInvocations(
  job: BlueprintGenerationJob
): BlueprintCapabilityInvocation[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "capability_invocation";
        payload: BlueprintCapabilityInvocation;
      } => artifact.type === "capability_invocation"
    )
    .map(artifact => artifact.payload as BlueprintCapabilityInvocation)
    .filter(isCapabilityInvocationPayload)
    .sort(
      (left, right) =>
        left.requestedAt.localeCompare(right.requestedAt) ||
        left.id.localeCompare(right.id)
    );
}

function extractCapabilityEvidence(
  job: BlueprintGenerationJob
): BlueprintCapabilityEvidence[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "capability_evidence";
        payload: BlueprintCapabilityEvidence;
      } => artifact.type === "capability_evidence"
    )
    .map(artifact => artifact.payload as BlueprintCapabilityEvidence)
    .filter(isCapabilityEvidencePayload)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

function extractArtifactReplays(
  job: BlueprintGenerationJob
): BlueprintArtifactReplaySnapshot[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "replay";
        payload: BlueprintArtifactReplaySnapshot;
      } => artifact.type === "replay"
    )
    .map(artifact => artifact.payload as BlueprintArtifactReplaySnapshot)
    .filter(isArtifactReplaySnapshotPayload)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

function extractArtifactFeedback(
  job: BlueprintGenerationJob
): BlueprintArtifactFeedback[] {
  return job.artifacts
    .filter(
      (artifact): artifact is BlueprintGenerationArtifact & {
        type: "feedback";
        payload: BlueprintArtifactFeedback;
      } => artifact.type === "feedback"
    )
    .map(artifact => artifact.payload as BlueprintArtifactFeedback)
    .filter(isArtifactFeedbackPayload)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

const BLUEPRINT_GENERATION_STAGES: BlueprintGenerationStage[] = [
  "input",
  "clarification",
  "route_generation",
  "spec_tree",
  "spec_docs",
  "effect_preview",
  "prompt_packaging",
  "runtime_capability",
  "engineering_landing",
];

function buildArtifactLedger(
  job: BlueprintGenerationJob
): BlueprintArtifactMemoryEntry[] {
  const artifactEntries = job.artifacts.map((artifact, index) =>
    buildArtifactMemoryEntryFromArtifact(job, artifact, index)
  );
  const eventEntries = job.events.map((event, index) =>
    buildArtifactMemoryEntryFromEvent(job, event, index)
  );

  return artifactEntries
    .concat(eventEntries)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.artifactId.localeCompare(right.artifactId)
    );
}

function buildArtifactMemoryEntryFromArtifact(
  job: BlueprintGenerationJob,
  artifact: BlueprintGenerationArtifact,
  index: number
): BlueprintArtifactMemoryEntry {
  const payload = isPlainRecord(artifact.payload) ? artifact.payload : {};
  const stage = inferArtifactStage(artifact.type, payload);

  return {
    id: `blueprint-ledger-${artifact.id}`,
    jobId: job.id,
    artifactId: artifact.id,
    artifactType: artifact.type,
    stage,
    title: artifact.title,
    summary: artifact.summary,
    createdAt: artifact.createdAt,
    sourceIds: collectArtifactSourceIds(artifact.type, payload),
    version: readArtifactVersion(payload, index),
    tags: buildArtifactLedgerTags(artifact.type, stage, payload),
    payloadSummary: summarizeArtifactPayload(payload),
  };
}

function buildArtifactMemoryEntryFromEvent(
  job: BlueprintGenerationJob,
  event: BlueprintGenerationEvent,
  index: number
): BlueprintArtifactMemoryEntry {
  const payload = isPlainRecord(event.payload) ? event.payload : {};

  return {
    id: `blueprint-ledger-${event.id}`,
    jobId: job.id,
    artifactId: event.id,
    artifactType: "event",
    stage: event.stage,
    title: event.message,
    summary: `${event.type} / ${event.status}`,
    createdAt: event.occurredAt,
    sourceIds: collectArtifactSourceIds("event", payload),
    version: index + 1,
    tags: uniqueStrings(["event", event.type, event.stage, event.status]),
    payloadSummary: summarizeArtifactPayload(payload),
  };
}

function createArtifactReplaySnapshot(
  job: BlueprintGenerationJob,
  request: BlueprintCreateArtifactReplayRequest,
  options: CreateGenerationJobOptions
): BlueprintArtifactReplayResponse {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const ledger = buildArtifactLedger(job);
  const timelineEntries = ledger.map(
    (entry, index): BlueprintArtifactReplayTimelineEntry => ({
      id: `blueprint-replay-timeline-${index + 1}`,
      entryId: entry.id,
      artifactId: entry.artifactId,
      artifactType: entry.artifactType,
      stage: entry.stage,
      title: entry.title,
      summary: entry.summary,
      occurredAt: entry.createdAt,
      tags: entry.tags,
    })
  );
  const replay: BlueprintArtifactReplaySnapshot = {
    id: createId("blueprint-artifact-replay"),
    jobId: job.id,
    createdAt,
    timelineEntries,
    stageCounts: buildArtifactReplayStageCounts(ledger),
    lineageEdges: buildArtifactLineageEdges(ledger),
  };
  const replayArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "replay",
    title: request.title ?? "Artifact replay snapshot",
    summary:
      request.summary ??
      `Replay snapshot containing ${timelineEntries.length} ledger entries.`,
    createdAt,
    payload: replay,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "engineering_landing",
    updatedAt: createdAt,
    artifacts: job.artifacts.concat(replayArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        type: "job.stage",
        stage: "engineering_landing",
        status: "reviewing",
        message: "Artifact replay snapshot created.",
        occurredAt: createdAt,
        payload: {
          replayId: replay.id,
          timelineEntryCount: timelineEntries.length,
          lineageEdgeCount: replay.lineageEdges.length,
          tags: request.tags ?? [],
        },
      })
    ),
  };

  options.store.save(updatedJob);
  return { job: updatedJob, replay };
}

function compareArtifactLedgerEntries(
  job: BlueprintGenerationJob,
  request: BlueprintArtifactDiffRequest
):
  | { ok: true; response: BlueprintArtifactDiffResponse }
  | { ok: false; status: number; error: string; message: string } {
  const entries = buildArtifactLedger(job);
  const left = entries.find(entry => entry.id === request.leftEntryId);
  const right = entries.find(entry => entry.id === request.rightEntryId);

  if (!left || !right) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint artifact ledger entry not found.",
      message: "Both leftEntryId and rightEntryId must match ledger entries.",
    };
  }

  const changedFields = comparePayloadSummaryFields(
    left.payloadSummary,
    right.payloadSummary
  );
  const diff: BlueprintArtifactDiff = {
    id: createId("blueprint-artifact-diff"),
    leftEntryId: left.id,
    rightEntryId: right.id,
    changedFields,
    summary: changedFields.length
      ? `${left.title} differs from ${right.title} across ${changedFields.length} payload field(s).`
      : `${left.title} and ${right.title} have matching payload summaries.`,
  };

  return {
    ok: true,
    response: {
      job,
      diff,
    },
  };
}

function recordArtifactFeedback(
  job: BlueprintGenerationJob,
  request: BlueprintArtifactFeedbackRequest,
  options: CreateGenerationJobOptions
):
  | { ok: true; response: BlueprintArtifactFeedbackResponse }
  | { ok: false; status: number; error: string; message: string } {
  const ledger = buildArtifactLedger(job);
  const entry = request.entryId
    ? ledger.find(item => item.id === request.entryId)
    : ledger.find(item => item.artifactId === request.artifactId);

  if (!entry) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint artifact ledger entry not found.",
      message: "No ledger entry matches the supplied entryId or artifactId.",
    };
  }

  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const sourceIds = mergeArtifactSourceIds(
    entry.sourceIds,
    request.sourceIds
  );
  const feedback: BlueprintArtifactFeedback = {
    id: createId("blueprint-artifact-feedback"),
    jobId: job.id,
    entryId: entry.id,
    artifactId: entry.artifactId,
    artifactType: entry.artifactType,
    kind: request.kind ?? "feedback",
    message: request.message ?? request.summary ?? "Artifact feedback recorded.",
    summary:
      request.summary ??
      `${request.kind ?? "feedback"} recorded for ${entry.title}.`,
    createdAt,
    createdBy: request.createdBy,
    tags: uniqueStrings([...(entry.tags ?? []), ...(request.tags ?? [])]),
    sourceIds,
    payloadSummary: {
      ...entry.payloadSummary,
      ...(request.payloadSummary ?? {}),
    },
  };
  const feedbackArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "feedback",
    title: `Artifact ${feedback.kind}: ${entry.title}`,
    summary: feedback.summary,
    createdAt,
    payload: feedback,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "engineering_landing",
    updatedAt: createdAt,
    artifacts: job.artifacts.concat(feedbackArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        type: "job.stage",
        stage: "engineering_landing",
        status: "reviewing",
        message: `Artifact ${feedback.kind} recorded.`,
        occurredAt: createdAt,
        payload: {
          feedbackId: feedback.id,
          entryId: entry.id,
          artifactId: entry.artifactId,
          kind: feedback.kind,
        },
      })
    ),
  };

  options.store.save(updatedJob);
  return {
    ok: true,
    response: {
      job: updatedJob,
      feedback,
    },
  };
}

function inferArtifactStage(
  artifactType: BlueprintArtifactMemoryEntry["artifactType"],
  payload: Record<string, unknown>
): BlueprintGenerationStage {
  const payloadStage = readString(payload.stage);
  if (isBlueprintGenerationStage(payloadStage)) {
    return payloadStage;
  }

  if (artifactType === "clarification_session") {
    return "clarification";
  }
  if (
    artifactType === "intake" ||
    artifactType === "github_source" ||
    artifactType === "project_context"
  ) {
    return "input";
  }
  if (artifactType === "route_set" || artifactType === "route_selection") {
    return "route_generation";
  }
  if (artifactType === "spec_tree" || artifactType === "spec_tree_version") {
    return "spec_tree";
  }
  if (
    artifactType === "requirements" ||
    artifactType === "design" ||
    artifactType === "tasks" ||
    artifactType === "spec_document_version"
  ) {
    return "spec_docs";
  }
  if (artifactType === "preview" || artifactType === "effect_preview") {
    return "effect_preview";
  }
  if (artifactType === "prompt_pack") {
    return "prompt_packaging";
  }
  if (
    artifactType === "capability_registry" ||
    artifactType === "capability_invocation" ||
    artifactType === "capability_evidence"
  ) {
    return "runtime_capability";
  }
  if (
    artifactType === "engineering_plan" ||
    artifactType === "engineering_run" ||
    artifactType === "replay" ||
    artifactType === "feedback"
  ) {
    return "engineering_landing";
  }

  return "input";
}

function emptyArtifactSourceIds(): BlueprintArtifactSourceIds {
  return {
    specDocumentIds: [],
    effectPreviewIds: [],
    promptPackageIds: [],
    capabilityInvocationIds: [],
    capabilityEvidenceIds: [],
    landingPlanIds: [],
    engineeringRunIds: [],
    capabilityIds: [],
  };
}

function collectArtifactSourceIds(
  artifactType: BlueprintArtifactMemoryEntry["artifactType"],
  payload: Record<string, unknown>
): BlueprintArtifactSourceIds {
  const explicit = isPlainRecord(payload.sourceIds)
    ? normalizeArtifactSourceIds(payload.sourceIds)
    : emptyArtifactSourceIds();
  const provenance = isPlainRecord(payload.provenance) ? payload.provenance : {};

  const routeSetId =
    readString(explicit.routeSetId) ??
    readString(payload.routeSetId) ??
    (artifactType === "route_set" ? readString(payload.id) : undefined);
  const specTreeId =
    readString(explicit.specTreeId) ??
    readString(payload.specTreeId) ??
    readString(payload.treeId) ??
    (artifactType === "spec_tree" ? readString(payload.id) : undefined);
  const specDocumentIds = uniqueStrings(
    explicit.specDocumentIds.concat(
      normalizeStringList(payload.specDocumentIds),
      normalizeStringList(payload.sourceDocumentIds),
      normalizeStringList(provenance.sourceDocumentIds),
      artifactType === "requirements" ||
        artifactType === "design" ||
        artifactType === "tasks" ||
        artifactType === "spec_document_version"
        ? [readString(payload.id), readString(payload.documentId)].filter(
            isString
          )
        : []
    )
  );
  const effectPreviewIds = uniqueStrings(
    explicit.effectPreviewIds.concat(
      normalizeStringList(payload.effectPreviewIds),
      normalizeStringList(payload.sourcePreviewIds),
      normalizeStringList(provenance.sourcePreviewIds),
      artifactType === "effect_preview" || artifactType === "preview"
        ? [readString(payload.id)].filter(isString)
        : []
    )
  );
  const promptPackageIds = uniqueStrings(
    explicit.promptPackageIds.concat(
      normalizeStringList(payload.promptPackageIds),
      normalizeStringList(provenance.promptPackageIds),
      artifactType === "prompt_pack" ? [readString(payload.id)].filter(isString) : []
    )
  );
  const capabilityInvocationIds = uniqueStrings(
    explicit.capabilityInvocationIds.concat(
      normalizeStringList(payload.capabilityInvocationIds),
      normalizeStringList(provenance.capabilityInvocationIds),
      artifactType === "capability_invocation"
        ? [readString(payload.id)].filter(isString)
        : [readString(payload.invocationId)].filter(isString)
    )
  );
  const capabilityEvidenceIds = uniqueStrings(
    explicit.capabilityEvidenceIds.concat(
      normalizeStringList(payload.capabilityEvidenceIds),
      normalizeStringList(provenance.capabilityEvidenceIds),
      artifactType === "capability_evidence"
        ? [readString(payload.id)].filter(isString)
        : []
    )
  );
  const capabilityIds = uniqueStrings(
    explicit.capabilityIds.concat(
      normalizeStringList(payload.capabilityIds),
      normalizeStringList(provenance.capabilityIds),
      artifactType === "capability_registry"
        ? normalizeStringList(payload.capabilities)
        : [],
      [readString(payload.capabilityId)].filter(isString)
    )
  );
  const landingPlanIds = uniqueStrings(
    explicit.landingPlanIds.concat(
      normalizeStringList(payload.landingPlanIds),
      normalizeStringList(provenance.landingPlanIds),
      artifactType === "engineering_plan"
        ? [readString(payload.id)].filter(isString)
        : [readString(payload.landingPlanId)].filter(isString)
    )
  );
  const engineeringRunIds = uniqueStrings(
    explicit.engineeringRunIds.concat(
      normalizeStringList(payload.engineeringRunIds),
      normalizeStringList(provenance.engineeringRunIds),
      artifactType === "engineering_run"
        ? [readString(payload.id)].filter(isString)
        : []
    )
  );

  return {
    routeSetId,
    specTreeId,
    specDocumentIds,
    effectPreviewIds,
    promptPackageIds,
    capabilityInvocationIds,
    capabilityEvidenceIds,
    landingPlanIds,
    engineeringRunIds,
    capabilityIds,
  };
}

function normalizeArtifactSourceIds(
  value: Record<string, unknown>
): BlueprintArtifactSourceIds {
  return {
    routeSetId: readString(value.routeSetId),
    specTreeId: readString(value.specTreeId),
    specDocumentIds: normalizeStringList(value.specDocumentIds),
    effectPreviewIds: normalizeStringList(value.effectPreviewIds),
    promptPackageIds: normalizeStringList(value.promptPackageIds),
    capabilityInvocationIds: normalizeStringList(value.capabilityInvocationIds),
    capabilityEvidenceIds: normalizeStringList(value.capabilityEvidenceIds),
    landingPlanIds: normalizeStringList(value.landingPlanIds),
    engineeringRunIds: normalizeStringList(value.engineeringRunIds),
    capabilityIds: normalizeStringList(value.capabilityIds),
  };
}

function mergeArtifactSourceIds(
  base: BlueprintArtifactSourceIds,
  override?: Partial<BlueprintArtifactSourceIds>
): BlueprintArtifactSourceIds {
  return {
    routeSetId: override?.routeSetId ?? base.routeSetId,
    specTreeId: override?.specTreeId ?? base.specTreeId,
    specDocumentIds: uniqueStrings(
      base.specDocumentIds.concat(override?.specDocumentIds ?? [])
    ),
    effectPreviewIds: uniqueStrings(
      base.effectPreviewIds.concat(override?.effectPreviewIds ?? [])
    ),
    promptPackageIds: uniqueStrings(
      base.promptPackageIds.concat(override?.promptPackageIds ?? [])
    ),
    capabilityInvocationIds: uniqueStrings(
      base.capabilityInvocationIds.concat(
        override?.capabilityInvocationIds ?? []
      )
    ),
    capabilityEvidenceIds: uniqueStrings(
      base.capabilityEvidenceIds.concat(override?.capabilityEvidenceIds ?? [])
    ),
    landingPlanIds: uniqueStrings(
      base.landingPlanIds.concat(override?.landingPlanIds ?? [])
    ),
    engineeringRunIds: uniqueStrings(
      base.engineeringRunIds.concat(override?.engineeringRunIds ?? [])
    ),
    capabilityIds: uniqueStrings(
      base.capabilityIds.concat(override?.capabilityIds ?? [])
    ),
  };
}

function readArtifactVersion(
  payload: Record<string, unknown>,
  index: number
): number {
  const version = payload.version;
  return typeof version === "number" && Number.isFinite(version)
    ? Math.max(1, Math.trunc(version))
    : index + 1;
}

function buildArtifactLedgerTags(
  artifactType: BlueprintArtifactMemoryEntry["artifactType"],
  stage: BlueprintGenerationStage,
  payload: Record<string, unknown>
): string[] {
  return uniqueStrings(
    [
      artifactType,
      stage,
      readString(payload.status),
      readString(payload.type),
      readString(payload.targetPlatform),
    ].filter(isString)
  );
}

function summarizeArtifactPayload(
  payload: Record<string, unknown>
): BlueprintArtifactPayloadSummary {
  const summary: BlueprintArtifactPayloadSummary = {};
  for (const key of [
    "id",
    "status",
    "type",
    "version",
    "nodeId",
    "treeId",
    "routeSetId",
    "targetPlatform",
    "landingPlanId",
    "capabilityId",
    "invocationId",
    "securityLevel",
  ]) {
    const value = payload[key];
    if (isArtifactPayloadSummaryValue(value)) {
      summary[key] = value;
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      summary[`${key}Count`] = value.length;
    }
  }

  return summary;
}

function buildArtifactReplayStageCounts(
  ledger: BlueprintArtifactMemoryEntry[]
): Record<BlueprintGenerationStage, number> {
  const counts = Object.fromEntries(
    BLUEPRINT_GENERATION_STAGES.map(stage => [stage, 0])
  ) as Record<BlueprintGenerationStage, number>;

  for (const entry of ledger) {
    counts[entry.stage] += 1;
  }

  return counts;
}

function buildArtifactLineageEdges(
  ledger: BlueprintArtifactMemoryEntry[]
): BlueprintArtifactLineageEdge[] {
  const entryByArtifactId = new Map<string, BlueprintArtifactMemoryEntry>();
  for (const entry of ledger) {
    entryByArtifactId.set(entry.artifactId, entry);
    const payloadId = entry.payloadSummary.id;
    if (typeof payloadId === "string") {
      entryByArtifactId.set(payloadId, entry);
    }
  }
  const edges: BlueprintArtifactLineageEdge[] = [];

  for (const entry of ledger) {
    const sources: Array<{
      ids: string[];
      sourceType: BlueprintArtifactLineageEdge["sourceType"];
    }> = [
      {
        ids: entry.sourceIds.routeSetId ? [entry.sourceIds.routeSetId] : [],
        sourceType: "route_set",
      },
      {
        ids: entry.sourceIds.specTreeId ? [entry.sourceIds.specTreeId] : [],
        sourceType: "spec_tree",
      },
      { ids: entry.sourceIds.specDocumentIds, sourceType: "spec_document" },
      { ids: entry.sourceIds.effectPreviewIds, sourceType: "effect_preview" },
      { ids: entry.sourceIds.promptPackageIds, sourceType: "prompt_package" },
      { ids: entry.sourceIds.capabilityIds, sourceType: "capability_registry" },
      {
        ids: entry.sourceIds.capabilityInvocationIds,
        sourceType: "capability_invocation",
      },
      {
        ids: entry.sourceIds.capabilityEvidenceIds,
        sourceType: "capability_evidence",
      },
      { ids: entry.sourceIds.landingPlanIds, sourceType: "landing_plan" },
      { ids: entry.sourceIds.engineeringRunIds, sourceType: "engineering_run" },
    ];

    for (const source of sources) {
      for (const sourceId of source.ids) {
        const fromEntry = entryByArtifactId.get(sourceId);
        if (!fromEntry || fromEntry.id === entry.id) continue;
        edges.push({
          id: `blueprint-lineage-${fromEntry.id}-${entry.id}-${sourceId}`,
          fromEntryId: fromEntry.id,
          toEntryId: entry.id,
          sourceId,
          sourceType: source.sourceType,
          relation: "derived_from",
        });
      }
    }
  }

  return edges;
}

function comparePayloadSummaryFields(
  left: BlueprintArtifactPayloadSummary,
  right: BlueprintArtifactPayloadSummary
): string[] {
  const fields = uniqueStrings(Object.keys(left).concat(Object.keys(right)));
  return fields.filter(
    field => JSON.stringify(left[field]) !== JSON.stringify(right[field])
  );
}

function createJobDetailsPayload(
  job: BlueprintGenerationJob | null
): BlueprintLatestGenerationJobResponse {
  if (!job) {
    return { job: null };
  }

  return {
    job,
    routeSet: extractRouteSet(job),
    selection: extractRouteSelection(job),
    specTree: extractSpecTree(job),
    specDocuments: extractSpecDocuments(job),
    specDocumentVersions: extractSpecDocumentVersions(job),
    effectPreviews: extractEffectPreviews(job),
    promptPackages: extractImplementationPromptPackages(job),
    capabilities: extractRuntimeCapabilities(job),
    capabilityInvocations: extractCapabilityInvocations(job),
    capabilityEvidence: extractCapabilityEvidence(job),
    specTreeVersions: extractSpecTreeVersions(job),
    engineeringLandingPlans: extractEngineeringLandingPlans(job),
    engineeringRuns: extractEngineeringRuns(job),
    artifactLedgerEntries: buildArtifactLedger(job),
    artifactReplays: extractArtifactReplays(job),
    artifactFeedback: extractArtifactFeedback(job),
  };
}

function formatServerSentEvent(
  eventName: string,
  data: unknown,
  id?: string
): string {
  const lines: string[] = [];
  if (id) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${eventName}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

type ParseRouteSelectionRequestResult =
  | { ok: true; request: BlueprintRouteSelectionRequest }
  | { ok: false; message: string };

function parseRouteSelectionRequest(
  body: unknown
): ParseRouteSelectionRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const routeId = readString(body.routeId);
  if (!routeId) {
    return {
      ok: false,
      message: "Provide routeId to select an autopilot route.",
    };
  }

  return {
    ok: true,
    request: {
      routeId,
      reason: readString(body.reason),
      selectedBy: readString(body.selectedBy),
      mergedAlternativeRouteIds: normalizeStringList(
        body.mergedAlternativeRouteIds
      ),
    },
  };
}

type ParseUpdateSpecTreeNodeRequestResult =
  | { ok: true; request: BlueprintUpdateSpecTreeNodeRequest }
  | { ok: false; message: string };

function parseUpdateSpecTreeNodeRequest(
  body: unknown
): ParseUpdateSpecTreeNodeRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const request: BlueprintUpdateSpecTreeNodeRequest = {};
  let hasUpdate = false;

  if (hasOwn(body, "title")) {
    const title = readString(body.title);
    if (!title) {
      return {
        ok: false,
        message: "title must be a non-empty string when provided.",
      };
    }
    request.title = title;
    hasUpdate = true;
  }

  if (hasOwn(body, "summary")) {
    const summary = readString(body.summary);
    if (!summary) {
      return {
        ok: false,
        message: "summary must be a non-empty string when provided.",
      };
    }
    request.summary = summary;
    hasUpdate = true;
  }

  if (hasOwn(body, "status")) {
    if (!isSpecTreeNodeStatus(body.status)) {
      return {
        ok: false,
        message:
          "status must be one of seed, draft, ready, or accepted when provided.",
      };
    }
    request.status = body.status;
    hasUpdate = true;
  }

  if (hasOwn(body, "priority")) {
    if (
      typeof body.priority !== "number" ||
      !Number.isFinite(body.priority) ||
      body.priority < 0
    ) {
      return {
        ok: false,
        message: "priority must be a non-negative number when provided.",
      };
    }
    request.priority = Math.trunc(body.priority);
    hasUpdate = true;
  }

  if (hasOwn(body, "outputs")) {
    if (!Array.isArray(body.outputs)) {
      return {
        ok: false,
        message: "outputs must be an array of strings when provided.",
      };
    }
    request.outputs = normalizeStringList(body.outputs);
    hasUpdate = true;
  }

  if (!hasUpdate) {
    return {
      ok: false,
      message:
        "Provide at least one editable field: title, summary, status, priority, or outputs.",
    };
  }

  return { ok: true, request };
}

type ParseSpecTreeActionRequestResult =
  | { ok: true; request: BlueprintSpecTreeActionRequest }
  | { ok: false; message: string };

function parseSpecTreeActionRequest(
  body: unknown
): ParseSpecTreeActionRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  switch (body.action) {
    case "add_node": {
      const parentId = readString(body.parentId);
      const title = readString(body.title);
      if (!parentId || !title) {
        return {
          ok: false,
          message: "add_node requires parentId and title.",
        };
      }
      if (hasOwn(body, "type") && !isSpecTreeNodeType(body.type)) {
        return {
          ok: false,
          message: "type must be a valid SPEC tree node type when provided.",
        };
      }
      if (hasOwn(body, "status") && !isSpecTreeNodeStatus(body.status)) {
        return {
          ok: false,
          message:
            "status must be one of seed, draft, ready, or accepted when provided.",
        };
      }
      if (hasOwn(body, "priority") && !isNonNegativeNumber(body.priority)) {
        return {
          ok: false,
          message: "priority must be a non-negative number when provided.",
        };
      }
      if (hasOwn(body, "outputs") && !Array.isArray(body.outputs)) {
        return {
          ok: false,
          message: "outputs must be an array of strings when provided.",
        };
      }

      return {
        ok: true,
        request: {
          action: "add_node",
          parentId,
          title,
          summary: readString(body.summary),
          type: isSpecTreeNodeType(body.type) ? body.type : undefined,
          status: isSpecTreeNodeStatus(body.status) ? body.status : undefined,
          priority: isNonNegativeNumber(body.priority)
            ? Math.trunc(body.priority)
            : undefined,
          outputs: normalizeStringList(body.outputs),
        },
      };
    }
    case "delete_node": {
      const nodeId = readString(body.nodeId);
      if (!nodeId) {
        return { ok: false, message: "delete_node requires nodeId." };
      }
      return { ok: true, request: { action: "delete_node", nodeId } };
    }
    case "move_node": {
      const nodeId = readString(body.nodeId);
      const parentId = readString(body.parentId);
      if (!nodeId || !parentId) {
        return {
          ok: false,
          message: "move_node requires nodeId and parentId.",
        };
      }
      if (hasOwn(body, "priority") && !isNonNegativeNumber(body.priority)) {
        return {
          ok: false,
          message: "priority must be a non-negative number when provided.",
        };
      }
      return {
        ok: true,
        request: {
          action: "move_node",
          nodeId,
          parentId,
          priority: isNonNegativeNumber(body.priority)
            ? Math.trunc(body.priority)
            : undefined,
        },
      };
    }
    case "merge_nodes": {
      const sourceNodeId = readString(body.sourceNodeId);
      const targetNodeId = readString(body.targetNodeId);
      if (!sourceNodeId || !targetNodeId) {
        return {
          ok: false,
          message: "merge_nodes requires sourceNodeId and targetNodeId.",
        };
      }
      return {
        ok: true,
        request: { action: "merge_nodes", sourceNodeId, targetNodeId },
      };
    }
    case "split_node": {
      const sourceNodeId = readString(body.sourceNodeId);
      const title = readString(body.title);
      if (!sourceNodeId || !title) {
        return {
          ok: false,
          message: "split_node requires sourceNodeId and title.",
        };
      }
      if (
        hasOwn(body, "placement") &&
        body.placement !== "sibling" &&
        body.placement !== "child"
      ) {
        return {
          ok: false,
          message: "placement must be sibling or child when provided.",
        };
      }
      if (hasOwn(body, "outputs") && !Array.isArray(body.outputs)) {
        return {
          ok: false,
          message: "outputs must be an array of strings when provided.",
        };
      }
      return {
        ok: true,
        request: {
          action: "split_node",
          sourceNodeId,
          title,
          summary: readString(body.summary),
          outputs: normalizeStringList(body.outputs),
          placement:
            body.placement === "child" || body.placement === "sibling"
              ? body.placement
              : undefined,
        },
      };
    }
    case "set_current_version": {
      const versionId = readString(body.versionId);
      if (!versionId) {
        return {
          ok: false,
          message: "set_current_version requires versionId.",
        };
      }
      return {
        ok: true,
        request: { action: "set_current_version", versionId },
      };
    }
    default:
      return {
        ok: false,
        message:
          "action must be one of add_node, delete_node, move_node, merge_nodes, split_node, or set_current_version.",
      };
  }
}

type ParseSaveSpecTreeVersionRequestResult =
  | {
      ok: true;
      request: { title?: string; summary?: string; savedBy?: string };
    }
  | { ok: false; message: string };

function parseSaveSpecTreeVersionRequest(
  body: unknown
): ParseSaveSpecTreeVersionRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  return {
    ok: true,
    request: {
      title: readString(body.title),
      summary: readString(body.summary),
      savedBy: readString(body.savedBy),
    },
  };
}

type ParseSaveSpecDocumentVersionRequestResult =
  | {
      ok: true;
      request: { savedBy?: string; reviewNote?: string };
    }
  | { ok: false; message: string };

function parseSaveSpecDocumentVersionRequest(
  body: unknown
): ParseSaveSpecDocumentVersionRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  return {
    ok: true,
    request: {
      savedBy: readString(body.savedBy),
      reviewNote: readString(body.reviewNote),
    },
  };
}

type ParseReviewSpecDocumentRequestResult =
  | { ok: true; request: BlueprintReviewSpecDocumentRequest }
  | { ok: false; message: string };

function parseReviewSpecDocumentRequest(
  body: unknown
): ParseReviewSpecDocumentRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const rawStatus = readString(body.status) ?? readString(body.action);
  const status =
    rawStatus === "accept"
      ? "accepted"
      : rawStatus === "reject"
        ? "rejected"
        : rawStatus;

  if (!isSpecDocumentReviewStatus(status)) {
    return {
      ok: false,
      message: "status must be accepted, rejected, or reviewing.",
    };
  }

  return {
    ok: true,
    request: {
      status,
      reviewedBy: readString(body.reviewedBy),
      reviewNote: readString(body.reviewNote ?? body.note),
    },
  };
}

type ParseSpecDocumentFiltersResult =
  | {
      ok: true;
      filters: { nodeId?: string; type?: BlueprintSpecDocumentType };
    }
  | { ok: false; message: string };

type ParseEffectPreviewFiltersResult =
  | {
      ok: true;
      filters: { nodeId?: string };
    }
  | { ok: false; message: string };

type ParseImplementationPromptPackageFiltersResult =
  | {
      ok: true;
      filters: {
        nodeId?: string;
        targetPlatforms?: BlueprintImplementationPromptTargetPlatform[];
      };
    }
  | { ok: false; message: string };

type ParseGenerateSpecDocumentsRequestResult =
  | { ok: true; request: BlueprintGenerateSpecDocumentsRequest }
  | { ok: false; message: string };

type ParseGenerateEffectPreviewsRequestResult =
  | { ok: true; request: BlueprintGenerateEffectPreviewsRequest }
  | { ok: false; message: string };

type ParseGenerateImplementationPromptPackagesRequestResult =
  | { ok: true; request: BlueprintGenerateImplementationPromptPackagesRequest }
  | { ok: false; message: string };

type ParseGenerateEngineeringLandingPlansRequestResult =
  | { ok: true; request: BlueprintGenerateEngineeringLandingPlansRequest }
  | { ok: false; message: string };

type ParseRecordEngineeringRunRequestResult =
  | { ok: true; request: BlueprintRecordEngineeringRunRequest }
  | { ok: false; message: string };

type ParseCapabilityInvocationRequestResult =
  | { ok: true; request: BlueprintCapabilityInvocationRequest }
  | { ok: false; message: string };

type ParseCapabilityInvocationFiltersResult =
  | { ok: true; filters: BlueprintFetchCapabilityInvocationsRequest }
  | { ok: false; message: string };

type ParseCapabilityEvidenceFiltersResult =
  | { ok: true; filters: BlueprintFetchCapabilityEvidenceRequest }
  | { ok: false; message: string };

type ParseCreateArtifactReplayRequestResult =
  | { ok: true; request: BlueprintCreateArtifactReplayRequest }
  | { ok: false; message: string };

type ParseArtifactDiffRequestResult =
  | { ok: true; request: BlueprintArtifactDiffRequest }
  | { ok: false; message: string };

type ParseArtifactFeedbackRequestResult =
  | { ok: true; request: BlueprintArtifactFeedbackRequest }
  | { ok: false; message: string };

function parseGenerateSpecDocumentsRequest(
  body: unknown
): ParseGenerateSpecDocumentsRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const request: BlueprintGenerateSpecDocumentsRequest = {};

  if (hasOwn(body, "nodeId")) {
    const nodeId = readString(body.nodeId);
    if (!nodeId) {
      return {
        ok: false,
        message: "nodeId must be a non-empty string when provided.",
      };
    }
    request.nodeId = nodeId;
  }

  if (hasOwn(body, "types")) {
    if (!Array.isArray(body.types)) {
      return {
        ok: false,
        message: "types must be an array when provided.",
      };
    }

    const types: BlueprintSpecDocumentType[] = [];
    for (const value of body.types) {
      const type = readString(value);
      if (!isSpecDocumentType(type)) {
        return {
          ok: false,
          message: "types must only contain requirements, design, or tasks.",
        };
      }
      if (!types.includes(type)) {
        types.push(type);
      }
    }

    if (types.length === 0) {
      return {
        ok: false,
        message: "types must include at least one document type when provided.",
      };
    }

    request.types = types;
  }

  return { ok: true, request };
}

function parseGenerateEffectPreviewsRequest(
  body: unknown
): ParseGenerateEffectPreviewsRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const request: BlueprintGenerateEffectPreviewsRequest = {};

  if (hasOwn(body, "nodeId")) {
    const nodeId = readString(body.nodeId);
    if (!nodeId) {
      return {
        ok: false,
        message: "nodeId must be a non-empty string when provided.",
      };
    }
    request.nodeId = nodeId;
  }

  if (hasOwn(body, "includeDrafts")) {
    if (typeof body.includeDrafts !== "boolean") {
      return {
        ok: false,
        message: "includeDrafts must be a boolean when provided.",
      };
    }
    request.includeDrafts = body.includeDrafts;
  }

  return { ok: true, request };
}

function parseGenerateImplementationPromptPackagesRequest(
  body: unknown
): ParseGenerateImplementationPromptPackagesRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const request: BlueprintGenerateImplementationPromptPackagesRequest = {};

  if (hasOwn(body, "nodeId")) {
    const nodeId = readString(body.nodeId);
    if (!nodeId) {
      return {
        ok: false,
        message: "nodeId must be a non-empty string when provided.",
      };
    }
    request.nodeId = nodeId;
  }

  const rawTargetPlatforms = hasOwn(body, "targetPlatforms")
    ? body.targetPlatforms
    : hasOwn(body, "platforms")
      ? body.platforms
      : undefined;

  if (rawTargetPlatforms !== undefined) {
    if (!Array.isArray(rawTargetPlatforms)) {
      return {
        ok: false,
        message: "targetPlatforms must be an array when provided.",
      };
    }

    const targetPlatforms = parsePromptTargetPlatforms(rawTargetPlatforms);
    if (!targetPlatforms.ok) {
      return targetPlatforms;
    }
    request.targetPlatforms = targetPlatforms.platforms;
  }

  if (hasOwn(body, "includeDrafts")) {
    if (typeof body.includeDrafts !== "boolean") {
      return {
        ok: false,
        message: "includeDrafts must be a boolean when provided.",
      };
    }
    request.includeDrafts = body.includeDrafts;
  }

  if (hasOwn(body, "includePreviewDrafts")) {
    if (typeof body.includePreviewDrafts !== "boolean") {
      return {
        ok: false,
        message: "includePreviewDrafts must be a boolean when provided.",
      };
    }
    request.includePreviewDrafts = body.includePreviewDrafts;
  }

  return { ok: true, request };
}

function parseGenerateEngineeringLandingPlansRequest(
  body: unknown
): ParseGenerateEngineeringLandingPlansRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const request: BlueprintGenerateEngineeringLandingPlansRequest = {};

  if (hasOwn(body, "promptPackageId")) {
    const promptPackageId = readString(body.promptPackageId);
    if (!promptPackageId) {
      return {
        ok: false,
        message: "promptPackageId must be a non-empty string when provided.",
      };
    }
    request.promptPackageId = promptPackageId;
  }

  const rawPlatforms: unknown[] = [];
  const rawPlatformList = hasOwn(body, "targetPlatforms")
    ? body.targetPlatforms
    : hasOwn(body, "platforms")
      ? body.platforms
      : undefined;

  if (rawPlatformList !== undefined) {
    if (!Array.isArray(rawPlatformList)) {
      return {
        ok: false,
        message: "targetPlatforms must be an array when provided.",
      };
    }
    rawPlatforms.push(...rawPlatformList);
  }

  if (hasOwn(body, "targetPlatform") || hasOwn(body, "platform")) {
    const platform = readString(body.targetPlatform ?? body.platform);
    if (!platform) {
      return {
        ok: false,
        message: "targetPlatform must be a non-empty string when provided.",
      };
    }
    rawPlatforms.push(platform);
  }

  if (rawPlatforms.length > 0) {
    const targetPlatforms = parsePromptTargetPlatforms(rawPlatforms);
    if (!targetPlatforms.ok) {
      return targetPlatforms;
    }

    request.targetPlatforms = targetPlatforms.platforms;
    if (targetPlatforms.platforms.length === 1) {
      request.targetPlatform = targetPlatforms.platforms[0];
    }
  }

  return { ok: true, request };
}

function parseRecordEngineeringRunRequest(
  body: unknown
): ParseRecordEngineeringRunRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const landingPlanId = readString(body.landingPlanId);
  if (!landingPlanId) {
    return {
      ok: false,
      message: "Provide landingPlanId to record an engineering run.",
    };
  }

  const status = readString(body.status) ?? "running";
  if (!isEngineeringRunStatus(status)) {
    return {
      ok: false,
      message: "status must be planned, running, passed, failed, or blocked.",
    };
  }

  const startedAt = readOptionalStringField(body, "startedAt");
  if (!startedAt.ok) return startedAt;

  const completedAt = readOptionalStringField(body, "completedAt");
  if (!completedAt.ok) return completedAt;

  const logs = readOptionalStringListField(body, "logs");
  if (!logs.ok) return logs;

  const changedFiles = readOptionalStringListField(body, "changedFiles");
  if (!changedFiles.ok) return changedFiles;

  const promptPackageIds = readOptionalStringListField(
    body,
    "promptPackageIds"
  );
  if (!promptPackageIds.ok) return promptPackageIds;

  const capabilityInvocationIds = readOptionalStringListField(
    body,
    "capabilityInvocationIds"
  );
  if (!capabilityInvocationIds.ok) return capabilityInvocationIds;

  const capabilityEvidenceIds = readOptionalStringListField(
    body,
    "capabilityEvidenceIds"
  );
  if (!capabilityEvidenceIds.ok) return capabilityEvidenceIds;

  const verificationResults = parseEngineeringVerificationResults(
    body.verificationResults
  );
  if (!verificationResults.ok) return verificationResults;

  return {
    ok: true,
    request: {
      landingPlanId,
      status,
      startedAt: startedAt.value,
      completedAt: completedAt.value,
      summary: readString(body.summary),
      logs: logs.values,
      verificationResults: verificationResults.results,
      changedFiles: changedFiles.values,
      promptPackageIds: promptPackageIds.values,
      capabilityInvocationIds: capabilityInvocationIds.values,
      capabilityEvidenceIds: capabilityEvidenceIds.values,
    },
  };
}

function parseCapabilityInvocationRequest(
  body: unknown
): ParseCapabilityInvocationRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const capabilityId = readString(body.capabilityId);
  if (!capabilityId) {
    return {
      ok: false,
      message: "Provide capabilityId to invoke a runtime capability.",
    };
  }

  const evidenceTags = hasOwn(body, "evidenceTags")
    ? normalizeStringList(body.evidenceTags)
    : [];

  return {
    ok: true,
    request: {
      capabilityId,
      routeId: readString(body.routeId),
      nodeId: readString(body.nodeId),
      input: readString(body.input),
      approved: typeof body.approved === "boolean" ? body.approved : undefined,
      requestedBy: readString(body.requestedBy),
      evidenceTags,
    },
  };
}

function parseCapabilityInvocationFilters(
  query: Record<string, unknown>
): ParseCapabilityInvocationFiltersResult {
  const capabilityId = readString(query.capabilityId);
  const nodeId = readString(query.nodeId);
  const routeId = readString(query.routeId);

  return {
    ok: true,
    filters: {
      capabilityId,
      nodeId,
      routeId,
    },
  };
}

function parseCapabilityEvidenceFilters(
  query: Record<string, unknown>
): ParseCapabilityEvidenceFiltersResult {
  const capabilityId = readString(query.capabilityId);
  const nodeId = readString(query.nodeId);
  const routeId = readString(query.routeId);

  return {
    ok: true,
    filters: {
      capabilityId,
      nodeId,
      routeId,
    },
  };
}

function parseCreateArtifactReplayRequest(
  body: unknown
): ParseCreateArtifactReplayRequestResult {
  if (body === undefined || body === null) {
    return { ok: true, request: {} };
  }

  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const title = readOptionalStringField(body, "title");
  if (!title.ok) return title;

  const summary = readOptionalStringField(body, "summary");
  if (!summary.ok) return summary;

  const tags = readOptionalStringListField(body, "tags");
  if (!tags.ok) return tags;

  return {
    ok: true,
    request: {
      title: title.value,
      summary: summary.value,
      tags: tags.values,
    },
  };
}

function parseArtifactDiffRequest(
  body: unknown
): ParseArtifactDiffRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const leftEntryId = readString(body.leftEntryId);
  const rightEntryId = readString(body.rightEntryId);
  if (!leftEntryId || !rightEntryId) {
    return {
      ok: false,
      message: "Provide leftEntryId and rightEntryId to compare ledger entries.",
    };
  }

  return {
    ok: true,
    request: {
      leftEntryId,
      rightEntryId,
    },
  };
}

function parseArtifactFeedbackRequest(
  body: unknown
): ParseArtifactFeedbackRequestResult {
  if (!isPlainRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
    };
  }

  const entryId = readString(body.entryId);
  const artifactId = readString(body.artifactId);
  if (!entryId && !artifactId) {
    return {
      ok: false,
      message: "Provide entryId or artifactId to record artifact feedback.",
    };
  }

  const rawKind =
    readString(body.kind ?? body.type) ??
    (body.backfill === true ? "backfill" : "feedback");
  if (!isArtifactFeedbackKind(rawKind)) {
    return {
      ok: false,
      message: "kind must be feedback or backfill when provided.",
    };
  }

  const message = readString(
    body.message ?? body.feedback ?? body.note ?? body.summary
  );
  if (!message) {
    return {
      ok: false,
      message: "Provide message, feedback, note, or summary text.",
    };
  }

  const summary = readOptionalStringField(body, "summary");
  if (!summary.ok) return summary;

  const createdBy = readOptionalStringField(body, "createdBy");
  if (!createdBy.ok) return createdBy;

  const tags = readOptionalStringListField(body, "tags");
  if (!tags.ok) return tags;

  const sourceIds = parsePartialArtifactSourceIds(body.sourceIds);
  if (!sourceIds.ok) return sourceIds;

  const payloadSummary = parseArtifactPayloadSummary(body.payloadSummary);
  if (!payloadSummary.ok) return payloadSummary;

  return {
    ok: true,
    request: {
      entryId,
      artifactId,
      kind: rawKind,
      message,
      summary: summary.value,
      createdBy: createdBy.value,
      tags: tags.values,
      sourceIds: sourceIds.sourceIds,
      payloadSummary: payloadSummary.payloadSummary,
    },
  };
}

function parsePartialArtifactSourceIds(
  value: unknown
):
  | { ok: true; sourceIds?: Partial<BlueprintArtifactSourceIds> }
  | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isPlainRecord(value)) {
    return {
      ok: false,
      message: "sourceIds must be a JSON object when provided.",
    };
  }

  const sourceIds: Partial<BlueprintArtifactSourceIds> = {};
  const routeSetId = readString(value.routeSetId);
  const specTreeId = readString(value.specTreeId);
  if (routeSetId) sourceIds.routeSetId = routeSetId;
  if (specTreeId) sourceIds.specTreeId = specTreeId;

  for (const key of [
    "specDocumentIds",
    "effectPreviewIds",
    "promptPackageIds",
    "landingPlanIds",
    "engineeringRunIds",
  ] as const) {
    if (!hasOwn(value, key)) continue;
    if (!Array.isArray(value[key])) {
      return {
        ok: false,
        message: `sourceIds.${key} must be an array of strings when provided.`,
      };
    }
    sourceIds[key] = normalizeStringList(value[key]);
  }

  return { ok: true, sourceIds };
}

function parseArtifactPayloadSummary(
  value: unknown
):
  | { ok: true; payloadSummary?: BlueprintArtifactPayloadSummary }
  | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isPlainRecord(value)) {
    return {
      ok: false,
      message: "payloadSummary must be a JSON object when provided.",
    };
  }

  const payloadSummary: BlueprintArtifactPayloadSummary = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isArtifactPayloadSummaryValue(item)) {
      return {
        ok: false,
        message:
          "payloadSummary values must be strings, numbers, booleans, string arrays, number arrays, or null.",
      };
    }
    payloadSummary[key] = item;
  }

  return { ok: true, payloadSummary };
}

function parseSpecDocumentFilters(
  query: Record<string, unknown>
): ParseSpecDocumentFiltersResult {
  const nodeId = readString(query.nodeId);
  const type = readString(query.type);
  const parsedType = type && isSpecDocumentType(type) ? type : undefined;

  if (type && !parsedType) {
    return {
      ok: false,
      message: "type must be one of requirements, design, or tasks.",
    };
  }

  return {
    ok: true,
    filters: {
      nodeId,
      type: parsedType,
    },
  };
}

function parseImplementationPromptPackageFilters(
  query: Record<string, unknown>
): ParseImplementationPromptPackageFiltersResult {
  const nodeId = readString(query.nodeId);
  const rawPlatforms = normalizeQueryStringList(
    query.targetPlatforms ??
      query.targetPlatform ??
      query.platforms ??
      query.platform
  );
  const platforms = rawPlatforms.length
    ? parsePromptTargetPlatforms(rawPlatforms)
    : { ok: true as const, platforms: undefined };

  if (!platforms.ok) {
    return platforms;
  }

  return {
    ok: true,
    filters: {
      nodeId,
      targetPlatforms: platforms.platforms,
    },
  };
}

function parsePromptTargetPlatforms(
  values: unknown[]
):
  | {
      ok: true;
      platforms: BlueprintImplementationPromptTargetPlatform[];
    }
  | { ok: false; message: string } {
  const platforms: BlueprintImplementationPromptTargetPlatform[] = [];

  for (const value of values) {
    const platform = readString(value);
    if (!isImplementationPromptTargetPlatform(platform)) {
      return {
        ok: false,
        message:
          "targetPlatforms must only contain cursor, kiro, trae, windsurf, codex, or claude.",
      };
    }
    if (!platforms.includes(platform)) {
      platforms.push(platform);
    }
  }

  if (platforms.length === 0) {
    return {
      ok: false,
      message: "targetPlatforms must include at least one platform.",
    };
  }

  return { ok: true, platforms };
}

function readOptionalStringField(
  record: Record<string, unknown>,
  key: string
): { ok: true; value?: string } | { ok: false; message: string } {
  if (!hasOwn(record, key)) {
    return { ok: true };
  }

  const value = readString(record[key]);
  if (!value) {
    return {
      ok: false,
      message: `${key} must be a non-empty string when provided.`,
    };
  }

  return { ok: true, value };
}

function readOptionalStringListField(
  record: Record<string, unknown>,
  key: string
): { ok: true; values?: string[] } | { ok: false; message: string } {
  if (!hasOwn(record, key)) {
    return { ok: true };
  }

  if (!Array.isArray(record[key])) {
    return {
      ok: false,
      message: `${key} must be an array of strings when provided.`,
    };
  }

  const values: string[] = [];
  for (const item of record[key]) {
    const value = readString(item);
    if (!value) {
      return {
        ok: false,
        message: `${key} must only contain non-empty strings.`,
      };
    }

    if (!values.includes(value)) {
      values.push(value);
    }
  }

  return { ok: true, values };
}

function parseEngineeringVerificationResults(
  value: unknown
):
  | { ok: true; results?: BlueprintEngineeringVerificationResult[] }
  | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: "verificationResults must be an array when provided.",
    };
  }

  const results: BlueprintEngineeringVerificationResult[] = [];
  for (const item of value) {
    if (!isPlainRecord(item)) {
      return {
        ok: false,
        message: "verificationResults must contain JSON objects.",
      };
    }

    const command = readString(item.command);
    if (!command) {
      return {
        ok: false,
        message: "verificationResults items must include command.",
      };
    }

    const status = readString(item.status);
    if (!isEngineeringVerificationStatus(status)) {
      return {
        ok: false,
        message:
          "verificationResults status must be passed, failed, skipped, or blocked.",
      };
    }

    const durationMs =
      hasOwn(item, "durationMs") && typeof item.durationMs === "number"
        ? item.durationMs
        : undefined;

    if (
      hasOwn(item, "durationMs") &&
      (typeof item.durationMs !== "number" ||
        !Number.isFinite(item.durationMs) ||
        item.durationMs < 0)
    ) {
      return {
        ok: false,
        message: "verificationResults durationMs must be a non-negative number.",
      };
    }

    results.push({
      command,
      status,
      output: readString(item.output),
      durationMs,
    });
  }

  return { ok: true, results };
}

function filterSpecDocuments(
  documents: BlueprintSpecDocument[],
  filters: { nodeId?: string; type?: BlueprintSpecDocumentType }
): BlueprintSpecDocument[] {
  return documents.filter(document => {
    if (filters.nodeId && document.nodeId !== filters.nodeId) {
      return false;
    }

    if (filters.type && document.type !== filters.type) {
      return false;
    }

    return true;
  });
}

function filterEffectPreviews(
  effectPreviews: BlueprintEffectPreview[],
  filters: { nodeId?: string }
): BlueprintEffectPreview[] {
  return effectPreviews.filter(effectPreview => {
    if (filters.nodeId && effectPreview.nodeId !== filters.nodeId) {
      return false;
    }

    return true;
  });
}

function filterImplementationPromptPackages(
  promptPackages: BlueprintImplementationPromptPackage[],
  filters: {
    nodeId?: string;
    targetPlatforms?: BlueprintImplementationPromptTargetPlatform[];
  }
): BlueprintImplementationPromptPackage[] {
  return promptPackages.filter(promptPackage => {
    if (
      filters.nodeId &&
      !promptPackage.nodeIds.includes(filters.nodeId)
    ) {
      return false;
    }

    if (
      filters.targetPlatforms &&
      !filters.targetPlatforms.includes(promptPackage.targetPlatform)
    ) {
      return false;
    }

    return true;
  });
}

function selectRouteForSpecTree(
  job: BlueprintGenerationJob,
  routeSet: BlueprintRouteSet,
  request: BlueprintRouteSelectionRequest,
  options: CreateGenerationJobOptions
): BlueprintSelectRouteResponse {
  const selectedAt = (options.now?.() ?? new Date()).toISOString();
  const selectedRoute = routeSet.routes.find(
    route => route.id === request.routeId
  );
  if (!selectedRoute) {
    throw new Error(`Route ${request.routeId} does not exist.`);
  }

  const validMergedAlternativeRouteIds = new Set(
    routeSet.routes
      .filter(route => route.kind === "alternative")
      .map(route => route.id)
  );
  const mergedAlternativeRouteIds = (
    request.mergedAlternativeRouteIds ?? []
  ).filter(routeId => validMergedAlternativeRouteIds.has(routeId));
  const selection: BlueprintRouteSelection = {
    id: createId("blueprint-route-selection"),
    routeSetId: routeSet.id,
    routeId: selectedRoute.id,
    routeTitle: selectedRoute.title,
    selectedAt,
    selectedBy: request.selectedBy,
    reason: request.reason,
    mergedAlternativeRouteIds,
    status: "selected",
    provenance: {
      jobId: job.id,
      projectId: job.projectId,
      sourceId: job.sourceId,
    },
  };
  const specTree = buildSpecTreeFromRouteSet({
    job,
    routeSet,
    selection,
    selectedRoute,
    createdAt: selectedAt,
  });
  const routeSelectionArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "route_selection",
    title: `Selected route: ${selectedRoute.title}`,
    summary:
      "User-selected autopilot route that acts as the source of SPEC tree derivation.",
    createdAt: selectedAt,
    payload: selection,
  };
  const specTreeArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "spec_tree",
    title: "Derived SPEC tree",
    summary:
      "Initial durable SPEC tree generated from the selected primary or alternative route.",
    createdAt: selectedAt,
    payload: specTree,
  };
  const preservedArtifacts = job.artifacts.filter(
    artifact =>
      artifact.type !== "route_selection" && artifact.type !== "spec_tree"
  );
  const events = job.events.concat([
    createGenerationEvent({
      jobId: job.id,
      stage: "spec_tree",
      status: "running",
      type: "job.stage",
      message: `Selected route ${selectedRoute.title} and started SPEC tree derivation.`,
      occurredAt: selectedAt,
      payload: {
        routeSetId: routeSet.id,
        routeId: selectedRoute.id,
        selectionId: selection.id,
      },
    }),
    createGenerationEvent({
      jobId: job.id,
      stage: "spec_tree",
      status: "reviewing",
      type: "job.completed",
      message:
        "SPEC tree draft generated and ready for the Deduction workbench.",
      occurredAt: selectedAt,
      payload: {
        specTreeId: specTree.id,
        rootNodeId: specTree.rootNodeId,
        nodeCount: specTree.nodes.length,
      },
    }),
  ]);
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_tree",
    updatedAt: selectedAt,
    completedAt: selectedAt,
    artifacts: preservedArtifacts.concat(
      routeSelectionArtifact,
      specTreeArtifact
    ),
    events,
  };

  options.store.save(updatedJob);

  return {
    job: updatedJob,
    routeSet,
    selection,
    specTree,
  };
}

function resetRouteSelection(
  job: BlueprintGenerationJob,
  routeSet: BlueprintRouteSet,
  options: CreateGenerationJobOptions
): BlueprintResetRouteSelectionResponse {
  const updatedAt = (options.now?.() ?? new Date()).toISOString();
  const preservedArtifacts = job.artifacts.filter(artifact =>
    [
      "route_set",
      "intake",
      "github_source",
      "clarification_session",
      "project_context",
    ].includes(artifact.type)
  );
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "completed",
    stage: "route_generation",
    updatedAt,
    completedAt: updatedAt,
    artifacts: preservedArtifacts,
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "route_generation",
        status: "completed",
        type: "job.stage",
        message: "Route selection reset and RouteSet returned to draft.",
        occurredAt: updatedAt,
        payload: {
          routeSetId: routeSet.id,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    job: updatedJob,
    routeSet,
  };
}

type UpdateSpecTreeNodeResult =
  | { ok: true; response: BlueprintUpdateSpecTreeNodeResponse }
  | { ok: false; status: number; error: string; message: string };

function updateSpecTreeNode(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  nodeId: string,
  request: BlueprintUpdateSpecTreeNodeRequest,
  options: CreateGenerationJobOptions
): UpdateSpecTreeNodeResult {
  const updatedAt = (options.now?.() ?? new Date()).toISOString();
  const nodeIndex = specTree.nodes.findIndex(node => node.id === nodeId);

  if (nodeIndex < 0) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint SPEC tree node not found.",
      message: `No node ${nodeId} exists in SPEC tree ${specTree.id}.`,
    };
  }

  const updatedNode: BlueprintSpecTreeNode = {
    ...specTree.nodes[nodeIndex],
    title: request.title ?? specTree.nodes[nodeIndex].title,
    summary: request.summary ?? specTree.nodes[nodeIndex].summary,
    status: request.status ?? specTree.nodes[nodeIndex].status,
    priority: request.priority ?? specTree.nodes[nodeIndex].priority,
    outputs: request.outputs ?? specTree.nodes[nodeIndex].outputs,
  };
  const updatedSpecTree: BlueprintSpecTree = {
    ...specTree,
    version: specTree.version + 1,
    updatedAt,
    nodes: specTree.nodes.map((node, index) =>
      index === nodeIndex ? updatedNode : node
    ),
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_tree",
    updatedAt,
    completedAt: updatedAt,
    artifacts: replaceSpecTreeArtifact(job.artifacts, updatedSpecTree),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_tree",
        status: "reviewing",
        type: "job.stage",
        message: `Updated SPEC tree node ${updatedNode.title}.`,
        occurredAt: updatedAt,
        payload: {
          specTreeId: updatedSpecTree.id,
          nodeId: updatedNode.id,
          version: updatedSpecTree.version,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree: updatedSpecTree,
      node: updatedNode,
    },
  };
}

type SpecTreeActionResult =
  | { ok: true; response: BlueprintSpecTreeActionResponse }
  | { ok: false; status: number; error: string; message: string };

function runSpecTreeAction(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintSpecTreeActionRequest,
  options: CreateGenerationJobOptions
): SpecTreeActionResult {
  const updatedAt = (options.now?.() ?? new Date()).toISOString();
  const actionResult = applySpecTreeAction(job, specTree, request, updatedAt);

  if (!actionResult.ok) {
    return actionResult;
  }

  const updatedSpecTree: BlueprintSpecTree = {
    ...actionResult.specTree,
    version: specTree.version + 1,
    updatedAt,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_tree",
    updatedAt,
    completedAt: updatedAt,
    artifacts: replaceSpecTreeArtifact(job.artifacts, updatedSpecTree),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_tree",
        status: "reviewing",
        type: "job.stage",
        message: describeSpecTreeAction(request, actionResult.node),
        occurredAt: updatedAt,
        payload: {
          action: request.action,
          specTreeId: updatedSpecTree.id,
          nodeId: actionResult.node?.id,
          versionId: actionResult.version?.id,
          version: updatedSpecTree.version,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree: updatedSpecTree,
      node: actionResult.node,
      version: actionResult.version,
    },
  };
}

type ApplySpecTreeActionResult =
  | {
      ok: true;
      specTree: BlueprintSpecTree;
      node?: BlueprintSpecTreeNode;
      version?: BlueprintSpecTreeVersionSnapshot;
    }
  | { ok: false; status: number; error: string; message: string };

function applySpecTreeAction(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintSpecTreeActionRequest,
  updatedAt: string
): ApplySpecTreeActionResult {
  switch (request.action) {
    case "add_node":
      return addSpecTreeNode(specTree, request);
    case "delete_node":
      return deleteSpecTreeNode(specTree, request.nodeId);
    case "move_node":
      return moveSpecTreeNode(specTree, request);
    case "merge_nodes":
      return mergeSpecTreeNodes(specTree, request);
    case "split_node":
      return splitSpecTreeNode(specTree, request);
    case "set_current_version":
      return setCurrentSpecTreeVersion(job, specTree, request.versionId, updatedAt);
  }
}

function addSpecTreeNode(
  specTree: BlueprintSpecTree,
  request: Extract<BlueprintSpecTreeActionRequest, { action: "add_node" }>
): ApplySpecTreeActionResult {
  const parent = findSpecTreeNode(specTree, request.parentId);
  if (!parent) {
    return specTreeNodeNotFound(request.parentId, specTree.id);
  }

  const node = createSpecTreeNode({
    parentId: parent.id,
    title: request.title,
    summary: request.summary ?? "Draft SPEC tree node added from the workbench.",
    type: request.type ?? "route_step",
    status: request.status ?? "draft",
    priority: request.priority ?? parent.children.length + 1,
    routeId: parent.routeId ?? specTree.selectedRouteId,
    outputs: request.outputs ?? [],
    metadata: {
      createdByAction: "add_node",
    },
  });
  const nodes = specTree.nodes
    .map(item =>
      item.id === parent.id
        ? { ...item, children: uniqueStrings(item.children.concat(node.id)) }
        : item
    )
    .concat(node);

  return {
    ok: true,
    specTree: { ...specTree, nodes },
    node,
  };
}

function deleteSpecTreeNode(
  specTree: BlueprintSpecTree,
  nodeId: string
): ApplySpecTreeActionResult {
  const node = findSpecTreeNode(specTree, nodeId);
  if (!node) {
    return specTreeNodeNotFound(nodeId, specTree.id);
  }
  if (node.id === specTree.rootNodeId) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC tree root cannot be deleted.",
      message: "delete_node cannot delete the SPEC tree root node.",
    };
  }

  const deletedIds = collectSpecTreeSubtreeIds(specTree, node.id);
  const nodes = specTree.nodes
    .filter(item => !deletedIds.has(item.id))
    .map(item => ({
      ...item,
      children: item.children.filter(childId => !deletedIds.has(childId)),
    }));

  return {
    ok: true,
    specTree: { ...specTree, nodes },
    node,
  };
}

function moveSpecTreeNode(
  specTree: BlueprintSpecTree,
  request: Extract<BlueprintSpecTreeActionRequest, { action: "move_node" }>
): ApplySpecTreeActionResult {
  const node = findSpecTreeNode(specTree, request.nodeId);
  const parent = findSpecTreeNode(specTree, request.parentId);
  if (!node) {
    return specTreeNodeNotFound(request.nodeId, specTree.id);
  }
  if (!parent) {
    return specTreeNodeNotFound(request.parentId, specTree.id);
  }
  if (node.id === parent.id) {
    return {
      ok: false,
      status: 409,
      error: "Invalid SPEC tree move.",
      message: "move_node cannot move a node under itself.",
    };
  }
  if (collectSpecTreeSubtreeIds(specTree, node.id).has(parent.id)) {
    return {
      ok: false,
      status: 409,
      error: "Invalid SPEC tree move.",
      message: "move_node cannot move a node under one of its descendants.",
    };
  }

  const priority = request.priority ?? parent.children.length + 1;
  const movedNode: BlueprintSpecTreeNode = {
    ...node,
    parentId: parent.id,
    priority,
  };
  const nodes = specTree.nodes.map(item => {
    if (item.id === node.id) return movedNode;
    if (item.id === node.parentId) {
      return {
        ...item,
        children: item.children.filter(childId => childId !== node.id),
      };
    }
    if (item.id === parent.id) {
      return {
        ...item,
        children: uniqueStrings(item.children.concat(node.id)),
      };
    }
    return item;
  });

  return {
    ok: true,
    specTree: { ...specTree, nodes },
    node: movedNode,
  };
}

function mergeSpecTreeNodes(
  specTree: BlueprintSpecTree,
  request: Extract<BlueprintSpecTreeActionRequest, { action: "merge_nodes" }>
): ApplySpecTreeActionResult {
  const source = findSpecTreeNode(specTree, request.sourceNodeId);
  const target = findSpecTreeNode(specTree, request.targetNodeId);
  if (!source) {
    return specTreeNodeNotFound(request.sourceNodeId, specTree.id);
  }
  if (!target) {
    return specTreeNodeNotFound(request.targetNodeId, specTree.id);
  }
  if (source.id === target.id) {
    return {
      ok: false,
      status: 409,
      error: "Invalid SPEC tree merge.",
      message: "merge_nodes requires different source and target nodes.",
    };
  }
  if (source.id === specTree.rootNodeId) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC tree root cannot be merged away.",
      message: "merge_nodes cannot delete the SPEC tree root node.",
    };
  }
  if (collectSpecTreeSubtreeIds(specTree, source.id).has(target.id)) {
    return {
      ok: false,
      status: 409,
      error: "Invalid SPEC tree merge.",
      message: "merge_nodes cannot merge a node into its descendant.",
    };
  }

  const mergedTarget: BlueprintSpecTreeNode = {
    ...target,
    summary: [target.summary, `Merged from ${source.title}: ${source.summary}`]
      .filter(Boolean)
      .join("\n\n"),
    outputs: uniqueStrings(target.outputs.concat(source.outputs)),
    children: uniqueStrings(
      target.children
        .filter(childId => childId !== source.id)
        .concat(source.children.filter(childId => childId !== target.id))
    ),
  };
  const nodes = specTree.nodes
    .filter(item => item.id !== source.id)
    .map(item => {
      if (item.id === target.id) return mergedTarget;
      if (source.children.includes(item.id)) {
        return { ...item, parentId: target.id };
      }
      return {
        ...item,
        children: item.children.filter(childId => childId !== source.id),
      };
    });

  return {
    ok: true,
    specTree: { ...specTree, nodes },
    node: mergedTarget,
  };
}

function splitSpecTreeNode(
  specTree: BlueprintSpecTree,
  request: Extract<BlueprintSpecTreeActionRequest, { action: "split_node" }>
): ApplySpecTreeActionResult {
  const source = findSpecTreeNode(specTree, request.sourceNodeId);
  if (!source) {
    return specTreeNodeNotFound(request.sourceNodeId, specTree.id);
  }

  const placement = request.placement ?? (source.parentId ? "sibling" : "child");
  const parentId = placement === "sibling" && source.parentId
    ? source.parentId
    : source.id;
  const parent = findSpecTreeNode(specTree, parentId);
  if (!parent) {
    return specTreeNodeNotFound(parentId, specTree.id);
  }

  const node = createSpecTreeNode({
    parentId: parent.id,
    title: request.title,
    summary: request.summary ?? `Split from ${source.title}.`,
    type: source.type === "root" ? "route_step" : source.type,
    status: "draft",
    priority:
      placement === "sibling" ? source.priority + 1 : parent.children.length + 1,
    routeId: source.routeId ?? parent.routeId ?? specTree.selectedRouteId,
    routeStepId: source.routeStepId,
    outputs: request.outputs?.length ? request.outputs : source.outputs,
    metadata: {
      createdByAction: "split_node",
      splitFromNodeId: source.id,
    },
  });
  const nodes = specTree.nodes
    .map(item =>
      item.id === parent.id
        ? { ...item, children: uniqueStrings(item.children.concat(node.id)) }
        : item
    )
    .concat(node);

  return {
    ok: true,
    specTree: { ...specTree, nodes },
    node,
  };
}

function setCurrentSpecTreeVersion(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  versionId: string,
  updatedAt: string
): ApplySpecTreeActionResult {
  const version = findSpecTreeVersion(job, versionId);
  if (!version) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint SPEC tree version not found.",
      message: `No SPEC tree version ${versionId} exists in job ${job.id}.`,
    };
  }
  if (version.treeId !== specTree.id) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC tree version mismatch.",
      message: `SPEC tree version ${versionId} does not belong to tree ${specTree.id}.`,
    };
  }

  return {
    ok: true,
    specTree: {
      ...cloneSpecTree(version.snapshot),
      updatedAt,
    },
    version,
  };
}

function findSpecTreeNode(
  specTree: BlueprintSpecTree,
  nodeId: string
): BlueprintSpecTreeNode | undefined {
  return specTree.nodes.find(node => node.id === nodeId);
}

function findSpecTreeVersion(
  job: BlueprintGenerationJob,
  versionId: string
): BlueprintSpecTreeVersionSnapshot | undefined {
  const artifact = job.artifacts.find(
    item =>
      item.type === "spec_tree_version" &&
      (item.id === versionId ||
        (isPlainRecord(item.payload) && item.payload.id === versionId))
  );

  return artifact?.payload as BlueprintSpecTreeVersionSnapshot | undefined;
}

function collectSpecTreeSubtreeIds(
  specTree: BlueprintSpecTree,
  nodeId: string
): Set<string> {
  const byId = new Map(specTree.nodes.map(node => [node.id, node]));
  const ids = new Set<string>();
  const visit = (id: string): void => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const childId of byId.get(id)?.children ?? []) {
      visit(childId);
    }
  };
  visit(nodeId);
  return ids;
}

function specTreeNodeNotFound(
  nodeId: string,
  treeId: string
): { ok: false; status: 404; error: string; message: string } {
  return {
    ok: false,
    status: 404,
    error: "Blueprint SPEC tree node not found.",
    message: `No node ${nodeId} exists in SPEC tree ${treeId}.`,
  };
}

function describeSpecTreeAction(
  request: BlueprintSpecTreeActionRequest,
  node?: BlueprintSpecTreeNode
): string {
  switch (request.action) {
    case "add_node":
      return `Added SPEC tree node ${node?.title ?? request.title}.`;
    case "delete_node":
      return `Deleted SPEC tree node ${node?.title ?? request.nodeId}.`;
    case "move_node":
      return `Moved SPEC tree node ${node?.title ?? request.nodeId}.`;
    case "merge_nodes":
      return `Merged SPEC tree node ${request.sourceNodeId} into ${node?.title ?? request.targetNodeId}.`;
    case "split_node":
      return `Split SPEC tree node ${request.sourceNodeId} into ${node?.title ?? request.title}.`;
    case "set_current_version":
      return `Restored SPEC tree version ${request.versionId}.`;
  }
}

function saveSpecTreeVersion(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: { title?: string; summary?: string; savedBy?: string },
  options: CreateGenerationJobOptions
): BlueprintSaveSpecTreeVersionResponse {
  const savedAt = (options.now?.() ?? new Date()).toISOString();
  const snapshot: BlueprintSpecTreeVersionSnapshot = {
    id: createId("blueprint-spec-tree-version"),
    treeId: specTree.id,
    version: specTree.version,
    title: request.title,
    summary: request.summary,
    savedAt,
    savedBy: request.savedBy,
    snapshot: cloneSpecTree(specTree),
    provenance: {
      jobId: job.id,
      projectId: job.projectId,
      sourceId: job.sourceId,
    },
  };
  const versionArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "spec_tree_version",
    title: request.title ?? `SPEC tree v${specTree.version}`,
    summary: request.summary ?? "Saved SPEC tree version snapshot for replay.",
    createdAt: savedAt,
    payload: snapshot,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    updatedAt: savedAt,
    artifacts: job.artifacts.concat(versionArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_tree",
        status: "reviewing",
        type: "job.completed",
        message: `Saved SPEC tree version ${specTree.version}.`,
        occurredAt: savedAt,
        payload: {
          specTreeId: specTree.id,
          versionId: snapshot.id,
          version: snapshot.version,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    job: updatedJob,
    specTree,
    version: snapshot,
  };
}

function parseEffectPreviewFilters(
  query: Record<string, unknown>
): ParseEffectPreviewFiltersResult {
  return {
    ok: true,
    filters: {
      nodeId: readString(query.nodeId),
    },
  };
}

type SaveSpecDocumentVersionResult =
  | {
      ok: true;
      response: BlueprintSaveSpecDocumentVersionResponse;
    }
  | { ok: false; status: number; error: string; message: string };

function saveSpecDocumentVersion(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  documentId: string,
  request: { savedBy?: string; reviewNote?: string },
  options: CreateGenerationJobOptions
): SaveSpecDocumentVersionResult {
  const savedAt = (options.now?.() ?? new Date()).toISOString();
  const document = findSpecDocument(job, documentId);

  if (!document) {
    return specDocumentNotFound(documentId, job.id);
  }

  const sourceDocumentId = document.sourceDocumentId ?? document.id;
  const versionNumber = (document.version ?? 1) + 1;
  const status = document.status ?? "draft";
  const snapshot: BlueprintSpecDocumentVersionSnapshot = {
    id: createId("blueprint-spec-document-version"),
    documentId: document.id,
    sourceDocumentId,
    jobId: document.jobId,
    treeId: document.treeId,
    nodeId: document.nodeId,
    type: document.type,
    version: versionNumber,
    status,
    title: document.title,
    summary: document.summary,
    content: document.content,
    format: document.format,
    savedAt,
    savedBy: request.savedBy,
    acceptedAt: document.acceptedAt,
    reviewedAt: document.reviewedAt,
    rejectedAt: document.rejectedAt,
    reviewedBy: document.reviewedBy,
    reviewNote: request.reviewNote ?? document.reviewNote,
    provenance: { ...document.provenance },
  };
  const updatedDocument: BlueprintSpecDocument = {
    ...document,
    version: versionNumber,
    sourceDocumentId,
    status: "draft",
    updatedAt: savedAt,
    reviewedAt: undefined,
    acceptedAt: undefined,
    rejectedAt: undefined,
    reviewedBy: undefined,
    reviewNote: request.reviewNote ?? document.reviewNote,
  };
  const versionArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "spec_document_version",
    title: `${document.title} v${versionNumber}`,
    summary: "Saved SPEC document version snapshot for review traceability.",
    createdAt: savedAt,
    payload: snapshot,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_docs",
    updatedAt: savedAt,
    artifacts: replaceSpecDocumentArtifact(
      job.artifacts,
      updatedDocument
    ).concat(versionArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_docs",
        status: "reviewing",
        type: "job.stage",
        message: `Saved SPEC document ${document.title} version ${versionNumber}.`,
        occurredAt: savedAt,
        payload: {
          documentId: document.id,
          sourceDocumentId,
          versionId: snapshot.id,
          version: snapshot.version,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree,
      document: updatedDocument,
      version: snapshot,
    },
  };
}

type ReviewSpecDocumentResult =
  | { ok: true; response: BlueprintReviewSpecDocumentResponse }
  | { ok: false; status: number; error: string; message: string };

function reviewSpecDocument(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  documentId: string,
  request: BlueprintReviewSpecDocumentRequest,
  options: CreateGenerationJobOptions
): ReviewSpecDocumentResult {
  const reviewedAt = (options.now?.() ?? new Date()).toISOString();
  const document = findSpecDocument(job, documentId);

  if (!document) {
    return specDocumentNotFound(documentId, job.id);
  }

  const sourceDocumentId = document.sourceDocumentId ?? document.id;
  const updatedDocument: BlueprintSpecDocument = {
    ...document,
    sourceDocumentId,
    status: request.status,
    updatedAt: reviewedAt,
    reviewedAt,
    acceptedAt: request.status === "accepted" ? reviewedAt : undefined,
    rejectedAt: request.status === "rejected" ? reviewedAt : undefined,
    reviewedBy: request.reviewedBy,
    reviewNote: request.reviewNote,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_docs",
    updatedAt: reviewedAt,
    artifacts: replaceSpecDocumentArtifact(job.artifacts, updatedDocument),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_docs",
        status: "reviewing",
        type: "job.stage",
        message: `Marked SPEC document ${document.title} as ${request.status}.`,
        occurredAt: reviewedAt,
        payload: {
          documentId: document.id,
          sourceDocumentId,
          version: document.version ?? 1,
          status: request.status,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree,
      document: updatedDocument,
    },
  };
}

function generateSpecDocuments(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintGenerateSpecDocumentsRequest,
  options: CreateGenerationJobOptions
): BlueprintSpecDocumentsResponse {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const targetNodeIds = request.nodeId
    ? new Set([request.nodeId])
    : new Set(specTree.nodes.map(node => node.id));
  const targetTypes =
    request.types && request.types.length > 0
      ? request.types
      : SPEC_DOCUMENT_TYPES;
  const documents = specTree.nodes
    .filter(node => targetNodeIds.has(node.id))
    .flatMap(node =>
      targetTypes.map(type =>
        buildSpecDocument({
          job,
          specTree,
          node,
          type,
          createdAt,
        })
      )
    );
  const generatedDocumentKeys = new Set(
    documents.map(document => `${document.nodeId}:${document.type}`)
  );
  const documentArtifacts = documents.map(document => ({
    id: createId("blueprint-artifact"),
    type: document.type,
    title: document.title,
    summary: document.summary,
    createdAt,
    payload: document,
  })) satisfies BlueprintGenerationArtifact[];
  const preservedArtifacts = job.artifacts.filter(
    artifact => {
      if (
        artifact.type !== "requirements" &&
        artifact.type !== "design" &&
        artifact.type !== "tasks"
      ) {
        return true;
      }

      const payload = isPlainRecord(artifact.payload) ? artifact.payload : null;
      const documentNodeId = readString(payload?.nodeId);
      const documentType = isSpecDocumentType(readString(payload?.type))
        ? (readString(payload?.type) as BlueprintSpecDocumentType)
        : (artifact.type as BlueprintSpecDocumentType);

      if (!documentNodeId) {
        return false;
      }

      return !generatedDocumentKeys.has(`${documentNodeId}:${documentType}`);
    }
  );
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "spec_docs",
    updatedAt: createdAt,
    artifacts: preservedArtifacts.concat(documentArtifacts),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "spec_docs",
        status: "completed",
        type: "job.completed",
        message: "SPEC documents generated from the selected SPEC tree.",
        occurredAt: createdAt,
        payload: {
          specTreeId: specTree.id,
          nodeCount: specTree.nodes.length,
          documentCount: documents.length,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    job: updatedJob,
    specTree,
    documents: extractSpecDocuments(updatedJob),
  };
}

type GenerateEffectPreviewsResult =
  | {
      ok: true;
      response: BlueprintEffectPreviewsResponse;
    }
  | { ok: false; status: number; error: string; message: string };

function generateEffectPreviews(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintGenerateEffectPreviewsRequest,
  options: CreateGenerationJobOptions
): GenerateEffectPreviewsResult {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const includeDrafts = request.includeDrafts ?? false;
  const targetNodeIds = request.nodeId
    ? new Set([request.nodeId])
    : new Set(specTree.nodes.map(node => node.id));
  const targetNodes = specTree.nodes.filter(node => targetNodeIds.has(node.id));
  const sourceDocuments = extractSpecDocuments(job).filter(document => {
    if (!targetNodeIds.has(document.nodeId)) {
      return false;
    }

    const status = normalizeSpecDocumentStatus(document.status);
    return includeDrafts ? status !== "rejected" : status === "accepted";
  });

  if (sourceDocuments.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC documents not ready.",
      message: includeDrafts
        ? "No draft, reviewing, or accepted SPEC documents are available for effect preview generation."
        : "No accepted SPEC documents are available for effect preview generation. Pass includeDrafts=true to generate a draft-source preview.",
    };
  }

  const previews = targetNodes
    .map(node => {
      const documents = sourceDocuments.filter(
        document => document.nodeId === node.id
      );
      if (documents.length === 0) {
        return null;
      }

      return buildEffectPreview({
        job,
        specTree,
        node,
        documents,
        includeDrafts,
        createdAt,
      });
    })
    .filter((preview): preview is BlueprintEffectPreview => Boolean(preview));

  if (previews.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC documents not ready.",
      message: `No usable SPEC documents are attached to the requested SPEC tree node set.`,
    };
  }

  const replacedNodeIds = new Set(previews.map(preview => preview.nodeId));
  const previewArtifacts = previews.map(preview => ({
    id: createId("blueprint-artifact"),
    type: "effect_preview",
    title: `Effect preview: ${preview.provenance.nodeTitle}`,
    summary: preview.summary,
    createdAt,
    payload: preview,
  })) satisfies BlueprintGenerationArtifact[];
  const preservedArtifacts = job.artifacts.filter(artifact => {
    if (artifact.type !== "effect_preview") {
      return true;
    }

    const payload = isPlainRecord(artifact.payload) ? artifact.payload : null;
    const nodeId = readString(payload?.nodeId);
    return !nodeId || !replacedNodeIds.has(nodeId);
  });
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "effect_preview",
    updatedAt: createdAt,
    artifacts: preservedArtifacts.concat(previewArtifacts),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "effect_preview",
        status: "completed",
        type: "job.completed",
        message: includeDrafts
          ? "Effect previews generated from draft-capable SPEC documents."
          : "Effect previews generated from accepted SPEC documents.",
        occurredAt: createdAt,
        payload: {
          specTreeId: specTree.id,
          previewCount: previews.length,
          sourceDocumentCount: sourceDocuments.length,
          includeDrafts,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree,
      effectPreviews: extractEffectPreviews(updatedJob),
    },
  };
}

type GenerateImplementationPromptPackagesResult =
  | {
      ok: true;
      response: BlueprintImplementationPromptPackagesResponse;
    }
  | { ok: false; status: number; error: string; message: string };

function generateImplementationPromptPackages(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintGenerateImplementationPromptPackagesRequest,
  options: CreateGenerationJobOptions
): GenerateImplementationPromptPackagesResult {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const includeDrafts = request.includeDrafts ?? false;
  const includePreviewDrafts = request.includePreviewDrafts ?? false;
  const targetPlatforms =
    request.targetPlatforms && request.targetPlatforms.length > 0
      ? request.targetPlatforms
      : PROMPT_TARGET_PLATFORMS.slice(0, 3);
  const targetNodeIds = request.nodeId
    ? new Set([request.nodeId])
    : new Set(specTree.nodes.map(node => node.id));
  const candidateDocuments = extractSpecDocuments(job).filter(document =>
    targetNodeIds.has(document.nodeId)
  );
  const acceptedDocuments = candidateDocuments.filter(
    document => normalizeSpecDocumentStatus(document.status) === "accepted"
  );
  const sourceDocuments =
    acceptedDocuments.length > 0
      ? acceptedDocuments
      : includeDrafts
        ? candidateDocuments.filter(
            document => normalizeSpecDocumentStatus(document.status) !== "rejected"
          )
        : [];

  if (sourceDocuments.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint SPEC documents not ready.",
      message: includeDrafts
        ? "No draft, reviewing, or accepted SPEC documents are available for implementation prompt packaging."
        : "No accepted SPEC documents are available for implementation prompt packaging. Pass includeDrafts=true to package draft-source documents.",
    };
  }

  const candidatePreviews = extractEffectPreviews(job).filter(preview =>
    targetNodeIds.has(preview.nodeId)
  );
  const acceptedPreviews = candidatePreviews.filter(
    preview => preview.provenance.sourceStatus === "accepted"
  );
  const sourcePreviews = includePreviewDrafts
    ? candidatePreviews
    : acceptedPreviews;

  if (sourcePreviews.length === 0 && !includeDrafts && !includePreviewDrafts) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint effect previews not ready.",
      message:
        "No accepted effect previews are available for implementation prompt packaging. Pass includePreviewDrafts=true or includeDrafts=true to generate a document-only base package.",
    };
  }

  const nodeIds = uniqueStrings(
    sourceDocuments
      .map(document => document.nodeId)
      .concat(sourcePreviews.map(preview => preview.nodeId))
  );
  const sourceDocumentIds = sourceDocuments.map(document => document.id);
  const sourcePreviewIds = sourcePreviews.map(preview => preview.id);
  const nodes = specTree.nodes.filter(node => nodeIds.includes(node.id));
  const packages = targetPlatforms.map(targetPlatform =>
    buildImplementationPromptPackage({
      job,
      specTree,
      targetPlatform,
      nodes,
      documents: sourceDocuments,
      previews: sourcePreviews,
      includeDrafts,
      includePreviewDrafts,
      createdAt,
    })
  );
  const generatedKeys = new Set(
    packages.map(promptPackage => promptPackageReplacementKey(promptPackage))
  );
  const packageArtifacts = packages.map(promptPackage => ({
    id: createId("blueprint-artifact"),
    type: "prompt_pack",
    title: promptPackage.title,
    summary: promptPackage.summary,
    createdAt,
    payload: promptPackage,
  })) satisfies BlueprintGenerationArtifact[];
  const preservedArtifacts = job.artifacts.filter(artifact => {
    if (artifact.type !== "prompt_pack") {
      return true;
    }

    const payload = isPlainRecord(artifact.payload)
      ? (artifact.payload as Partial<BlueprintImplementationPromptPackage>)
      : null;
    if (!payload?.targetPlatform || !Array.isArray(payload.nodeIds)) {
      return false;
    }

    return !generatedKeys.has(
      `${payload.targetPlatform}:${payload.nodeIds.join("|")}`
    );
  });
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "prompt_packaging",
    updatedAt: createdAt,
    completedAt: createdAt,
    artifacts: preservedArtifacts.concat(packageArtifacts),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "prompt_packaging",
        status: "completed",
        type: "job.completed",
        message:
          sourcePreviews.length > 0
            ? "Implementation prompt packages generated from SPEC documents and effect previews."
            : "Implementation prompt packages generated from SPEC documents without effect previews.",
        occurredAt: createdAt,
        payload: {
          specTreeId: specTree.id,
          nodeIds,
          sourceDocumentIds,
          sourcePreviewIds,
          targetPlatforms,
          includeDrafts,
          includePreviewDrafts,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree,
      promptPackages: extractImplementationPromptPackages(updatedJob),
    },
  };
}

type GenerateEngineeringLandingPlansResult =
  | {
      ok: true;
      response: BlueprintEngineeringLandingPlansResponse;
    }
  | { ok: false; status: number; error: string; message: string };

function generateEngineeringLandingPlans(
  job: BlueprintGenerationJob,
  specTree: BlueprintSpecTree,
  request: BlueprintGenerateEngineeringLandingPlansRequest,
  options: CreateGenerationJobOptions
): GenerateEngineeringLandingPlansResult {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const selectedPromptPackages = selectEngineeringLandingPromptPackages(
    job,
    request
  );

  if (!selectedPromptPackages.ok) {
    return selectedPromptPackages;
  }

  const sourceDocuments = extractSpecDocuments(job);
  const sourcePreviews = extractEffectPreviews(job);
  const plans = selectedPromptPackages.promptPackages.map(promptPackage =>
    buildEngineeringLandingPlan({
      job,
      specTree,
      promptPackage,
      sourceDocuments,
      sourcePreviews,
      createdAt,
    })
  );
  const generatedKeys = new Set(
    plans.map(plan => engineeringLandingPlanReplacementKey(plan))
  );
  const planArtifacts = plans.map(plan => ({
    id: createId("blueprint-artifact"),
    type: "engineering_plan",
    title: plan.title,
    summary: plan.summary,
    createdAt,
    payload: plan,
  })) satisfies BlueprintGenerationArtifact[];
  const preservedArtifacts = job.artifacts.filter(artifact => {
    if (artifact.type !== "engineering_plan") {
      return true;
    }

    const payload = isPlainRecord(artifact.payload)
      ? (artifact.payload as Partial<BlueprintEngineeringLandingPlan>)
      : null;
    if (!Array.isArray(payload?.promptPackageIds)) {
      return false;
    }

    return !generatedKeys.has(payload.promptPackageIds.join("|"));
  });
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "engineering_landing",
    updatedAt: createdAt,
    completedAt: createdAt,
    artifacts: preservedArtifacts.concat(planArtifacts),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "engineering_landing",
        status: "completed",
        type: "job.completed",
        message:
          "Engineering landing plans generated from implementation prompt packages.",
        occurredAt: createdAt,
        payload: {
          specTreeId: specTree.id,
          planCount: plans.length,
          promptPackageIds: plans.flatMap(plan => plan.promptPackageIds),
          targetPlatforms: plans.flatMap(plan =>
            Object.values(plan.provenance.promptPackagePlatforms)
          ),
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      specTree,
      engineeringLandingPlans: extractEngineeringLandingPlans(updatedJob),
    },
  };
}

function selectEngineeringLandingPromptPackages(
  job: BlueprintGenerationJob,
  request: BlueprintGenerateEngineeringLandingPlansRequest
):
  | {
      ok: true;
      promptPackages: BlueprintImplementationPromptPackage[];
    }
  | { ok: false; status: number; error: string; message: string } {
  const promptPackages = extractImplementationPromptPackages(job);

  if (promptPackages.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint implementation prompt packages not ready.",
      message:
        "No implementation prompt packages are available for engineering landing. Generate prompt packages before creating landing plans.",
    };
  }

  let selectedPromptPackages = promptPackages;
  if (request.promptPackageId) {
    const promptPackage = promptPackages.find(
      item => item.id === request.promptPackageId
    );

    if (!promptPackage) {
      return {
        ok: false,
        status: 404,
        error: "Blueprint implementation prompt package not found.",
        message: `No implementation prompt package ${request.promptPackageId} exists in job ${job.id}.`,
      };
    }

    selectedPromptPackages = [promptPackage];
  }

  const targetPlatforms =
    request.targetPlatforms ??
    (request.targetPlatform ? [request.targetPlatform] : undefined);

  if (targetPlatforms) {
    selectedPromptPackages = selectedPromptPackages.filter(promptPackage =>
      targetPlatforms.includes(promptPackage.targetPlatform)
    );
  }

  if (selectedPromptPackages.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Blueprint implementation prompt packages not ready.",
      message:
        "No implementation prompt packages match the requested engineering landing filter.",
    };
  }

  return { ok: true, promptPackages: selectedPromptPackages };
}

type GetOrCreateCapabilityRegistryResult = {
  job: BlueprintGenerationJob;
  capabilities: BlueprintRuntimeCapability[];
};

function getOrCreateCapabilityRegistry(
  job: BlueprintGenerationJob,
  options: CreateGenerationJobOptions
): GetOrCreateCapabilityRegistryResult {
  const existing = extractRuntimeCapabilities(job);
  const hasRegistry = job.artifacts.some(
    artifact => artifact.type === "capability_registry"
  );

  if (hasRegistry) {
    return { job, capabilities: existing };
  }

  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const capabilities = getDefaultRuntimeCapabilities();
  const registryArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "capability_registry",
    title: "Runtime capability registry",
    summary: `Registered ${capabilities.length} default runtime capability adapters.`,
    createdAt,
    payload: {
      id: createId("blueprint-capability-registry"),
      jobId: job.id,
      createdAt,
      updatedAt: createdAt,
      capabilities,
      sourceIds: {
        capabilityIds: capabilities.map(capability => capability.id),
      },
    },
  };
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: "reviewing",
    stage: "runtime_capability",
    updatedAt: createdAt,
    artifacts: job.artifacts.concat(registryArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        type: "job.stage",
        stage: "runtime_capability",
        status: "reviewing",
        message: "Runtime capability registry registered.",
        occurredAt: createdAt,
        payload: {
          capabilityIds: capabilities.map(capability => capability.id),
          capabilityCount: capabilities.length,
        },
      })
    ),
  };

  options.store.save(updatedJob);
  return { job: updatedJob, capabilities };
}

type InvokeCapabilityResult =
  | { ok: true; response: BlueprintInvokeCapabilityResponse }
  | { ok: false; status: number; error: string; message: string };

function invokeCapability(
  job: BlueprintGenerationJob,
  request: BlueprintCapabilityInvocationRequest,
  options: CreateGenerationJobOptions
): InvokeCapabilityResult {
  const registry = getOrCreateCapabilityRegistry(job, options);
  const capability = registry.capabilities.find(
    item => item.id === request.capabilityId
  );

  if (!capability) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint runtime capability not found.",
      message: `No runtime capability ${request.capabilityId} exists in job ${job.id}.`,
    };
  }

  const safetyGate = evaluateCapabilitySafetyGate(capability, request);
  if (safetyGate.status === "blocked") {
    return {
      ok: false,
      status: 403,
      error: "Blueprint runtime capability approval required.",
      message: safetyGate.reason,
    };
  }

  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const routeSet = extractRouteSet(registry.job);
  const specTree = extractSpecTree(registry.job);
  const route = routeSet?.routes.find(item => item.id === request.routeId);
  const node = specTree?.nodes.find(item => item.id === request.nodeId);
  const outputSummary = buildCapabilityOutputSummary({
    capability,
    routeTitle: route?.title,
    nodeTitle: node?.title,
    input: request.input,
  });
  const invocation: BlueprintCapabilityInvocation = {
    id: createId("blueprint-capability-invocation"),
    jobId: registry.job.id,
    capabilityId: capability.id,
    capabilityLabel: capability.label,
    kind: capability.kind,
    status: "completed",
    securityLevel: capability.securityLevel,
    safetyGate,
    requestedAt: createdAt,
    completedAt: createdAt,
    requestedBy: request.requestedBy,
    routeId: request.routeId,
    nodeId: request.nodeId,
    input: request.input,
    outputSummary,
    logs: buildCapabilityInvocationLogs(capability, outputSummary),
    evidenceIds: [],
    durationMs: deterministicCapabilityDuration(capability, request),
    provenance: {
      jobId: registry.job.id,
      projectId: registry.job.projectId,
      sourceId: registry.job.sourceId,
      routeSetId: routeSet?.id,
      routeId: request.routeId,
      specTreeId: specTree?.id,
      nodeId: request.nodeId,
      targetText: registry.job.request.targetText,
      githubUrls: registry.job.request.githubUrls ?? [],
    },
  };
  const evidence = buildCapabilityEvidence({
    job: registry.job,
    capability,
    invocation,
    routeSet,
    specTree,
    createdAt,
    tags: request.evidenceTags ?? [],
  });
  const invocationWithEvidence: BlueprintCapabilityInvocation = {
    ...invocation,
    evidenceIds: [evidence.id],
  };
  const invocationArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "capability_invocation",
    title: `Capability invocation: ${capability.label}`,
    summary: outputSummary,
    createdAt,
    payload: invocationWithEvidence,
  };
  const evidenceArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "capability_evidence",
    title: evidence.title,
    summary: evidence.summary,
    createdAt,
    payload: evidence,
  };
  const updatedJob: BlueprintGenerationJob = {
    ...registry.job,
    status: "reviewing",
    stage: "runtime_capability",
    updatedAt: createdAt,
    artifacts: registry.job.artifacts.concat(invocationArtifact, evidenceArtifact),
    events: registry.job.events.concat(
      createGenerationEvent({
        jobId: registry.job.id,
        type: "job.stage",
        stage: "runtime_capability",
        status: "reviewing",
        message: `Runtime capability ${capability.label} completed.`,
        occurredAt: createdAt,
        payload: {
          capabilityId: capability.id,
          invocationId: invocationWithEvidence.id,
          evidenceId: evidence.id,
          routeId: request.routeId,
          nodeId: request.nodeId,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      routeSet,
      specTree,
      capability,
      invocation: invocationWithEvidence,
      evidence,
    },
  };
}

function evaluateCapabilitySafetyGate(
  capability: BlueprintRuntimeCapability,
  request: BlueprintCapabilityInvocationRequest
): BlueprintCapabilityInvocation["safetyGate"] {
  const requiresApproval =
    capability.requiresApproval ||
    capability.status === "requires_approval" ||
    capability.securityLevel === "networked" ||
    capability.securityLevel === "write_enabled";
  const approved = request.approved === true;

  if (requiresApproval && !approved) {
    return {
      status: "blocked",
      reason: `${capability.label} requires approved=true for ${capability.securityLevel} runtime access.`,
      requiresApproval,
      approved,
      securityLevel: capability.securityLevel,
    };
  }

  return {
    status: "allowed",
    reason: requiresApproval
      ? `${capability.label} approved for deterministic runtime simulation.`
      : `${capability.label} allowed by default ${capability.securityLevel} safety policy.`,
    requiresApproval,
    approved,
    securityLevel: capability.securityLevel,
  };
}

function buildCapabilityOutputSummary(input: {
  capability: BlueprintRuntimeCapability;
  routeTitle?: string;
  nodeTitle?: string;
  input?: string;
}): string {
  const target = input.nodeTitle ?? input.routeTitle ?? "job context";
  const normalizedInput = input.input
    ? input.input.replace(/\s+/g, " ").slice(0, 120)
    : "no explicit input";

  return `${input.capability.label} simulated ${input.capability.kind} execution for ${target} using ${normalizedInput}.`;
}

function buildCapabilityInvocationLogs(
  capability: BlueprintRuntimeCapability,
  outputSummary: string
): string[] {
  return [
    `adapter=${capability.adapter}`,
    `security=${capability.securityLevel}`,
    `status=completed`,
    outputSummary,
  ];
}

function deterministicCapabilityDuration(
  capability: BlueprintRuntimeCapability,
  request: BlueprintCapabilityInvocationRequest
): number {
  const seed = `${capability.id}:${request.routeId ?? ""}:${request.nodeId ?? ""}:${request.input ?? ""}`;
  return 200 + (seed.length % 37) * 25;
}

function buildCapabilityEvidence(input: {
  job: BlueprintGenerationJob;
  capability: BlueprintRuntimeCapability;
  invocation: BlueprintCapabilityInvocation;
  routeSet?: BlueprintRouteSet;
  specTree?: BlueprintSpecTree;
  createdAt: string;
  tags: string[];
}): BlueprintCapabilityEvidence {
  const kind = mapCapabilityEvidenceKind(input.capability);
  const title = `Capability evidence: ${input.capability.label}`;
  const summary = `${input.capability.label} recorded ${kind} evidence for invocation ${input.invocation.id}.`;

  return {
    id: createId("blueprint-capability-evidence"),
    jobId: input.job.id,
    invocationId: input.invocation.id,
    capabilityId: input.capability.id,
    capabilityLabel: input.capability.label,
    kind,
    status: "recorded",
    title,
    summary,
    createdAt: input.createdAt,
    routeSetId: input.routeSet?.id,
    routeId: input.invocation.routeId,
    specTreeId: input.specTree?.id,
    nodeId: input.invocation.nodeId,
    artifacts: [`${input.capability.adapter}:${input.invocation.id}`],
    logs: input.invocation.logs,
    tags: uniqueStrings([
      input.capability.kind,
      input.capability.securityLevel,
      ...input.capability.tags,
      ...input.tags,
    ]),
    payloadSummary: {
      id: input.invocation.id,
      capabilityId: input.capability.id,
      status: input.invocation.status,
      durationMs: input.invocation.durationMs,
      securityLevel: input.capability.securityLevel,
      evidenceKind: kind,
    },
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      routeSetId: input.routeSet?.id,
      routeId: input.invocation.routeId,
      specTreeId: input.specTree?.id,
      nodeId: input.invocation.nodeId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
    },
  };
}

function mapCapabilityEvidenceKind(
  capability: BlueprintRuntimeCapability
): BlueprintCapabilityEvidence["kind"] {
  if (capability.kind === "docker") return "log";
  if (capability.kind === "skill") return "diagram";
  if (capability.kind === "mcp") return "document";
  if (capability.kind === "role") return "safety";
  return "analysis";
}

function filterCapabilityInvocations(
  invocations: BlueprintCapabilityInvocation[],
  filters: BlueprintFetchCapabilityInvocationsRequest
): BlueprintCapabilityInvocation[] {
  return invocations.filter(invocation => {
    if (filters.capabilityId && invocation.capabilityId !== filters.capabilityId) {
      return false;
    }
    if (filters.nodeId && invocation.nodeId !== filters.nodeId) {
      return false;
    }
    if (filters.routeId && invocation.routeId !== filters.routeId) {
      return false;
    }
    return true;
  });
}

function filterCapabilityEvidence(
  evidence: BlueprintCapabilityEvidence[],
  filters: BlueprintFetchCapabilityEvidenceRequest
): BlueprintCapabilityEvidence[] {
  return evidence.filter(item => {
    if (filters.capabilityId && item.capabilityId !== filters.capabilityId) {
      return false;
    }
    if (filters.nodeId && item.nodeId !== filters.nodeId) {
      return false;
    }
    if (filters.routeId && item.routeId !== filters.routeId) {
      return false;
    }
    return true;
  });
}

type RecordEngineeringRunResult =
  | {
      ok: true;
      response: BlueprintRecordEngineeringRunResponse;
    }
  | { ok: false; status: number; error: string; message: string };

function recordEngineeringRun(
  job: BlueprintGenerationJob,
  request: BlueprintRecordEngineeringRunRequest,
  options: CreateGenerationJobOptions
): RecordEngineeringRunResult {
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const landingPlan = extractEngineeringLandingPlans(job).find(
    plan => plan.id === request.landingPlanId
  );

  if (!landingPlan) {
    return {
      ok: false,
      status: 404,
      error: "Blueprint engineering landing plan not found.",
      message: `No engineering landing plan ${request.landingPlanId} exists in job ${job.id}.`,
    };
  }

  const requestedPromptPackageIds = request.promptPackageIds ?? [];
  const promptPackageIds =
    requestedPromptPackageIds.length > 0
      ? requestedPromptPackageIds.filter(promptPackageId =>
          landingPlan.promptPackageIds.includes(promptPackageId)
        )
      : landingPlan.promptPackageIds;

  if (
    requestedPromptPackageIds.length > 0 &&
    promptPackageIds.length !== requestedPromptPackageIds.length
  ) {
    return {
      ok: false,
      status: 400,
      error: "Invalid blueprint engineering run request.",
      message:
        "promptPackageIds must refer to implementation prompt packages used by the landing plan.",
    };
  }

  const capabilityInvocationIds = uniqueStrings(
    request.capabilityInvocationIds ?? []
  );
  const capabilityEvidenceIds = uniqueStrings(request.capabilityEvidenceIds ?? []);
  const knownInvocationIds = new Set(
    extractCapabilityInvocations(job).map(invocation => invocation.id)
  );
  const knownEvidenceIds = new Set(
    extractCapabilityEvidence(job).map(evidence => evidence.id)
  );

  if (capabilityInvocationIds.some(id => !knownInvocationIds.has(id))) {
    return {
      ok: false,
      status: 400,
      error: "Invalid blueprint engineering run request.",
      message:
        "capabilityInvocationIds must refer to capability invocations recorded in the job.",
    };
  }

  if (capabilityEvidenceIds.some(id => !knownEvidenceIds.has(id))) {
    return {
      ok: false,
      status: 400,
      error: "Invalid blueprint engineering run request.",
      message:
        "capabilityEvidenceIds must refer to capability evidence recorded in the job.",
    };
  }

  const status = request.status ?? "running";
  const startedAt =
    request.startedAt ??
    (status === "planned" ? undefined : request.completedAt ?? createdAt);
  const completedAt =
    request.completedAt ??
    (status === "passed" || status === "failed" || status === "blocked"
      ? createdAt
      : undefined);
  const summary =
    request.summary ??
    `Engineering run ${status} for ${landingPlan.title}.`;
  const engineeringRun: BlueprintEngineeringRun = {
    id: createId("blueprint-engineering-run"),
    jobId: job.id,
    landingPlanId: landingPlan.id,
    status,
    startedAt,
    completedAt,
    summary,
    logs: request.logs ?? [],
    verificationResults: request.verificationResults ?? [],
    changedFiles: request.changedFiles ?? [],
    promptPackageIds,
    capabilityInvocationIds,
    capabilityEvidenceIds,
    provenance: {
      jobId: job.id,
      projectId: job.projectId,
      sourceId: job.sourceId,
      targetText: job.request.targetText,
      githubUrls: job.request.githubUrls ?? [],
      landingPlanId: landingPlan.id,
      treeId: landingPlan.treeId,
      treeVersion: landingPlan.provenance.treeVersion,
      promptPackageIds,
      capabilityInvocationIds,
      capabilityEvidenceIds,
    },
  };
  const runArtifact: BlueprintGenerationArtifact = {
    id: createId("blueprint-artifact"),
    type: "engineering_run",
    title: `Engineering run: ${landingPlan.title}`,
    summary,
    createdAt,
    payload: engineeringRun,
  };
  const jobStatus = mapEngineeringRunStatusToJobStatus(status);
  const updatedJob: BlueprintGenerationJob = {
    ...job,
    status: jobStatus,
    stage: "engineering_landing",
    updatedAt: createdAt,
    completedAt:
      jobStatus === "completed" || jobStatus === "failed"
        ? completedAt ?? createdAt
        : job.completedAt,
    artifacts: job.artifacts.concat(runArtifact),
    events: job.events.concat(
      createGenerationEvent({
        jobId: job.id,
        stage: "engineering_landing",
        status: jobStatus,
        type: mapEngineeringRunStatusToEventType(status),
        message: `Recorded engineering run ${engineeringRun.status} for ${landingPlan.title}.`,
        occurredAt: createdAt,
        payload: {
          runId: engineeringRun.id,
          landingPlanId: landingPlan.id,
          status: engineeringRun.status,
          promptPackageIds,
          capabilityInvocationIds,
          capabilityEvidenceIds,
          changedFiles: engineeringRun.changedFiles,
          verificationResultCount: engineeringRun.verificationResults.length,
        },
      })
    ),
  };

  options.store.save(updatedJob);

  return {
    ok: true,
    response: {
      job: updatedJob,
      engineeringLandingPlan: landingPlan,
      engineeringRun,
    },
  };
}

function buildImplementationPromptPackage(input: {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  targetPlatform: BlueprintImplementationPromptTargetPlatform;
  nodes: BlueprintSpecTreeNode[];
  documents: BlueprintSpecDocument[];
  previews: BlueprintEffectPreview[];
  includeDrafts: boolean;
  includePreviewDrafts: boolean;
  createdAt: string;
}): BlueprintImplementationPromptPackage {
  const nodeIds = uniqueStrings(input.nodes.map(node => node.id));
  const sourceDocumentIds = input.documents.map(document => document.id);
  const sourcePreviewIds = input.previews.map(preview => preview.id);
  const target = buildImplementationPromptTarget(input.targetPlatform);
  const title = `Implementation prompt package: ${target.label}`;
  const summary =
    input.previews.length > 0
      ? `Implementation prompt package for ${target.label} using SPEC documents and effect previews.`
      : `Document-only implementation prompt package for ${target.label}.`;
  const sections = buildImplementationPromptSections({
    ...input,
    target,
    nodeIds,
    sourceDocumentIds,
    sourcePreviewIds,
  });
  const content = renderImplementationPromptContent({
    title,
    target,
    sections,
    sourceDocumentIds,
    sourcePreviewIds,
  });

  return {
    id: createId("blueprint-prompt-package"),
    jobId: input.job.id,
    treeId: input.specTree.id,
    nodeIds,
    sourceDocumentIds,
    sourcePreviewIds,
    targetPlatform: input.targetPlatform,
    target,
    title,
    summary,
    content,
    sections,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
      treeVersion: input.specTree.version,
      nodeIds,
      sourceDocumentIds,
      sourcePreviewIds,
      targetPlatform: input.targetPlatform,
      sourceDocumentStatus: resolvePromptDocumentSourceStatus(input.documents),
      sourcePreviewStatus: resolvePromptPreviewSourceStatus(input.previews),
      includeDrafts: input.includeDrafts,
      includePreviewDrafts: input.includePreviewDrafts,
      sourceDocumentStatuses: Object.fromEntries(
        input.documents.map(document => [
          document.id,
          normalizeSpecDocumentStatus(document.status),
        ])
      ),
      sourcePreviewStatuses: Object.fromEntries(
        input.previews.map(preview => [preview.id, preview.status])
      ),
    },
  };
}

function buildEngineeringLandingPlan(input: {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  promptPackage: BlueprintImplementationPromptPackage;
  sourceDocuments: BlueprintSpecDocument[];
  sourcePreviews: BlueprintEffectPreview[];
  createdAt: string;
}): BlueprintEngineeringLandingPlan {
  const sourceNodeIds = uniqueStrings(input.promptPackage.nodeIds);
  const sourceDocumentIds = uniqueStrings(input.promptPackage.sourceDocumentIds);
  const sourcePreviewIds = uniqueStrings(input.promptPackage.sourcePreviewIds);
  const promptPackageIds = [input.promptPackage.id];
  const sourceNodes = input.specTree.nodes.filter(node =>
    sourceNodeIds.includes(node.id)
  );
  const sourceDocuments = input.sourceDocuments.filter(document =>
    sourceDocumentIds.includes(document.id)
  );
  const sourcePreviews = input.sourcePreviews.filter(preview =>
    sourcePreviewIds.includes(preview.id)
  );
  const verificationCommands = buildEngineeringLandingVerificationCommands();
  const status = resolveEngineeringLandingPlanStatus(input.promptPackage);
  const steps = buildEngineeringLandingSteps({
    promptPackage: input.promptPackage,
    status,
    sourceNodeIds,
    sourceDocumentIds,
    sourcePreviewIds,
    promptPackageIds,
    verificationCommands,
  });
  const handoffs = [
    buildEngineeringPlatformHandoff({
      promptPackage: input.promptPackage,
      sourceNodes,
      sourceDocumentIds,
      sourcePreviewIds,
      steps,
      verificationCommands,
    }),
  ];
  const targetLabel = input.promptPackage.target.label;
  const sourceNodeTitle =
    sourceNodes.length === 1
      ? sourceNodes[0].title
      : `${sourceNodes.length} source node(s)`;
  const title = `Engineering landing plan: ${targetLabel}`;
  const summary = `Land ${input.promptPackage.title} for ${targetLabel} using ${sourceNodeTitle}, ${sourceDocumentIds.length} SPEC document(s), and ${sourcePreviewIds.length} effect preview(s).`;

  return {
    id: createId("blueprint-engineering-plan"),
    jobId: input.job.id,
    treeId: input.specTree.id,
    status,
    title,
    summary,
    promptPackageIds,
    steps,
    handoffs,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
      treeVersion: input.specTree.version,
      promptPackageIds,
      sourceNodeIds,
      sourceDocumentIds,
      sourcePreviewIds,
      sourceDocumentStatus: input.promptPackage.provenance.sourceDocumentStatus,
      sourcePreviewStatus: input.promptPackage.provenance.sourcePreviewStatus,
      sourceDocumentStatuses: buildEngineeringSourceDocumentStatuses(
        input.promptPackage,
        sourceDocuments,
        sourceDocumentIds
      ),
      sourcePreviewStatuses: buildEngineeringSourcePreviewStatuses(
        input.promptPackage,
        sourcePreviews,
        sourcePreviewIds
      ),
      promptPackagePlatforms: {
        [input.promptPackage.id]: input.promptPackage.targetPlatform,
      },
    },
  };
}

function buildEngineeringLandingSteps(input: {
  promptPackage: BlueprintImplementationPromptPackage;
  status: BlueprintEngineeringLandingPlanStatus;
  sourceNodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
  promptPackageIds: string[];
  verificationCommands: string[];
}): BlueprintEngineeringLandingStep[] {
  const steps: Array<{
    mode: BlueprintEngineeringLandingStepMode;
    title: string;
    summary: string;
  }> = [
    {
      mode: "automatic",
      title: "Bind landing sources",
      summary: `Attach ${input.promptPackage.title} to its source nodes, SPEC documents, effect previews, and platform prompt package.`,
    },
    {
      mode: "manual",
      title: "Apply repository bridge",
      summary:
        "Update the shared contracts and blueprint router so engineering plans and runs are durable job artifacts.",
    },
    {
      mode: "handoff",
      title: "Capture run evidence",
      summary:
        "Record verification results, changed files, logs, and platform handoff evidence against the landing plan.",
    },
  ];

  return steps.map(step => ({
    id: createId("blueprint-engineering-step"),
    title: step.title,
    summary: step.summary,
    mode: step.mode,
    sourceNodeIds: input.sourceNodeIds,
    sourceDocumentIds: input.sourceDocumentIds,
    sourcePreviewIds: input.sourcePreviewIds,
    promptPackageIds: input.promptPackageIds,
    fileScopes: buildEngineeringLandingFileScopes(step.mode),
    verificationCommands: input.verificationCommands,
    riskLevel: resolveEngineeringStepRiskLevel(input.status, step.mode),
  }));
}

function buildEngineeringPlatformHandoff(input: {
  promptPackage: BlueprintImplementationPromptPackage;
  sourceNodes: BlueprintSpecTreeNode[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
  steps: BlueprintEngineeringLandingStep[];
  verificationCommands: string[];
}): BlueprintPlatformHandoff {
  const title = `Platform handoff: ${input.promptPackage.target.label}`;
  const summary = `Use ${input.promptPackage.title} to execute the engineering landing plan and return run evidence.`;

  return {
    id: createId("blueprint-platform-handoff"),
    platform: input.promptPackage.targetPlatform,
    title,
    summary,
    content: renderEngineeringPlatformHandoff({
      title,
      summary,
      promptPackage: input.promptPackage,
      sourceNodes: input.sourceNodes,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
      steps: input.steps,
      verificationCommands: input.verificationCommands,
    }),
    promptPackageId: input.promptPackage.id,
    sourceNodeIds: uniqueStrings(input.promptPackage.nodeIds),
    verificationCommands: input.verificationCommands,
  };
}

function buildImplementationPromptTarget(
  platform: BlueprintImplementationPromptTargetPlatform
): BlueprintImplementationPromptTarget {
  if (platform === "codex") {
    return {
      platform,
      label: "Codex",
      executionMode: "agent",
      guidance:
        "Use this as an implementation task. Inspect the repository first, make focused edits, run verification, and summarize changed files.",
    };
  }

  if (platform === "claude") {
    return {
      platform,
      label: "Claude",
      executionMode: "chat",
      guidance:
        "Use the full context to reason through implementation order, risks, and handoff notes before applying changes in the target workspace.",
    };
  }

  if (platform === "cursor") {
    return {
      platform,
      label: "Cursor",
      executionMode: "workspace",
      guidance:
        "Use the source bindings to scope file search, make incremental code edits, and keep the implementation aligned with accepted SPEC assets.",
    };
  }

  if (platform === "kiro") {
    return {
      platform,
      label: "Kiro",
      executionMode: "workspace",
      guidance:
        "Use this prompt with SPEC-first workflow context and preserve traceability back to requirements, design, tasks, and preview artifacts.",
    };
  }

  if (platform === "trae") {
    return {
      platform,
      label: "Trae",
      executionMode: "workspace",
      guidance:
        "Use this as a workspace coding brief with explicit source assets, implementation steps, and verification expectations.",
    };
  }

  return {
    platform,
    label: "Windsurf",
    executionMode: "workspace",
    guidance:
      "Use this as an agentic coding flow. Keep changes scoped to the source nodes and report verification evidence.",
  };
}

function buildImplementationPromptSections(input: {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  target: BlueprintImplementationPromptTarget;
  nodes: BlueprintSpecTreeNode[];
  documents: BlueprintSpecDocument[];
  previews: BlueprintEffectPreview[];
  nodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
}): BlueprintImplementationPromptSection[] {
  const contextItems: BlueprintImplementationPromptItem[] = input.nodes.map(
    node => ({
      id: createId("blueprint-prompt-item"),
      kind: "source",
      title: node.title,
      content: `${node.summary} Outputs: ${
        node.outputs.length > 0 ? node.outputs.join(", ") : "none"
      }.`,
      nodeIds: [node.id],
      sourceDocumentIds: input.documents
        .filter(document => document.nodeId === node.id)
        .map(document => document.id),
      sourcePreviewIds: input.previews
        .filter(preview => preview.nodeId === node.id)
        .map(preview => preview.id),
    })
  );
  const implementationItems: BlueprintImplementationPromptItem[] =
    input.documents.map(document => ({
      id: createId("blueprint-prompt-item"),
      kind: "instruction",
      title: document.title,
      content: document.content,
      nodeIds: [document.nodeId],
      sourceDocumentIds: [document.id],
      sourcePreviewIds: [],
    }));
  const previewItems: BlueprintImplementationPromptItem[] =
    input.previews.flatMap(preview =>
      [
        {
          title: `Effect preview: ${preview.provenance.nodeTitle}`,
          content: preview.summary,
        },
        ...preview.architectureNotes.map((note, index) => ({
          title: `Architecture note ${index + 1}`,
          content: note,
        })),
        ...preview.progressPlan.map(milestone => ({
          title: `Milestone: ${milestone.title}`,
          content: `${milestone.summary} Target: ${milestone.target}.`,
        })),
      ].map(item => ({
        id: createId("blueprint-prompt-item"),
        kind: "note" as const,
        title: item.title,
        content: item.content,
        nodeIds: [preview.nodeId],
        sourceDocumentIds: [...preview.sourceDocumentIds],
        sourcePreviewIds: [preview.id],
      }))
    );
  const verificationItems = buildImplementationVerificationItems(input);

  return [
    {
      id: createId("blueprint-prompt-section"),
      kind: "context",
      title: "Project Context",
      content: [
        `Target: ${summarizeRequestTarget(input.job.request)}`,
        `Tree: ${input.specTree.id} v${input.specTree.version}`,
        `Platform guidance: ${input.target.guidance}`,
      ].join("\n"),
      items: contextItems,
      nodeIds: input.nodeIds,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
    },
    {
      id: createId("blueprint-prompt-section"),
      kind: "implementation",
      title: "Implementation Brief",
      content:
        "Implement the accepted SPEC scope. Preserve source intent, keep changes focused, and use the linked documents as the canonical requirements, design, and task list.",
      items: implementationItems.concat(previewItems),
      nodeIds: input.nodeIds,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
    },
    {
      id: createId("blueprint-prompt-section"),
      kind: "constraints",
      title: "Constraints",
      content:
        "Do not expand scope beyond the selected SPEC nodes. Keep provenance visible in summaries and call out missing previews when implementation risk changes.",
      items: input.nodes.map(node => ({
        id: createId("blueprint-prompt-item"),
        kind: "constraint",
        title: `Scope: ${node.title}`,
        content:
          node.dependencies.length > 0
            ? `Respect dependencies: ${node.dependencies.join(", ")}.`
            : "No explicit upstream dependencies are recorded.",
        nodeIds: [node.id],
        sourceDocumentIds: input.documents
          .filter(document => document.nodeId === node.id)
          .map(document => document.id),
        sourcePreviewIds: input.previews
          .filter(preview => preview.nodeId === node.id)
          .map(preview => preview.id),
      })),
      nodeIds: input.nodeIds,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
    },
    {
      id: createId("blueprint-prompt-section"),
      kind: "verification",
      title: "Verification Plan",
      content:
        "Run the narrowest meaningful checks for the touched code, then report commands, outcomes, residual risk, and any source asset drift.",
      items: verificationItems,
      nodeIds: input.nodeIds,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
    },
    {
      id: createId("blueprint-prompt-section"),
      kind: "handoff",
      title: "Handoff",
      content:
        "Return changed files, verification evidence, and notes that can be written back to the source SPEC nodes and preview artifacts.",
      items: [
        {
          id: createId("blueprint-prompt-item"),
          kind: "note",
          title: "Source bindings",
          content: `Documents: ${input.sourceDocumentIds.join(", ")}. Previews: ${
            input.sourcePreviewIds.length > 0
              ? input.sourcePreviewIds.join(", ")
              : "none"
          }.`,
          nodeIds: input.nodeIds,
          sourceDocumentIds: input.sourceDocumentIds,
          sourcePreviewIds: input.sourcePreviewIds,
        },
      ],
      nodeIds: input.nodeIds,
      sourceDocumentIds: input.sourceDocumentIds,
      sourcePreviewIds: input.sourcePreviewIds,
    },
  ];
}

function buildImplementationVerificationItems(input: {
  documents: BlueprintSpecDocument[];
  previews: BlueprintEffectPreview[];
}): BlueprintImplementationPromptItem[] {
  const taskItems: BlueprintImplementationPromptItem[] = input.documents
    .filter(document => document.type === "tasks")
    .map(document => ({
      id: createId("blueprint-prompt-item"),
      kind: "verification" as const,
      title: `Verify task document: ${document.title}`,
      content:
        "Confirm each task-level implementation step is either completed, deferred with reason, or converted into a follow-up.",
      nodeIds: [document.nodeId],
      sourceDocumentIds: [document.id],
      sourcePreviewIds: [],
    }));
  const previewItems: BlueprintImplementationPromptItem[] = input.previews.flatMap(
    preview =>
    preview.progressPlan.map(milestone => ({
      id: createId("blueprint-prompt-item"),
      kind: "verification" as const,
      title: `Validate milestone: ${milestone.title}`,
      content: `${milestone.summary} Target: ${milestone.target}.`,
      nodeIds: [preview.nodeId],
      sourceDocumentIds: [...milestone.sourceDocumentIds],
      sourcePreviewIds: [preview.id],
    }))
  );

  if (taskItems.length > 0 || previewItems.length > 0) {
    return taskItems.concat(previewItems);
  }

  return [
    {
      id: createId("blueprint-prompt-item"),
      kind: "verification",
      title: "Run focused checks",
      content:
        "Run relevant unit tests, type checks, lint, or build commands for the implementation surface.",
      nodeIds: [],
      sourceDocumentIds: [],
      sourcePreviewIds: [],
    },
  ];
}

function renderImplementationPromptContent(input: {
  title: string;
  target: BlueprintImplementationPromptTarget;
  sections: BlueprintImplementationPromptSection[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    `Target platform: ${input.target.label}`,
    `Execution mode: ${input.target.executionMode}`,
    `Source documents: ${input.sourceDocumentIds.join(", ")}`,
    `Source previews: ${
      input.sourcePreviewIds.length > 0
        ? input.sourcePreviewIds.join(", ")
        : "none"
    }`,
    "",
  ];

  for (const section of input.sections) {
    lines.push(`## ${section.title}`, "", section.content, "");
    for (const item of section.items) {
      lines.push(`### ${item.title}`, "", item.content, "");
    }
  }

  return lines.join("\n").trim();
}

function renderEngineeringPlatformHandoff(input: {
  title: string;
  summary: string;
  promptPackage: BlueprintImplementationPromptPackage;
  sourceNodes: BlueprintSpecTreeNode[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
  steps: BlueprintEngineeringLandingStep[];
  verificationCommands: string[];
}): string {
  const sourceNodeLines =
    input.sourceNodes.length > 0
      ? input.sourceNodes.map(node => `- ${node.title} (${node.id})`)
      : ["- none"];
  const stepLines = input.steps.map(
    step =>
      `- ${step.title} [${step.mode}, ${step.riskLevel} risk]: ${step.summary}`
  );
  const fileScopeLines = uniqueStrings(
    input.steps.flatMap(step => step.fileScopes)
  ).map(scope => `- ${scope}`);
  const verificationLines = input.verificationCommands.map(
    command => `- ${command}`
  );

  return [
    `# ${input.title}`,
    "",
    input.summary,
    "",
    `Prompt package: ${input.promptPackage.id}`,
    `Target platform: ${input.promptPackage.target.label}`,
    `Execution mode: ${input.promptPackage.target.executionMode}`,
    "",
    "## Source Nodes",
    "",
    ...sourceNodeLines,
    "",
    "## Source Assets",
    "",
    `- SPEC documents: ${
      input.sourceDocumentIds.length > 0
        ? input.sourceDocumentIds.join(", ")
        : "none"
    }`,
    `- Effect previews: ${
      input.sourcePreviewIds.length > 0
        ? input.sourcePreviewIds.join(", ")
        : "none"
    }`,
    "",
    "## Landing Steps",
    "",
    ...stepLines,
    "",
    "## File Scopes",
    "",
    ...fileScopeLines,
    "",
    "## Verification",
    "",
    ...verificationLines,
  ].join("\n");
}

function buildEngineeringLandingVerificationCommands(): string[] {
  return [
    "node node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts",
  ];
}

function buildEngineeringLandingFileScopes(
  mode: BlueprintEngineeringLandingStepMode
): string[] {
  if (mode === "automatic") {
    return ["shared/blueprint/contracts.ts"];
  }

  if (mode === "manual") {
    return ["server/routes/blueprint.ts"];
  }

  return ["server/tests/blueprint-routes.test.ts"];
}

function resolveEngineeringLandingPlanStatus(
  promptPackage: BlueprintImplementationPromptPackage
): BlueprintEngineeringLandingPlanStatus {
  const documentStatus = promptPackage.provenance.sourceDocumentStatus;
  const previewStatus = promptPackage.provenance.sourcePreviewStatus;

  return documentStatus === "accepted" &&
    (previewStatus === "accepted" || previewStatus === "missing")
    ? "ready"
    : "draft";
}

function resolveEngineeringStepRiskLevel(
  planStatus: BlueprintEngineeringLandingPlanStatus,
  mode: BlueprintEngineeringLandingStepMode
): BlueprintEngineeringLandingRiskLevel {
  if (planStatus === "draft") {
    return mode === "automatic" ? "medium" : "high";
  }

  return mode === "automatic" ? "low" : "medium";
}

function buildEngineeringSourceDocumentStatuses(
  promptPackage: BlueprintImplementationPromptPackage,
  documents: BlueprintSpecDocument[],
  sourceDocumentIds: string[]
): Record<string, BlueprintSpecDocumentStatus> {
  const documentById = new Map(documents.map(document => [document.id, document]));

  return Object.fromEntries(
    sourceDocumentIds.map(documentId => {
      const document = documentById.get(documentId);
      const status = document
        ? normalizeSpecDocumentStatus(document.status)
        : promptPackage.provenance.sourceDocumentStatuses[documentId] ?? "draft";

      return [documentId, status];
    })
  );
}

function buildEngineeringSourcePreviewStatuses(
  promptPackage: BlueprintImplementationPromptPackage,
  previews: BlueprintEffectPreview[],
  sourcePreviewIds: string[]
): Record<string, BlueprintEffectPreviewStatus> {
  const previewById = new Map(previews.map(preview => [preview.id, preview]));

  return Object.fromEntries(
    sourcePreviewIds.map(previewId => {
      const preview = previewById.get(previewId);
      const status =
        preview?.status ??
        promptPackage.provenance.sourcePreviewStatuses[previewId] ??
        "preview";

      return [previewId, status];
    })
  );
}

function engineeringLandingPlanReplacementKey(
  plan: Pick<BlueprintEngineeringLandingPlan, "promptPackageIds">
): string {
  return plan.promptPackageIds.join("|");
}

function mapEngineeringRunStatusToJobStatus(
  status: BlueprintEngineeringRunStatus
): BlueprintGenerationStatus {
  if (status === "passed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "running") {
    return "running";
  }

  return "reviewing";
}

function mapEngineeringRunStatusToEventType(
  status: BlueprintEngineeringRunStatus
): BlueprintGenerationEvent["type"] {
  if (status === "passed") {
    return "job.completed";
  }

  if (status === "failed") {
    return "job.failed";
  }

  return "job.stage";
}

function resolvePromptDocumentSourceStatus(
  documents: BlueprintSpecDocument[]
): BlueprintImplementationPromptSourceStatus {
  if (documents.length === 0) {
    return "missing";
  }

  const statuses = documents
    .map(document => normalizeSpecDocumentStatus(document.status))
    .filter(
      (
        status
      ): status is "accepted" | "draft" | "reviewing" =>
        status !== "rejected"
    );

  return statuses.length > 0 ? resolvePromptSourceStatus(statuses) : "missing";
}

function resolvePromptPreviewSourceStatus(
  previews: BlueprintEffectPreview[]
): BlueprintImplementationPromptSourceStatus {
  if (previews.length === 0) {
    return "missing";
  }

  return resolvePromptSourceStatus(
    previews.map(preview => preview.provenance.sourceStatus)
  );
}

function resolvePromptSourceStatus(
  statuses: Array<"accepted" | "draft" | "reviewing" | "mixed">
): BlueprintImplementationPromptSourceStatus {
  const uniqueStatuses = new Set(statuses);
  if (uniqueStatuses.size === 1) {
    return statuses[0];
  }

  return "mixed";
}

function promptPackageReplacementKey(
  promptPackage: Pick<
    BlueprintImplementationPromptPackage,
    "targetPlatform" | "nodeIds"
  >
): string {
  return `${promptPackage.targetPlatform}:${promptPackage.nodeIds.join("|")}`;
}

function buildEffectPreview(input: {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  node: BlueprintSpecTreeNode;
  documents: BlueprintSpecDocument[];
  includeDrafts: boolean;
  createdAt: string;
}): BlueprintEffectPreview {
  const sourceDocumentIds = input.documents.map(document => document.id);
  const sourceStatus = resolveEffectPreviewSourceStatus(input.documents);
  const status: BlueprintEffectPreviewStatus =
    input.includeDrafts && sourceStatus !== "accepted" ? "preview" : "completed";
  const documentTitles = input.documents.map(document => document.title);
  const architectureNotes = [
    `Anchor implementation around ${input.node.title}.`,
    input.node.dependencies.length > 0
      ? `Respect upstream dependencies: ${input.node.dependencies.join(", ")}.`
      : "No explicit upstream dependencies are recorded for this node.",
    input.node.outputs.length > 0
      ? `Expected asset outputs: ${input.node.outputs.join(", ")}.`
      : "No explicit downstream outputs are recorded for this node.",
  ];
  const prototypeCues = buildEffectPreviewPrototypeCues(
    input.node,
    sourceDocumentIds
  );
  const progressPlan = buildEffectPreviewMilestones(
    input.node,
    input.documents
  );
  const previewNode: BlueprintEffectPreviewNode = {
    id: createId("blueprint-effect-preview-node"),
    nodeId: input.node.id,
    nodeTitle: input.node.title,
    nodeType: input.node.type,
    summary: input.node.summary,
    sourceDocumentIds,
    steps: input.documents.map((document, index) => ({
      id: createId("blueprint-effect-preview-step"),
      title: `Apply ${document.type} document`,
      summary: summarizeEffectPreviewDocument(document, index),
      sourceDocumentIds: [document.id],
    })),
    milestones: progressPlan,
    prototypeCues,
  };

  return {
    id: createId("blueprint-effect-preview"),
    jobId: input.job.id,
    treeId: input.specTree.id,
    nodeId: input.node.id,
    sourceDocumentIds,
    status,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    summary: `Preview the expected effect of ${input.node.title} using ${documentTitles.join(", ")}.`,
    architectureNotes,
    prototypeNotes: prototypeCues.map(cue => cue.cue),
    progressPlan,
    nodes: [previewNode],
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
      treeVersion: input.specTree.version,
      nodeType: input.node.type,
      nodeTitle: input.node.title,
      nodeSummary: input.node.summary,
      sourceStatus,
      includeDrafts: input.includeDrafts,
      sourceDocumentStatuses: Object.fromEntries(
        input.documents.map(document => [
          document.id,
          normalizeSpecDocumentStatus(document.status),
        ])
      ),
    },
  };
}

function buildSpecDocument(input: {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  node: BlueprintSpecTreeNode;
  type: BlueprintSpecDocumentType;
  createdAt: string;
}): BlueprintSpecDocument {
  const id = createId("blueprint-spec-document");
  const heading = buildSpecDocumentHeading(input.type, input.node.title);
  const body = buildSpecDocumentBody(input);

  return {
    id,
    jobId: input.job.id,
    treeId: input.specTree.id,
    nodeId: input.node.id,
    type: input.type,
    status: "draft",
    version: 1,
    sourceDocumentId: id,
    title: heading,
    summary: input.node.summary,
    content: body,
    format: "markdown",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
      treeVersion: input.specTree.version,
      nodeType: input.node.type,
      nodeTitle: input.node.title,
      nodeSummary: input.node.summary,
      dependencies: [...input.node.dependencies],
      outputs: [...input.node.outputs],
    },
  };
}

function buildSpecDocumentHeading(
  type: BlueprintSpecDocumentType,
  nodeTitle: string
): string {
  const label =
    type === "requirements"
      ? "Requirements"
      : type === "design"
        ? "Design"
        : "Tasks";
  return `${label}: ${nodeTitle}`;
}

function buildSpecDocumentBody(input: {
  node: BlueprintSpecTreeNode;
  type: BlueprintSpecDocumentType;
}): string {
  const title = buildSpecDocumentHeading(input.type, input.node.title);
  const lines = [
    `# ${title}`,
    "",
    "## Summary",
    "",
    input.node.summary,
    "",
    "## Inputs",
    "",
    `- Node type: ${input.node.type}`,
    `- Status: ${input.node.status}`,
    `- Priority: ${input.node.priority}`,
    input.node.dependencies.length > 0
      ? `- Dependencies: ${input.node.dependencies.join(", ")}`
      : "- Dependencies: none",
    input.node.outputs.length > 0
      ? `- Outputs: ${input.node.outputs.join(", ")}`
      : "- Outputs: none",
    "",
    "## Derived Content",
    "",
    ...buildSpecDocumentSectionLines(input.type, input.node),
  ];

  return lines.join("\n");
}

function buildSpecDocumentSectionLines(
  type: BlueprintSpecDocumentType,
  node: BlueprintSpecTreeNode
): string[] {
  const title = node.title.trim();
  const summary = node.summary.trim();

  if (type === "requirements") {
    return [
      `- The system shall support ${summary || title.toLowerCase()}.`,
      `- The node "${title}" shall remain traceable through job artifacts.`,
      `- Downstream outputs: ${node.outputs.length > 0 ? node.outputs.join(", ") : "none"}.`,
    ];
  }

  if (type === "design") {
    return [
      `- Structure the implementation around ${title}.`,
      `- Preserve dependencies in the generated artifact graph.`,
      `- Keep the summary: ${summary || "No summary provided."}`,
    ];
  }

  return [
    `- Step 1: Review ${title}.`,
    `- Step 2: Deliver outputs ${node.outputs.length > 0 ? node.outputs.join(", ") : "none"}.`,
    `- Step 3: Confirm dependencies ${node.dependencies.length > 0 ? node.dependencies.join(", ") : "none"}.`,
  ];
}

function buildEffectPreviewPrototypeCues(
  node: BlueprintSpecTreeNode,
  sourceDocumentIds: string[]
): BlueprintEffectPreviewPrototypeCue[] {
  const baseCues: Array<{
    title: string;
    surface: BlueprintEffectPreviewPrototypeCue["surface"];
    cue: string;
  }> = [
    {
      title: "Primary user-facing change",
      surface:
        node.type === "effect_preview" || node.type === "spec_document"
          ? "workflow"
          : "ui",
      cue: `Show the visible effect of ${node.title} with clear state transitions and review signals.`,
    },
    {
      title: "Architecture visibility",
      surface: "architecture",
      cue: `Represent ${node.title} as a traceable architecture node connected to its SPEC document sources.`,
    },
    {
      title: "Operational checkpoint",
      surface: "operations",
      cue: `Expose progress for ${node.title} through planned milestones and artifact readiness.`,
    },
  ];

  return baseCues.map(cue => ({
    id: createId("blueprint-effect-preview-cue"),
    ...cue,
    sourceDocumentIds,
  }));
}

function buildEffectPreviewMilestones(
  node: BlueprintSpecTreeNode,
  documents: BlueprintSpecDocument[]
): BlueprintEffectPreviewMilestone[] {
  return [
    {
      id: createId("blueprint-effect-preview-milestone"),
      title: "Confirm source SPEC coverage",
      summary: `Review ${documents.length} source document(s) for ${node.title}.`,
      target: "SPEC source set approved for preview consumption.",
      sourceDocumentIds: documents.map(document => document.id),
    },
    {
      id: createId("blueprint-effect-preview-milestone"),
      title: "Draft architecture effect",
      summary: `Map dependencies and outputs for ${node.title}.`,
      target: "Architecture notes are ready for diagram generation.",
      sourceDocumentIds: documents.map(document => document.id),
    },
    {
      id: createId("blueprint-effect-preview-milestone"),
      title: "Plan prototype and landing progress",
      summary: `Convert ${node.title} into prototype cues and implementation checkpoints.`,
      target: "Prototype direction and progress plan are ready for downstream menus.",
      sourceDocumentIds: documents.map(document => document.id),
    },
  ];
}

function summarizeEffectPreviewDocument(
  document: BlueprintSpecDocument,
  index: number
): string {
  const status = normalizeSpecDocumentStatus(document.status);
  return `Source ${index + 1} is ${document.type} in ${status} state: ${document.summary}`;
}

function resolveEffectPreviewSourceStatus(
  documents: BlueprintSpecDocument[]
): BlueprintEffectPreviewSourceStatus {
  const statuses = [
    ...new Set(documents.map(document => normalizeSpecDocumentStatus(document.status))),
  ];

  if (statuses.length === 1) {
    const [status] = statuses;
    return status === "accepted" || status === "draft" || status === "reviewing"
      ? status
      : "mixed";
  }

  return "mixed";
}

function normalizeSpecDocumentStatus(
  status: BlueprintSpecDocument["status"]
): BlueprintSpecDocumentStatus {
  return status ?? "draft";
}

function replaceSpecTreeArtifact(
  artifacts: BlueprintGenerationArtifact[],
  specTree: BlueprintSpecTree
): BlueprintGenerationArtifact[] {
  return artifacts.map(artifact =>
    artifact.type === "spec_tree"
      ? { ...artifact, payload: specTree }
      : artifact
  );
}

function replaceSpecDocumentArtifact(
  artifacts: BlueprintGenerationArtifact[],
  document: BlueprintSpecDocument
): BlueprintGenerationArtifact[] {
  return artifacts.map(artifact => {
    if (
      artifact.type === document.type &&
      isPlainRecord(artifact.payload) &&
      readString(artifact.payload.nodeId) === document.nodeId &&
      readString(artifact.payload.sourceDocumentId) === document.sourceDocumentId
    ) {
      return { ...artifact, payload: document };
    }

    return artifact;
  });
}

function findSpecDocument(
  job: BlueprintGenerationJob,
  documentId: string
): BlueprintSpecDocument | undefined {
  return extractSpecDocuments(job).find(document => document.id === documentId);
}

function specDocumentNotFound(
  documentId: string,
  jobId: string
): { ok: false; status: 404; error: string; message: string } {
  return {
    ok: false,
    status: 404,
    error: "Blueprint SPEC document not found.",
    message: `No SPEC document ${documentId} exists in job ${jobId}.`,
  };
}

function cloneSpecTree(specTree: BlueprintSpecTree): BlueprintSpecTree {
  return JSON.parse(JSON.stringify(specTree)) as BlueprintSpecTree;
}

function buildSpecTreeFromRouteSet(input: {
  job: BlueprintGenerationJob;
  routeSet: BlueprintRouteSet;
  selection: BlueprintRouteSelection;
  selectedRoute: BlueprintRouteCandidate;
  createdAt: string;
}): BlueprintSpecTree {
  const rootNodeId = createId("blueprint-spec-node");
  const targetTitle = summarizeRequestTarget(input.job.request);
  const mainStepNodes = input.selectedRoute.steps.map((step, index) =>
    createSpecTreeNode({
      parentId: rootNodeId,
      title: step.title,
      summary: step.description,
      type: "route_step",
      status: step.status === "ready" ? "ready" : "seed",
      priority: index + 1,
      routeId: input.selectedRoute.id,
      routeStepId: step.id,
      outputs:
        index === 0
          ? ["clarification decisions", "success criteria"]
          : step.id === "derive-spec-tree-seed"
            ? ["SPEC tree seed", "node map"]
            : ["route evidence"],
      metadata: {
        role: step.role,
        routeKind: input.selectedRoute.kind,
      },
    })
  );
  const alternativeNodes = input.routeSet.routes
    .filter(route => route.id !== input.selectedRoute.id)
    .map((route, index) =>
      createSpecTreeNode({
        parentId: rootNodeId,
        title: route.title,
        summary: route.summary,
        type: "alternative_route",
        status: input.selection.mergedAlternativeRouteIds.includes(route.id)
          ? "ready"
          : "seed",
        priority: mainStepNodes.length + index + 1,
        routeId: route.id,
        outputs: route.outputs,
        metadata: {
          riskLevel: route.riskLevel,
          costLevel: route.costLevel,
          complexity: route.complexity,
          mergedIntoSelection:
            input.selection.mergedAlternativeRouteIds.includes(route.id),
        },
      })
    );
  const downstreamNodes = createDownstreamSpecTreeNodes({
    parentId: rootNodeId,
    routeId: input.selectedRoute.id,
    startPriority: mainStepNodes.length + alternativeNodes.length + 1,
  });
  const childNodes = mainStepNodes.concat(alternativeNodes, downstreamNodes);
  const rootNode: BlueprintSpecTreeNode = {
    id: rootNodeId,
    title: `SPEC asset tree: ${targetTitle}`,
    summary:
      "Durable tree asset derived from the selected autopilot route. Downstream menus bind to this tree instead of recomputing the route.",
    type: "root",
    status: "draft",
    priority: 0,
    routeId: input.selectedRoute.id,
    dependencies: [],
    outputs: ["SPEC tree", "requirements seed", "design seed", "tasks seed"],
    children: childNodes.map(node => node.id),
    metadata: {
      selectedRouteTitle: input.selectedRoute.title,
      routeSetId: input.routeSet.id,
    },
  };

  return {
    id: createId("blueprint-spec-tree"),
    routeSetId: input.routeSet.id,
    selectionId: input.selection.id,
    selectedRouteId: input.selectedRoute.id,
    rootNodeId,
    version: 1,
    status: "draft",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    alternativeRouteIds: alternativeNodes
      .map(node => node.routeId)
      .filter(isString),
    nodes: [rootNode].concat(childNodes),
    provenance: {
      jobId: input.job.id,
      projectId: input.job.projectId,
      sourceId: input.job.sourceId,
      targetText: input.job.request.targetText,
      githubUrls: input.job.request.githubUrls ?? [],
    },
  };
}

function createDownstreamSpecTreeNodes(input: {
  parentId: string;
  routeId: string;
  startPriority: number;
}): BlueprintSpecTreeNode[] {
  const downstream: Array<{
    title: string;
    summary: string;
    type: BlueprintSpecTreeNodeType;
    outputs: string[];
  }> = [
    {
      title: "Specification document generation",
      summary:
        "Expand the selected SPEC tree into requirements, design, and tasks for each important node.",
      type: "spec_document",
      outputs: ["requirements.md", "design.md", "tasks.md"],
    },
    {
      title: "Effect preview",
      summary:
        "Preview architecture, progress plan, expected UI/prototype direction, and step-by-step implementation effect before coding.",
      type: "effect_preview",
      outputs: ["architecture diagram", "prototype notes", "progress plan"],
    },
    {
      title: "Implementation prompt package",
      summary:
        "Package the selected future implementation into prompts that can be used by Cursor, Kiro, Trae, Windsurf, Codex, Claude, and similar tools.",
      type: "prompt_package",
      outputs: ["platform prompts", "acceptance checklist"],
    },
    {
      title: "Engineering landing",
      summary:
        "Reserve the later execution bridge that turns accepted SPEC assets into repository changes and run evidence.",
      type: "engineering_plan",
      outputs: ["landing plan", "run evidence"],
    },
  ];

  return downstream.map((item, index) =>
    createSpecTreeNode({
      parentId: input.parentId,
      title: item.title,
      summary: item.summary,
      type: item.type,
      status: "seed",
      priority: input.startPriority + index,
      routeId: input.routeId,
      outputs: item.outputs,
      dependencies: index === 0 ? [] : [downstream[index - 1].type],
    })
  );
}

function createSpecTreeNode(input: {
  parentId: string;
  title: string;
  summary: string;
  type: BlueprintSpecTreeNodeType;
  status: BlueprintSpecTreeNodeStatus;
  priority: number;
  routeId?: string;
  routeStepId?: string;
  dependencies?: string[];
  outputs?: string[];
  metadata?: Record<string, string | number | boolean | string[]>;
}): BlueprintSpecTreeNode {
  return {
    id: createId("blueprint-spec-node"),
    parentId: input.parentId,
    title: input.title,
    summary: input.summary,
    type: input.type,
    status: input.status,
    priority: input.priority,
    routeId: input.routeId,
    routeStepId: input.routeStepId,
    dependencies: input.dependencies ?? [],
    outputs: input.outputs ?? [],
    children: [],
    metadata: input.metadata,
  };
}

async function listBlueprintSpecNames(specsRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(specsRoot, { withFileTypes: true });
    return entries
      .filter(
        entry => entry.isDirectory() && entry.name.startsWith("blueprint-")
      )
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readBlueprintSpec(
  specsRoot: string,
  id: string,
  fallbackIndex: number
): Promise<BlueprintSpecSummary> {
  const specPath = path.join(specsRoot, id);
  const requirementsPath = path.join(specPath, "requirements.md");
  const designPath = path.join(specPath, "design.md");
  const tasksPath = path.join(specPath, "tasks.md");
  const configPath = path.join(specPath, CONFIG_FILE);

  const docs: BlueprintSpecDocs = {
    requirements: await isFile(requirementsPath),
    design: await isFile(designPath),
    tasks: await isFile(tasksPath),
    config: await isFile(configPath),
  };

  const [requirementsText, designText, tasksText, configText] =
    await Promise.all([
      docs.requirements ? readUtf8(requirementsPath) : Promise.resolve(""),
      docs.design ? readUtf8(designPath) : Promise.resolve(""),
      docs.tasks ? readUtf8(tasksPath) : Promise.resolve(""),
      docs.config ? readUtf8(configPath) : Promise.resolve(""),
    ]);

  const config = parseConfigMetadata(configText);
  const known = BLUEPRINT_METADATA[id];
  const title =
    readString(config.title) ??
    readString(config.name) ??
    extractTitle(tasksText, designText, requirementsText) ??
    humanizeBlueprintId(id);
  const summary =
    readString(config.summary) ??
    extractSummary(requirementsText) ??
    extractSummary(designText) ??
    "";
  const order =
    readOrder(config.order) ?? known?.order ?? 1000 + fallbackIndex + 1;
  const phase = readString(config.phase) ?? known?.phase ?? "other";
  const taskStats = docs.tasks
    ? countTopLevelTasks(tasksText)
    : { completed: 0, total: 0 };

  return {
    id,
    title,
    phase,
    order,
    summary,
    path: displayPath(specPath),
    docs,
    taskStats,
    status: getStatus(docs),
  };
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

function parseConfigMetadata(content: string): BlueprintConfigMetadata {
  if (!content.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return isPlainRecord(parsed) ? (parsed as BlueprintConfigMetadata) : {};
  } catch {
    return {};
  }
}

function extractTitle(...documents: string[]): string | undefined {
  for (const document of documents) {
    const heading = firstMarkdownHeading(document);
    if (!heading) continue;

    const title = normalizeTitle(heading);
    if (title) return title;
  }

  return undefined;
}

function firstMarkdownHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function normalizeTitle(heading: string): string | undefined {
  const title = heading
    .replace(/^design document\s*[:：]?\s*/i, "")
    .replace(/^requirements document\s*[:：]?\s*/i, "")
    .replace(/^tasks?\s*[:：]?\s*/i, "")
    .replace(/^design\s*[:：]?\s*/i, "")
    .replace(/^requirements\s*[:：]?\s*/i, "")
    .replace(/^task list\s*[:：]?\s*/i, "")
    .replace(/^设计文档\s*[:：]?\s*/, "")
    .replace(/^需求文档\s*[:：]?\s*/, "")
    .replace(/^任务(?:清单|列表)?\s*[:：]?\s*/, "")
    .replace(/\s*(task list|tasks?)\s*$/i, "")
    .replace(/\s*(任务(?:清单|列表)?)\s*$/, "")
    .trim();

  if (!title) {
    return undefined;
  }

  if (
    /^(requirements document|design document|task list|tasks?)$/i.test(title)
  ) {
    return undefined;
  }

  if (/^(需求文档|设计文档|任务(?:清单|列表)?)$/.test(title)) {
    return undefined;
  }

  return title;
}

function extractSummary(markdown: string): string | undefined {
  const overviewLines = extractSectionLines(markdown, [
    /^introduction$/i,
    /^overview$/i,
    /^summary$/i,
    /^description$/i,
    /^scope$/i,
    /^简介$/,
    /^概述$/,
    /^介绍$/,
    /^背景$/,
  ]);

  const overview = firstParagraph(overviewLines);
  if (overview) return overview;

  return firstParagraph(markdown.split(/\r?\n/).slice(1));
}

function extractSectionLines(
  markdown: string,
  headingPatterns: RegExp[]
): string[] {
  const lines = markdown.split(/\r?\n/);
  const section: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading?.[1]) {
      if (inSection) {
        break;
      }

      const normalizedHeading = heading[1].trim();
      inSection = headingPatterns.some(pattern =>
        pattern.test(normalizedHeading)
      );
      continue;
    }

    if (inSection) {
      section.push(line);
    }
  }

  return section;
}

function firstParagraph(lines: string[]): string | undefined {
  const paragraph: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence || isStructuralMarkdown(trimmed)) {
      continue;
    }

    if (!trimmed) {
      if (paragraph.length > 0) {
        return cleanMarkdown(paragraph.join(" "));
      }
      continue;
    }

    paragraph.push(trimmed);
  }

  return paragraph.length > 0 ? cleanMarkdown(paragraph.join(" ")) : undefined;
}

function isStructuralMarkdown(line: string): boolean {
  return (
    !line ||
    line.startsWith("#") ||
    line.startsWith("- ") ||
    line.startsWith("* ") ||
    line.startsWith("|") ||
    /^\d+[.)]\s+/.test(line)
  );
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlueprintGenerationJob(
  value: unknown
): value is BlueprintGenerationJob {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isPlainRecord(value.request) &&
    typeof value.status === "string" &&
    typeof value.stage === "string" &&
    typeof value.version === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.events)
  );
}

function countTopLevelTasks(markdown: string): BlueprintTaskStats {
  const stats: BlueprintTaskStats = { completed: 0, total: 0 };
  const topLevelTaskPattern = /^-\s+\[([ xX])\]\s+\d+[.)](?:\s|$)/;

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(topLevelTaskPattern);
    if (!match) continue;

    stats.total += 1;
    if (match[1]?.toLowerCase() === "x") {
      stats.completed += 1;
    }
  }

  return stats;
}

function getStatus(docs: BlueprintSpecDocs): BlueprintSpecStatus {
  const docCount = countDocs(docs);
  if (docCount === 0) {
    return "empty";
  }

  return docCount === DOC_NAMES.length ? "ready" : "partial";
}

function countDocs(docs: BlueprintSpecDocs): number {
  return Object.values(docs).filter(Boolean).length;
}

function humanizeBlueprintId(id: string): string {
  return id
    .replace(/^blueprint-/, "")
    .split("-")
    .filter(Boolean)
    .map(
      word =>
        KNOWN_WORD_LABELS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function readGithubUrlInputs(...values: unknown[]): string[] {
  return values
    .flatMap(value => {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === "string") {
        return value.split(/[\n,]+/);
      }
      return [];
    })
    .map(item => readString(item))
    .filter(isString);
}

function parseGithubSources(urls: string[]): {
  sources: BlueprintGithubSource[];
  duplicates: BlueprintGithubSource[];
} {
  const sources: BlueprintGithubSource[] = [];
  const duplicates: BlueprintGithubSource[] = [];
  const sourceByNormalizedUrl = new Map<string, BlueprintGithubSource>();

  urls.forEach((url, index) => {
    const parsed = parseGithubSource(url);
    if (!parsed) return;

    const duplicateOf = sourceByNormalizedUrl.get(parsed.normalizedUrl);
    if (duplicateOf) {
      duplicates.push({
        ...parsed,
        id: `${duplicateOf.id}:duplicate-${index + 1}`,
        duplicateOf: duplicateOf.id,
      });
      return;
    }

    sourceByNormalizedUrl.set(parsed.normalizedUrl, parsed);
    sources.push(parsed);
  });

  return { sources, duplicates };
}

function parseGithubSource(url: string): BlueprintGithubSource | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const segments = parsedUrl.pathname
    .split("/")
    .map(segment => segment.trim())
    .filter(Boolean);
  const owner = segments[0]?.toLowerCase();
  const repo = segments[1]?.replace(/\.git$/i, "").toLowerCase();
  if (!owner || !repo) {
    return null;
  }

  const sourceSlug = `${owner}/${repo}`;
  const normalizedUrl = `https://github.com/${sourceSlug}`;
  const branch =
    (segments[2] === "tree" || segments[2] === "blob") && segments[3]
      ? segments[3]
      : undefined;
  const sourcePath =
    branch && segments.length > 4 ? segments.slice(4).join("/") : undefined;

  return {
    id: stableId("blueprint-source", sourceSlug),
    kind: "repository",
    url,
    normalizedUrl,
    owner,
    repo,
    slug: sourceSlug,
    branch,
    path: sourcePath,
    evidenceIds: [stableId("blueprint-evidence-github-url", normalizedUrl)],
  };
}

function buildIntakeEvidence(
  request: BlueprintIntakeRequest,
  sources: BlueprintGithubSource[],
  createdAt: string
): BlueprintDomainEvidence[] {
  const evidence: BlueprintDomainEvidence[] = [];

  if (request.targetText) {
    evidence.push({
      id: stableId("blueprint-evidence-intake-text", request.targetText),
      kind: "intake_text",
      label: "Target input",
      summary: summarizeText(request.targetText, 120),
      value: request.targetText,
      createdAt,
    });
  }

  for (const source of sources) {
    evidence.push({
      id: stableId("blueprint-evidence-github-url", source.normalizedUrl),
      kind: "github_url",
      label: `${source.owner}/${source.repo}`,
      summary: `GitHub repository URL parsed as ${source.owner}/${source.repo}.`,
      value: source.normalizedUrl,
      sourceId: source.id,
      createdAt,
    });
  }

  for (const note of request.domainNotes ?? []) {
    evidence.push({
      id: stableId("blueprint-evidence-domain-note", note),
      kind: "intake_text",
      label: "Domain note",
      summary: summarizeText(note, 120),
      value: note,
      createdAt,
    });
  }

  return dedupeById(evidence);
}

function buildIntakeAssets(
  request: BlueprintIntakeRequest,
  sources: BlueprintGithubSource[],
  evidence: BlueprintDomainEvidence[],
  createdAt: string
): BlueprintDomainAsset[] {
  const assets: BlueprintDomainAsset[] = [];
  const evidenceByValue = new Map(evidence.map(item => [item.value, item]));

  if (request.targetText) {
    const targetEvidence = evidenceByValue.get(request.targetText);
    assets.push({
      id: stableId("blueprint-asset-goal", request.targetText),
      kind: "product_goal",
      title: "Product Goal",
      summary: summarizeText(request.targetText, 160),
      sourceIds: [],
      evidenceIds: targetEvidence ? [targetEvidence.id] : [],
      tags: ["intake", "goal"],
      createdAt,
    });
  }

  for (const source of sources) {
    assets.push({
      id: stableId("blueprint-asset-github", source.normalizedUrl),
      kind: "github_repository",
      title: `${source.owner}/${source.repo}`,
      summary: `Repository context placeholder for ${source.normalizedUrl}.`,
      sourceIds: [source.id],
      evidenceIds: source.evidenceIds,
      tags: ["github", "source"],
      createdAt,
    });
  }

  for (const note of request.domainNotes ?? []) {
    const noteEvidence = evidenceByValue.get(note);
    assets.push({
      id: stableId("blueprint-asset-domain-note", note),
      kind: "domain_note",
      title: "Domain Note",
      summary: summarizeText(note, 160),
      sourceIds: [],
      evidenceIds: noteEvidence ? [noteEvidence.id] : [],
      tags: ["domain", "intake"],
      createdAt,
    });
  }

  return dedupeById(assets);
}

function buildClarificationQuestions(
  intake: BlueprintIntake
): BlueprintClarificationQuestion[] {
  const sourceIds = intake.sources.map(source => source.id);
  const evidenceIds = intake.evidence.map(item => item.id);
  const questions: BlueprintClarificationQuestion[] = [
    {
      id: "blueprint-question-goal",
      kind: "goal",
      prompt: "What outcome should the blueprint optimize for first?",
      required: true,
      sourceIds: [],
      evidenceIds,
    },
    {
      id: "blueprint-question-audience",
      kind: "audience",
      prompt: "Who is the primary user or operator for this project?",
      required: true,
      sourceIds: [],
      evidenceIds,
    },
    {
      id: "blueprint-question-constraints",
      kind: "constraint",
      prompt: "What constraints, integrations, or risks must the route preserve?",
      required: true,
      sourceIds,
      evidenceIds,
    },
  ];

  if (intake.sources.length > 0) {
    questions.push({
      id: "blueprint-question-github-role",
      kind: "github",
      prompt: "How should the GitHub repository influence the first RouteSet?",
      required: true,
      sourceIds,
      evidenceIds: intake.sources.flatMap(source => source.evidenceIds),
    });
  }

  questions.push({
    id: "blueprint-question-domain-assets",
    kind: "domain",
    prompt: "Which durable domain assets should be carried into later stages?",
    required: false,
    sourceIds,
    evidenceIds,
  });

  return questions;
}

function buildClarificationEvidence(
  session: BlueprintClarificationSession,
  createdAt: string
): BlueprintDomainEvidence[] {
  const questionById = new Map(
    session.questions.map(question => [question.id, question])
  );

  return session.answers.map(answer => {
    const question = questionById.get(answer.questionId);
    return {
      id: stableId(
        "blueprint-evidence-clarification",
        `${session.id}-${answer.questionId}-${answer.answer}`
      ),
      kind: "clarification_answer",
      label: question?.prompt ?? answer.questionId,
      summary: summarizeText(answer.answer, 120),
      value: answer.answer,
      createdAt,
    };
  });
}

function buildClarificationAssets(
  session: BlueprintClarificationSession,
  evidence: BlueprintDomainEvidence[],
  createdAt: string
): BlueprintDomainAsset[] {
  return evidence.map(item => ({
    id: stableId("blueprint-asset-clarification", `${session.id}-${item.id}`),
    kind: "clarification",
    title: "Clarification Answer",
    summary: item.summary,
    sourceIds: [],
    evidenceIds: [item.id],
    tags: ["clarification"],
    createdAt,
  }));
}

function calculateIntakeReadiness(
  request: BlueprintIntakeRequest,
  sources: BlueprintGithubSource[]
): BlueprintClarificationReadiness {
  const missingQuestionIds = request.targetText || sources.length > 0 ? [] : ["blueprint-question-goal"];

  return {
    status: missingQuestionIds.length === 0 ? "ready" : "needs_answers",
    score: missingQuestionIds.length === 0 ? 1 : 0,
    answeredRequired: missingQuestionIds.length === 0 ? 1 : 0,
    requiredTotal: 1,
    missingQuestionIds,
  };
}

function calculateClarificationReadiness(
  questions: BlueprintClarificationQuestion[],
  answers: BlueprintClarificationAnswer[]
): BlueprintClarificationReadiness {
  const answeredQuestionIds = new Set(
    answers.filter(answer => answer.answer.trim()).map(answer => answer.questionId)
  );
  const requiredQuestionIds = questions
    .filter(question => question.required)
    .map(question => question.id);
  const missingQuestionIds = requiredQuestionIds.filter(
    questionId => !answeredQuestionIds.has(questionId)
  );
  const answeredRequired = requiredQuestionIds.length - missingQuestionIds.length;
  const score =
    requiredQuestionIds.length === 0
      ? 1
      : Number((answeredRequired / requiredQuestionIds.length).toFixed(2));

  return {
    status: missingQuestionIds.length === 0 ? "ready" : "needs_answers",
    score,
    answeredRequired,
    requiredTotal: requiredQuestionIds.length,
    missingQuestionIds,
  };
}

function createEmptyProjectContext(
  projectId: string,
  now: Date
): BlueprintProjectDomainContext {
  return {
    projectId,
    updatedAt: now.toISOString(),
    intakeIds: [],
    sourceIds: [],
    assets: [],
    evidence: [],
  };
}

function upsertProjectContext(
  projectId: string,
  intake: BlueprintIntake,
  stores: BlueprintIntakeStores,
  updatedAt: string
): BlueprintProjectDomainContext {
  const existing =
    stores.projectContexts.get(projectId) ??
    createEmptyProjectContext(projectId, new Date(updatedAt));
  const context: BlueprintProjectDomainContext = {
    projectId,
    updatedAt,
    intakeIds: uniqueStrings(existing.intakeIds.concat(intake.id)),
    sourceIds: uniqueStrings(
      existing.sourceIds.concat(intake.sources.map(source => source.id))
    ),
    assets: dedupeById(existing.assets.concat(intake.assets)),
    evidence: dedupeById(existing.evidence.concat(intake.evidence)),
  };

  stores.projectContexts.set(projectId, context);
  return context;
}

function mergeClarificationAnswers(
  left: BlueprintClarificationAnswer[],
  right: BlueprintClarificationAnswer[]
): BlueprintClarificationAnswer[] {
  const merged = new Map<string, BlueprintClarificationAnswer>();
  for (const answer of left.concat(right)) {
    if (!answer.questionId || !answer.answer) continue;
    merged.set(answer.questionId, answer);
  }

  return [...merged.values()];
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

function summarizeText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 3).trim()}...`
    : normalized;
}

function stableId(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return `${prefix}-${slug || "unknown"}`;
}

function normalizeGithubUrls(...values: unknown[]): string[] {
  const parsed = parseGithubSources(readGithubUrlInputs(...values));
  return parsed.sources.map(source => source.normalizedUrl);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(item => readString(item)).filter(isString))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(isString))];
}

function normalizeQueryStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringList(value);
  }

  const text = readString(value);
  if (!text) {
    return [];
  }

  return normalizeStringList(text.split(","));
}

function normalizeClarifications(
  value: unknown
): BlueprintGenerationRequest["clarifications"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isPlainRecord)
    .map(item => ({
      questionId: readString(item.questionId) ?? "",
      answer: readString(item.answer) ?? "",
    }))
    .filter(item => item.questionId && item.answer);
}

function summarizeRequestTarget(request: BlueprintGenerationRequest): string {
  if (request.targetText) {
    const normalized = request.targetText.replace(/\s+/g, " ").trim();
    return normalized.length > 80
      ? `${normalized.slice(0, 77).trim()}...`
      : normalized;
  }

  const firstGithubUrl = request.githubUrls?.[0];
  if (firstGithubUrl) {
    return firstGithubUrl.replace(/^https:\/\/github\.com\//i, "GitHub ");
  }

  return "the requested product direction";
}

function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function displayPath(targetPath: string): string {
  const relative = path.relative(process.cwd(), targetPath);
  const display =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative
      : targetPath;
  return display.split(path.sep).join("/");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readOrder(value: unknown): number | undefined {
  const order = typeof value === "string" ? Number(value) : value;
  return typeof order === "number" && Number.isFinite(order)
    ? Math.trunc(order)
    : undefined;
}

function isSpecTreeNodeStatus(
  value: unknown
): value is BlueprintSpecTreeNodeStatus {
  return (
    value === "seed" ||
    value === "draft" ||
    value === "ready" ||
    value === "accepted"
  );
}

function isSpecTreeNodeType(value: unknown): value is BlueprintSpecTreeNodeType {
  return (
    value === "root" ||
    value === "route_step" ||
    value === "alternative_route" ||
    value === "spec_document" ||
    value === "effect_preview" ||
    value === "prompt_package" ||
    value === "engineering_plan"
  );
}

function isSpecDocumentType(value: unknown): value is BlueprintSpecDocumentType {
  return (
    value === "requirements" || value === "design" || value === "tasks"
  );
}

function isImplementationPromptTargetPlatform(
  value: unknown
): value is BlueprintImplementationPromptTargetPlatform {
  return (
    value === "cursor" ||
    value === "kiro" ||
    value === "trae" ||
    value === "windsurf" ||
    value === "codex" ||
    value === "claude"
  );
}

function isEngineeringLandingPlanStatus(
  value: unknown
): value is BlueprintEngineeringLandingPlanStatus {
  return (
    value === "draft" ||
    value === "ready" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  );
}

function isEngineeringRunStatus(
  value: unknown
): value is BlueprintEngineeringRunStatus {
  return (
    value === "planned" ||
    value === "running" ||
    value === "passed" ||
    value === "failed" ||
    value === "blocked"
  );
}

function isEngineeringVerificationStatus(
  value: unknown
): value is BlueprintEngineeringVerificationResult["status"] {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "skipped" ||
    value === "blocked"
  );
}

function isBlueprintGenerationStage(
  value: unknown
): value is BlueprintGenerationStage {
  return (
    value === "input" ||
    value === "clarification" ||
    value === "route_generation" ||
    value === "spec_tree" ||
    value === "spec_docs" ||
    value === "effect_preview" ||
    value === "prompt_packaging" ||
    value === "runtime_capability" ||
    value === "engineering_landing"
  );
}

function isArtifactFeedbackKind(
  value: unknown
): value is BlueprintArtifactFeedback["kind"] {
  return value === "feedback" || value === "backfill";
}

function isArtifactPayloadSummaryValue(
  value: unknown
): value is BlueprintArtifactPayloadSummary[string] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      value.every(item => typeof item === "string" || typeof item === "number"))
  );
}

function isEngineeringLandingPlanPayload(
  value: unknown
): value is BlueprintEngineeringLandingPlan {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.treeId === "string" &&
    isEngineeringLandingPlanStatus(value.status) &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.promptPackageIds) &&
    Array.isArray(value.steps) &&
    Array.isArray(value.handoffs) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isPlainRecord(value.provenance)
  );
}

function isArtifactReplaySnapshotPayload(
  value: unknown
): value is BlueprintArtifactReplaySnapshot {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.timelineEntries) &&
    isPlainRecord(value.stageCounts) &&
    Array.isArray(value.lineageEdges)
  );
}

function isArtifactFeedbackPayload(
  value: unknown
): value is BlueprintArtifactFeedback {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.entryId === "string" &&
    typeof value.artifactId === "string" &&
    isArtifactFeedbackKind(value.kind) &&
    typeof value.message === "string" &&
    typeof value.summary === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.tags) &&
    isPlainRecord(value.sourceIds) &&
    isPlainRecord(value.payloadSummary)
  );
}

function isEngineeringRunPayload(
  value: unknown
): value is BlueprintEngineeringRun {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.landingPlanId === "string" &&
    isEngineeringRunStatus(value.status) &&
    typeof value.summary === "string" &&
    Array.isArray(value.logs) &&
    Array.isArray(value.verificationResults) &&
    Array.isArray(value.changedFiles) &&
    Array.isArray(value.promptPackageIds) &&
    isPlainRecord(value.provenance)
  );
}

function isCapabilityRegistryPayload(
  value: unknown
): value is {
  id: string;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  capabilities: BlueprintRuntimeCapability[];
  sourceIds?: Partial<BlueprintArtifactSourceIds>;
  provenance?: Record<string, unknown>;
} {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isRuntimeCapabilityPayload)
  );
}

function isRuntimeCapabilityPayload(
  value: unknown
): value is BlueprintRuntimeCapability {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.kind === "string" &&
    typeof value.purpose === "string" &&
    typeof value.description === "string" &&
    Array.isArray(value.tags) &&
    typeof value.securityLevel === "string" &&
    typeof value.status === "string" &&
    typeof value.adapter === "string" &&
    typeof value.inputSchema === "string" &&
    Array.isArray(value.outputTypes) &&
    Array.isArray(value.supportedStages) &&
    typeof value.requiresApproval === "boolean" &&
    typeof value.projectScoped === "boolean"
  );
}

function isCapabilityInvocationPayload(
  value: unknown
): value is BlueprintCapabilityInvocation {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.capabilityId === "string" &&
    typeof value.capabilityLabel === "string" &&
    typeof value.kind === "string" &&
    typeof value.status === "string" &&
    typeof value.securityLevel === "string" &&
    isPlainRecord(value.safetyGate) &&
    typeof value.requestedAt === "string" &&
    typeof value.outputSummary === "string" &&
    Array.isArray(value.logs) &&
    Array.isArray(value.evidenceIds) &&
    typeof value.durationMs === "number" &&
    isPlainRecord(value.provenance)
  );
}

function isCapabilityEvidencePayload(
  value: unknown
): value is BlueprintCapabilityEvidence {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.invocationId === "string" &&
    typeof value.capabilityId === "string" &&
    typeof value.capabilityLabel === "string" &&
    typeof value.kind === "string" &&
    typeof value.status === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.logs) &&
    Array.isArray(value.tags) &&
    isPlainRecord(value.payloadSummary) &&
    isPlainRecord(value.provenance)
  );
}

function isSpecDocumentReviewStatus(
  value: unknown
): value is BlueprintReviewSpecDocumentRequest["status"] {
  return value === "accepted" || value === "rejected" || value === "reviewing";
}

function isSpecDocumentStatus(
  value: unknown
): value is BlueprintSpecDocumentStatus {
  return (
    value === "draft" ||
    value === "reviewing" ||
    value === "accepted" ||
    value === "rejected"
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

const router = createBlueprintRouter();

export default router;
