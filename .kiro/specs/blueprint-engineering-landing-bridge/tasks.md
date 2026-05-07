# Engineering Landing Bridge Tasks

- [x] 1. Define the engineering landing model
  - [x] 1.1 Define EngineeringRun, LandingPlan, and PlatformHandoff
  - [x] 1.2 Define run status, platform types, and verification result types
  - [x] 1.3 Define source bindings from SpecTree and PromptPackage

- [x] 2. Implement landing plan generation
  - [x] 2.1 Derive file scopes from accepted SPEC assets
  - [x] 2.2 Generate execution order, risks, and verification steps
  - [x] 2.3 Separate automatic steps, human confirmation, and prompt handoff steps

- [x] 3. Implement platform handoffs
  - [x] 3.1 Emit Cursor, Kiro, Trae, Windsurf, Codex, and Claude formats
  - [x] 3.2 Bind targets, constraints, verification commands, and expected output
  - [x] 3.3 Support regeneration and diff comparison

- [x] 4. Implement engineering run recording
  - [x] 4.1 Persist run status, logs, tests, and screenshots
  - [x] 4.2 Bind run results to SPEC nodes and prompt packages
  - [x] 4.3 Support re-planning and feedback after failure

- [x] 5. Add focused tests
  - [x] 5.1 Cover landing plan generation
  - [x] 5.2 Cover platform handoffs
  - [x] 5.3 Cover engineering run replay
