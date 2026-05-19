# Project Domain Asset Store Task List

- [x] 1. Define core asset types
  - [x] 1.1 Define Project, RouteSet, SpecTree, and SpecNode
  - [x] 1.2 Define SpecDocument, EffectPreview, PromptPackage, and EngineeringRun
  - [x] 1.3 Define version, status, and provenance fields

- [x] 2. Implement asset storage and queries
  - [x] 2.1 Organize assets by projectId
  - [x] 2.2 Support version and status lookups
  - [x] 2.3 Provide selectors and derived project context queries

- [x] 3. Implement asset lineage tracking
  - [x] 3.1 Record input, clarification, and route sources
  - [x] 3.2 Save parent versions and change reasons
  - [x] 3.3 Support reverse lookup from assets to sources

- [x] 4. Implement execution write-back
  - [x] 4.1 Allow runs to write back to Tree, Docs, and Route artifacts
  - [x] 4.2 Record diffs and replay information
  - [x] 4.3 Keep historical versions read-only

- [x] 5. Write tests
  - [x] 5.1 Asset persistence tests
  - [x] 5.2 Version lineage tests
  - [x] 5.3 Write-back tests
