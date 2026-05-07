# Clarification Workflow Task List

- [x] 1. Define clarification domain models
  - [x] 1.1 Define ClarificationSession, ClarificationQuestion, and ClarificationAnswer
  - [x] 1.2 Define readiness and missing-field structures
  - [x] 1.3 Connect clarification records to the project asset store

- [x] 2. Implement question generation
  - [x] 2.1 Generate questions by goal, scope, constraints, and priority
  - [x] 2.2 Avoid duplicate questions
  - [x] 2.3 Adjust question templates for GitHub-backed and text-only projects

- [x] 3. Implement multi-round answers and assumptions
  - [x] 3.1 Support answering, skipping, and continuing the session
  - [x] 3.2 Save default assumptions and pending confirmation state
  - [x] 3.3 Continue the same clarification session by id

- [x] 4. Implement readiness gate
  - [x] 4.1 Calculate clarification completion score
  - [x] 4.2 Mark missing required questions
  - [x] 4.3 Control whether the flow can move into RouteSet generation

- [x] 5. Write tests
  - [x] 5.1 Question generation tests
  - [x] 5.2 Multi-round answer tests
  - [x] 5.3 Readiness gate tests
