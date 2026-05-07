# Autopilot Route Orchestrator Task List

- [x] 1. Define route domain models
  - [x] 1.1 Define RouteSet, RouteCandidate, PrimaryRoute, and AlternativeRoute
  - [x] 1.2 Define risk, cost, and complexity fields
  - [x] 1.3 Define capability usage evidence structures

- [x] 2. Implement the base route orchestrator
  - [x] 2.1 Accept target instructions and GitHub context
  - [x] 2.2 Generate the primary execution path and alternative execution paths
  - [x] 2.3 Summarize route steps, capability pool, and downstream assets

- [x] 3. Implement route review and selection
  - [x] 3.1 Display route outlines, risk, and cost
  - [x] 3.2 Support selecting, merging, reselecting, and rolling back routes
  - [x] 3.3 Persist the user's final decision

- [x] 4. Implement route asset persistence
  - [x] 4.1 Write RouteSet to project assets
  - [x] 4.2 Record provenance and evidence
  - [x] 4.3 Provide route output as the source for SPEC tree derivation

- [x] 5. Write tests
  - [x] 5.1 Route generation tests
  - [x] 5.2 Capability pool structure tests
  - [x] 5.3 Route selection, merge, rollback, and persistence tests
