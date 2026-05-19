# Input and GitHub Ingestion Task List

- [x] 1. Define input and asset data structures
  - [x] 1.1 Define InputEntry, GitHubSource, IntakeRecord, and ProjectContext types
  - [x] 1.2 Define source evidence and failure state structures
  - [x] 1.3 Add project asset storage hooks for intake data

- [x] 2. Implement input and GitHub parsing
  - [x] 2.1 Parse plain text, GitHub URLs, multiple links, and existing project references
  - [x] 2.2 Extract repository metadata, README-style signals, and directory hints
  - [x] 2.3 Deduplicate repeated links and record fallback behavior

- [x] 3. Implement IntakeRecord construction and persistence
  - [x] 3.1 Generate a normalized summary and source evidence list
  - [x] 3.2 Write project assets and bind them to projectId
  - [x] 3.3 Support replay and reopening through the same intake entry

- [x] 4. Connect the Autopilot entry point
  - [x] 4.1 Wire the current autopilot input surface
  - [x] 4.2 Reuse existing project context when present
  - [x] 4.3 Show parsed, failed, and pending source states

- [x] 5. Write tests
  - [x] 5.1 Input parsing unit tests
  - [x] 5.2 GitHub parsing and dedupe tests
  - [x] 5.3 Intake asset persistence tests
