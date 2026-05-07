# Artifact Memory and Replay Tasks

- [x] 1. Define the artifact and replay model
  - [x] 1.1 Define Artifact, Replay, Timeline, and ProvenanceGraph
  - [x] 1.2 Define version, source, and timestamp fields
  - [x] 1.3 Define stage and comparison metadata

- [x] 2. Implement the Artifact Ledger
  - [x] 2.1 Persist routes, trees, documents, previews, prompts, and run results
  - [x] 2.2 Build source and version indexes
  - [x] 2.3 Provide project-level artifact queries

- [x] 3. Implement replay and comparison
  - [x] 3.1 Replay route generation
  - [x] 3.2 Replay document and execution evolution
  - [x] 3.3 Compare differences between versions

- [x] 4. Implement feedback backfill
  - [x] 4.1 Backfill into RouteSet
  - [x] 4.2 Backfill into SpecTree and SpecDocument
  - [x] 4.3 Preserve historical versions and logs

- [x] 5. Add focused tests
  - [x] 5.1 Cover artifact persistence
  - [x] 5.2 Cover replay behavior
  - [x] 5.3 Cover feedback backfill
