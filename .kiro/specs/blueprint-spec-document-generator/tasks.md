# SPEC Document Generator Tasks

- [x] 1. Define the initial document model
  - [x] 1.1 Define SpecDocument, DocumentKind, and markdown format
  - [x] 1.2 Record docId, nodeId, treeId, treeVersion, and provenance
  - [x] 1.3 Return specDocuments from the latest blueprint job response

- [x] 2. Implement document generation APIs
  - [x] 2.1 Generate requirements documents
  - [x] 2.2 Generate design documents
  - [x] 2.3 Generate tasks documents
  - [x] 2.4 Support generation by node, type set, and full tree

- [x] 3. Implement the document workbench
  - [x] 3.1 Show SpecTree nodes and current node document state
  - [x] 3.2 Refresh existing documents
  - [x] 3.3 Generate requirements/design/tasks for the selected node
  - [x] 3.4 Preview generated markdown and draft fallback content

- [x] 4. Add document versions and review state
  - [x] 4.1 Define DocumentVersion, accept/reject, and review metadata
  - [x] 4.2 Persist version snapshots in job artifacts
  - [x] 4.3 Review accepted/rejected documents through API
  - [x] 4.4 Surface document review state in the workbench

- [x] 5. Add focused tests
  - [x] 5.1 Cover backend generation, read, filter, and invalid requests
  - [x] 5.2 Cover the document workbench rendering
  - [x] 5.3 Cover the combined SPEC page rendering
