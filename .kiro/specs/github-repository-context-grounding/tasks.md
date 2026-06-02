# Implementation Plan: GitHub Repository Context Grounding

## Overview

Create a typed repository grounding layer so GitHub source reads become reusable
pipeline context for `route_generation`, `spec_tree`, `spec_docs`, and
brainstorm typed synthesis. Work is ordered from artifact contract to source
reader, then stage injection, UI diagnostics, and validation.

## Tasks

- [ ] 1. Define repository context contracts
  - [ ] 1.1 Add shared `RepositoryContextSnapshot` and `RepositoryContextTier`
    types
    - Include metadata, content summary, provenance, and degradation fields
    - Keep raw content out of the stored contract by default
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ] 1.2 Add artifact type support for `repository_context_snapshot`
    - Ensure job artifacts, replay, and staleness mapping can carry the new type
    - Link snapshot to `github_source`, capability invocation, and evidence IDs
    - _Requirements: 1.1, 1.4, 5.5_
  - [ ] 1.3 Add unit tests for snapshot schema and artifact serialization
    - Validate metadata-only, content-grounded, degraded, and simulated tiers
    - Verify secrets/raw tokens are not accepted in stored fields
    - _Requirements: 1.5, 6.4_

- [ ] 2. Build repository context reader
  - [ ] 2.1 Create reader factory using existing dependency injection
    - Reuse `ctx.mcpToolAdapter`, `ctx.httpFetcher`, policy, logger, and now
    - Avoid module-level network calls
    - _Requirements: 3.1, 6.3_
  - [ ] 2.2 Convert existing `mcp-github-source` metadata result into snapshot
    - Preserve execution path: mcp, http, simulated
    - Capture repo URL, default branch, commit hints, digest, and fetchedAt
    - _Requirements: 1.2, 1.4, 3.5_
  - [ ] 2.3 Add bounded content read mode behind an env flag
    - Read allowlisted file classes only: README, manifests, framework config,
      source entrypoints, and test entrypoints
    - Enforce max file count, max bytes per file, total bytes, and timeout
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 2.4 Add degradation handling
    - Degrade content read failure to metadata-only
    - Degrade metadata failure to url-only or simulated
    - Record redacted reason in snapshot provenance
    - _Requirements: 3.4, 6.2, 6.4_
  - [ ] 2.5 Add tests for reader modes and degradation
    - Cover disabled, no URL, invalid URL, metadata success, content success,
      timeout, rate limit, and unauthorized paths
    - _Requirements: 3.4, 6.1, 6.2_

- [ ] 3. Persist and replay repository context
  - [ ] 3.1 Write snapshot during route generation
    - Use existing route generation capability evidence where available
    - Persist one snapshot per normalized repository source
    - _Requirements: 1.1, 1.4_
  - [ ] 3.2 Add source-read events
    - Emit events for started, completed, degraded, and attached-to-stage states
    - Include tier, execution path, artifact IDs, and degradation reason
    - _Requirements: 5.1, 5.3_
  - [ ] 3.3 Extend artifact replay rendering data
    - Ensure replay exposes snapshot summary without raw secrets
    - _Requirements: 5.5, 6.4_

- [ ] 4. Inject grounding into `spec_tree`
  - [ ] 4.1 Add `buildGroundingContextForStage(job, "spec_tree")`
    - Project snapshot into compact tree-derivation context
    - Include file tree summary, framework signals, manifests, entrypoints,
      test signals, and repository risks
    - _Requirements: 2.1, 2.3_
  - [ ] 4.2 Extend `buildSpecTreePrompt()` with `repositoryContext`
    - Preserve existing `githubUrls`
    - Add context only when snapshot exists
    - _Requirements: 2.1, 2.3_
  - [ ] 4.3 Extend `specTreeLlmDerivation.derive()` input
    - Pass grounding context alongside `githubUrls` and target text
    - Keep fallback behavior unchanged
    - _Requirements: 2.1, 6.1_
  - [ ] 4.4 Add tests proving spec tree prompt uses repository context
    - Verify URL-only and snapshot-present cases
    - Verify prompt does not claim content grounding when tier is metadata-only
    - _Requirements: 2.1, 5.4_

- [ ] 5. Inject grounding into `spec_docs`
  - [ ] 5.1 Add node-specific grounding projection
    - Map SPEC tree node title, summary, dependencies, and outputs to related
      repository files, entrypoints, tests, and missing pieces
    - _Requirements: 2.2_
  - [ ] 5.2 Extend `buildSpecDocumentsPrompt()` with
    `repositoryContextForNode`
    - Preserve existing `githubUrls` and `upstreamEvidence`
    - Include only compact related context for the target node
    - _Requirements: 2.2, 2.3_
  - [ ] 5.3 Add tests proving document prompts are grounded
    - Requirements/design/tasks prompts should include node-related repo context
    - Metadata-only tiers should remain explicit and not imply source content
    - _Requirements: 2.2, 5.4_

- [ ] 6. Add stage-specific brainstorm synthesis schemas
  - [ ] 6.1 Extend synthesis input with grounding context
    - Include compact repository grounding summary for structured stages
    - _Requirements: 2.4, 4.4_
  - [ ] 6.2 Add RouteSet-compatible synthesis schema
    - Validate and map `route_generation` brainstorm output
    - _Requirements: 4.1, 4.5_
  - [ ] 6.3 Add SPEC tree synthesis schema
    - Validate and map `spec_tree` brainstorm output
    - _Requirements: 4.2, 4.5_
  - [ ] 6.4 Add SPEC docs synthesis schema
    - Validate requirements/design/tasks payloads
    - _Requirements: 4.3, 4.5_
  - [ ] 6.5 Add degradation tests for invalid typed synthesis
    - Ensure existing single-agent fallback remains intact
    - _Requirements: 4.5, 6.2_

- [ ] 7. Add diagnostics and UI trust signals
  - [ ] 7.1 Extend diagnostics with repository grounding status
    - Report disabled, url_only, metadata, content, degraded, or simulated
    - _Requirements: 5.1_
  - [ ] 7.2 Surface grounding status in realtime events
    - Allow frontend to show whether spec stages received repository context
    - _Requirements: 5.2, 5.3_
  - [ ] 7.3 Add frontend copy/visual state for grounding tier
    - Avoid claiming source-content grounding for URL-only or metadata-only tiers
    - _Requirements: 5.4_

- [ ] 8. Final verification
  - [ ] 8.1 Run focused backend tests for route generation, spec tree, spec docs,
    brainstorm, diagnostics, and artifact replay
  - [ ] 8.2 Run focused frontend tests for realtime events and grounding trust UI
  - [ ] 8.3 Run TypeScript check and document any unrelated existing failures
  - [ ] 8.4 Manually verify a GitHub-backed job shows the correct grounding tier
    in artifacts/events/UI
