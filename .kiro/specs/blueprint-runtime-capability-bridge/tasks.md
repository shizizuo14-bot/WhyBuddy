# Runtime Capability Bridge Task List

- [x] 1. Define the runtime capability model
  - [x] 1.1 Define Capability, CapabilityInvocation, CapabilityEvidence, and safety gate contracts.
  - [x] 1.2 Define capability kinds, tags, security levels, availability states, and invocation states.
  - [x] 1.3 Define input/output constraints and evidence payload summary rules.

- [x] 2. Implement the capability registry
  - [x] 2.1 Register Docker, MCP, Skill, AIGC Node, and Role capabilities.
  - [x] 2.2 Support registry reads by kind, security level, tag, and status.
  - [x] 2.3 Bind the registry to blueprint jobs without requiring a real external runtime call.

- [x] 3. Implement runtime adapters
  - [x] 3.1 Implement the deterministic Docker sandbox adapter simulation.
  - [x] 3.2 Implement deterministic MCP and Skill adapter simulations.
  - [x] 3.3 Implement deterministic local AIGC node and role adapter simulations.

- [x] 4. Implement evidence collection and safety gates
  - [x] 4.1 Persist capability invocation output, logs, artifacts, and errors.
  - [x] 4.2 Enforce security levels, network approval, write approval, and disabled capability blocking.
  - [x] 4.3 Bind Capability Evidence back to RouteSet, SPEC tree, and artifact memory lineage.

- [x] 5. Add tests
  - [x] 5.1 Cover capability registry reads.
  - [x] 5.2 Cover runtime invocation scheduling and deterministic evidence output.
  - [x] 5.3 Cover safety gate blocking and artifact evidence persistence.
