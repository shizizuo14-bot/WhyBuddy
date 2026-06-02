# Requirements Document

## Introduction

The current blueprint pipeline accepts GitHub repository URLs and can invoke the
`mcp-github-source` capability during `route_generation`, but downstream
`spec_tree` and `spec_docs` stages only receive the URL and coarse upstream
summaries. This creates a grounding gap: generated SPEC trees and documents can
look generic even when a real repository source was provided.

This spec classifies that gap and defines a repository-context grounding layer
that turns GitHub source reads into typed, reusable artifacts for
`route_generation`, `spec_tree`, and `spec_docs`.

## Glossary

- **Repository_Source**: A normalized GitHub repository URL captured from
  intake, e.g. `https://github.com/owner/repo`.
- **Repository_Context_Snapshot**: A typed artifact summarizing verified
  repository facts such as metadata, file-tree outline, key files, framework
  signals, entrypoints, tests, and risk signals.
- **Repository_Metadata_Read**: A lightweight GitHub API or MCP read of
  repository metadata, such as owner, repo, default branch, topics, language,
  description, and latest commit hints.
- **Repository_Content_Read**: A bounded read of selected repository content,
  such as README, package manifests, config files, source entrypoints, and test
  files.
- **Grounding_Context**: The repository-context payload injected into stage
  prompts and brainstorm synthesis inputs.
- **Grounding_Degradation**: A controlled fallback when repository access is
  unavailable, rate-limited, unauthorized, or insufficient.

## Requirements

### Requirement 1: Repository Context Snapshot Artifact

**User Story:** As a blueprint pipeline user, I want GitHub repository reads to
produce a typed artifact, so that downstream stages can rely on verified
repository context instead of only seeing a URL.

#### Acceptance Criteria

1. THE system SHALL create a `repository_context_snapshot` artifact when a
   GitHub repository URL is provided and source reading is enabled.
2. THE snapshot SHALL include repository metadata: normalized URL, owner, repo,
   default branch when available, fetchedAt, and source execution path.
3. THE snapshot SHALL include a bounded content summary when content reads are
   available: README summary, manifest summary, file-tree outline, framework
   signals, entrypoints, test signals, and risk signals.
4. THE snapshot SHALL include provenance fields: capability invocation IDs,
   evidence IDs, digests for fetched payloads, and degradation reason when any
   part falls back.
5. THE snapshot SHALL be safe to store in job artifacts and SHALL NOT include
   secrets, raw tokens, or unbounded file content.

### Requirement 2: Stage-Specific Grounding Injection

**User Story:** As a product architect, I want `spec_tree` and `spec_docs` to
consume repository context, so that generated outputs reflect the actual repo
structure.

#### Acceptance Criteria

1. WHEN `spec_tree` runs, THE prompt input SHALL include the
   Repository_Context_Snapshot when available.
2. WHEN `spec_docs` runs, THE prompt input SHALL include node-specific
   repository context derived from the snapshot, such as related files,
   entrypoints, existing components, test targets, and missing pieces.
3. THE pipeline SHALL preserve the existing `githubUrls` fields for backward
   compatibility, but SHALL NOT treat URLs alone as sufficient grounding when a
   snapshot exists.
4. THE brainstorm stage context SHALL include a compact repository grounding
   summary for `route_generation`, `spec_tree`, and `spec_docs`.
5. THE system SHALL emit observable events when repository context is attached,
   missing, or degraded for a stage.

### Requirement 3: GitHub Source Read Depth

**User Story:** As an operator, I want source reading to be bounded and
configurable, so that grounding improves quality without causing uncontrolled
latency, cost, or rate-limit pressure.

#### Acceptance Criteria

1. THE repository reader SHALL support a metadata-only mode and a bounded
   content mode.
2. THE bounded content mode SHALL read only allowlisted file classes by default:
   README files, package manifests, framework config, source entrypoints, and
   test entrypoints.
3. THE reader SHALL enforce maximum file count, maximum bytes per file, maximum
   total bytes, and maximum wall-clock timeout.
4. THE reader SHALL degrade to metadata-only or URL-only context when limits are
   exceeded or access fails.
5. THE reader SHALL record enough provenance for the UI and diagnostics to
   distinguish metadata-only, content-grounded, and simulated fallback paths.

### Requirement 4: Stage-Specific Typed Synthesis

**User Story:** As a platform engineer, I want multi-agent brainstorm synthesis
to produce typed artifacts for structured stages, so that brainstorm output can
drive `route_generation`, `spec_tree`, and `spec_docs` instead of only being
visible.

#### Acceptance Criteria

1. FOR `route_generation`, THE brainstorm synthesizer SHALL request and validate
   a typed RouteSet-compatible artifact.
2. FOR `spec_tree`, THE brainstorm synthesizer SHALL request and validate a
   typed SPEC tree node payload.
3. FOR `spec_docs`, THE brainstorm synthesizer SHALL request and validate typed
   document payloads for requirements, design, and tasks.
4. THE synthesis prompt for each structured stage SHALL include the available
   Grounding_Context.
5. IF typed synthesis validation fails, THE stage SHALL degrade to the existing
   single-agent path and emit a degradation event.

### Requirement 5: Diagnostics and UI Trust Signals

**User Story:** As a user watching the autopilot page, I want to know whether
the pipeline really read repository context, so that I can trust or question
the generated SPEC output.

#### Acceptance Criteria

1. THE diagnostics endpoint SHALL expose repository grounding status per job or
   most recent run: disabled, metadata-only, content-grounded, degraded, or
   simulated.
2. THE frontend SHALL be able to show whether `spec_tree` and `spec_docs`
   received repository context.
3. THE event stream SHALL include source-read events with capability ID,
   execution path, digest/provenance references, and degradation reason.
4. THE UI SHALL NOT imply that source files were read when only the repository
   URL or metadata was available.
5. THE Artifact Replay view SHALL be able to display the Repository Context
   Snapshot without exposing raw secrets.

### Requirement 6: Backward Compatibility and Safety

**User Story:** As a maintainer, I want this grounding layer to be additive, so
that existing blueprint generation still works when GitHub reading is disabled
or unavailable.

#### Acceptance Criteria

1. WHEN repository context reading is disabled, THE pipeline SHALL behave as it
   does today.
2. WHEN GitHub access fails, THE pipeline SHALL continue with degraded context
   and SHALL NOT fail the job solely because repository grounding failed.
3. THE implementation SHALL avoid module-level network calls and SHALL use
   existing dependency injection patterns for MCP/HTTP access.
4. THE implementation SHALL redact tokens, authorization headers, and secret-like
   values before storing logs, artifacts, or event payloads.
5. Existing route, SPEC tree, SPEC document, event replay, and diagnostics tests
   SHALL remain compatible, with new tests covering grounded and degraded paths.
