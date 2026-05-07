# Implementation Prompt Packager Tasks

- [x] 1. Define the prompt package model
  - [x] 1.1 Define PromptPackage, PromptTargetPlatform, and PromptScope
  - [x] 1.2 Define ContextPack and VerificationPlan
  - [x] 1.3 Define export status and source bindings

- [x] 2. Implement the prompt assembler
  - [x] 2.1 Collect node context from SpecTree
  - [x] 2.2 Collect requirements, design, tasks, and acceptance criteria from documents
  - [x] 2.3 Collect future effects and architecture notes from previews

- [x] 3. Implement platform adapters
  - [x] 3.1 Support Cursor / Kiro / Trae
  - [x] 3.2 Support Windsurf / Codex / Claude
  - [x] 3.3 Support Markdown, plain text, and JSON export shapes

- [x] 4. Implement the prompt package workbench
  - [x] 4.1 Show prompt package list
  - [x] 4.2 Support copy, export, and regeneration
  - [x] 4.3 Mark whether a prompt package is ready for engineering landing

- [x] 5. Add focused tests
  - [x] 5.1 Cover prompt package generation
  - [x] 5.2 Cover platform adaptation
  - [x] 5.3 Cover workbench rendering
