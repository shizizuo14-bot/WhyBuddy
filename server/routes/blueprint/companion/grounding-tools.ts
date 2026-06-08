import type { BlueprintServiceContext } from "../context.js";
import type {
  CompanionFinding,
  CompanionTriggerContext,
} from "../../../../shared/blueprint/companion/types.js";

export interface GroundingCitation {
  filePath: string;
  sectionRef?: string;
}

export interface GroundingVerificationResult {
  jobId: string;
  stage: CompanionTriggerContext["stage"];
  citations: GroundingCitation[];
  filesRead: string[];
  missingFiles: string[];
  missingSections: Array<{ filePath: string; sectionRef: string }>;
  degradedReason?: "repo_reader_unavailable" | "no_citations" | "read_error";
}

export interface VerifyFileCitationsInput {
  ctx: BlueprintServiceContext;
  triggerCtx: CompanionTriggerContext;
  artifact: unknown;
  maxFileReads?: number;
}

interface RepositoryReader {
  readFile(
    filePath: string,
  ): Promise<{ ok: true; content: string } | { ok: false; reason?: string }>;
}

function createId(): string {
  return `cf-ground-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function artifactToText(artifact: unknown): string {
  if (typeof artifact === "string") return artifact;
  try {
    return JSON.stringify(artifact, null, 2);
  } catch {
    return String(artifact);
  }
}

function getRepositoryReader(ctx: BlueprintServiceContext): RepositoryReader | null {
  const candidate = (ctx as { companionRepositoryReader?: unknown })
    .companionRepositoryReader;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { readFile?: unknown }).readFile === "function"
  ) {
    return candidate as RepositoryReader;
  }
  return null;
}

function isSafeRepoRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    !/^[a-zA-Z]:[\\/]/.test(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function extractCitations(artifact: unknown): GroundingCitation[] {
  const text = artifactToText(artifact);
  const citations: GroundingCitation[] = [];
  const seen = new Set<string>();
  const pattern =
    /(?:\[|["'`\s])((?:src|server|client|shared|docs|\.kiro)\/[A-Za-z0-9._@/\-]+(?:\.[A-Za-z0-9]+)?)(?:#([A-Za-z0-9._:-]+))?(?=\]|["'`\s,.;:)])/g;

  for (const match of text.matchAll(pattern)) {
    const filePath = match[1];
    const sectionRef = match[2];
    if (!filePath || !isSafeRepoRelativePath(filePath)) continue;
    const key = `${filePath}#${sectionRef ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ filePath, sectionRef });
  }

  return citations;
}

function sectionExists(content: string, sectionRef: string): boolean {
  return content.toLowerCase().includes(sectionRef.toLowerCase());
}

export async function verifyFileCitations(
  input: VerifyFileCitationsInput,
): Promise<GroundingVerificationResult> {
  const maxFileReads = Math.max(0, input.maxFileReads ?? 10);
  const citations = extractCitations(input.artifact).slice(0, maxFileReads);
  const base: GroundingVerificationResult = {
    jobId: input.triggerCtx.jobId,
    stage: input.triggerCtx.stage,
    citations,
    filesRead: [],
    missingFiles: [],
    missingSections: [],
  };

  if (citations.length === 0) {
    return { ...base, degradedReason: "no_citations" };
  }

  const reader = getRepositoryReader(input.ctx);
  if (!reader) {
    return { ...base, degradedReason: "repo_reader_unavailable" };
  }

  for (const citation of citations) {
    try {
      const result = await reader.readFile(citation.filePath);
      if (!result.ok) {
        base.missingFiles.push(citation.filePath);
        continue;
      }
      base.filesRead.push(citation.filePath);
      if (
        citation.sectionRef &&
        !sectionExists(result.content, citation.sectionRef)
      ) {
        base.missingSections.push({
          filePath: citation.filePath,
          sectionRef: citation.sectionRef,
        });
      }
    } catch {
      base.missingFiles.push(citation.filePath);
    }
  }

  return base;
}

export function verificationToFinding(
  ctx: BlueprintServiceContext,
  result: GroundingVerificationResult,
): CompanionFinding | null {
  const timestamp = ctx.now().toISOString();
  if (result.degradedReason === "repo_reader_unavailable") {
    return {
      id: createId(),
      role: "grounding",
      stage: result.stage,
      targetArtifactId: result.jobId,
      findings: [
        "Repository citations were present but no repository reader was available.",
      ],
      severity: "info",
      suggestedActions: ["Inject a bounded repository reader for grounding."],
      citations: result.citations.map((citation) => citation.filePath),
      repoFilesRead: [],
      timestamp,
    };
  }

  if (result.degradedReason === "no_citations") {
    return {
      id: createId(),
      role: "grounding",
      stage: result.stage,
      targetArtifactId: result.jobId,
      findings: [
        "Artifact contains claims but no concrete citations to the real repository.",
      ],
      severity: "warn",
      suggestedActions: ["Add concrete file citations from the actual repository."],
      citations: [],
      repoFilesRead: [],
      timestamp,
    };
  }

  if (result.missingFiles.length > 0) {
    return {
      id: createId(),
      role: "grounding",
      stage: result.stage,
      targetArtifactId: result.jobId,
      findings: [
        `Missing cited repository files: ${result.missingFiles.join(", ")}`,
      ],
      severity: "error",
      suggestedActions: ["Remove stale citations or create the referenced files."],
      citations: result.citations.map((citation) => citation.filePath),
      repoFilesRead: result.filesRead,
      timestamp,
    };
  }

  if (result.missingSections.length > 0) {
    return {
      id: createId(),
      role: "grounding",
      stage: result.stage,
      targetArtifactId: result.jobId,
      findings: [
        `Missing cited sections: ${result.missingSections
          .map((section) => `${section.filePath}#${section.sectionRef}`)
          .join(", ")}`,
      ],
      severity: "warn",
      suggestedActions: ["Update section references to match the current file content."],
      citations: result.citations.map((citation) =>
        citation.sectionRef
          ? `${citation.filePath}#${citation.sectionRef}`
          : citation.filePath,
      ),
      repoFilesRead: result.filesRead,
      timestamp,
    };
  }

  return {
    id: createId(),
    role: "grounding",
    stage: result.stage,
    targetArtifactId: result.jobId,
    findings: ["Repository citations were verified against readable files."],
    severity: "info",
    suggestedActions: [],
    citations: result.citations.map((citation) =>
      citation.sectionRef
        ? `${citation.filePath}#${citation.sectionRef}`
        : citation.filePath,
    ),
    repoFilesRead: result.filesRead,
    timestamp,
  };
}
