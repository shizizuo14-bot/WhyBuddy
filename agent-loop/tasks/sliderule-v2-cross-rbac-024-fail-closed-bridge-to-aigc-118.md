# SlideRule V2 Cross-Skill Runtime 118: RBAC 024 fail-closed bridge to aigc

## Execution status
- Status: PENDING
- Phase: 118-cross-skill-runtime
- Skill: rbac
- Target skill: aigc
- Wave: 480-task Grok acceleration wave
- Throughput mode: code-heavy, light-gated, no per-task heavy tests

## Context
117 landed pure runtime helpers inside the six SlideRule Skills. 118 should aggressively connect those helpers across Skill boundaries. Prefer adding real executable TypeScript helpers, typed evidence shapes, fixture glue, and orchestrator surfaces over prose-only changes. Keep code deterministic and in-memory: no DB, no Redis, no provider calls, no browser, no network, no secrets.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `client/src/lib/skills/orchestrator.ts`
- `client/src/lib/skills/aigc/aigcModel.ts`
- `client/src/lib/skills/aigc/aigcSkill.ts`
- `client/src/lib/skills/aigc/aigcSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-cross-rbac-024-fail-closed-bridge-to-aigc-118.md`

## Do not
- Do not weaken existing runtime helpers or remove existing tests.
- Do not use provider APIs, network calls, timers, DB, Redis, browser automation, or credentials.
- Do not perform broad rewrites outside the allowed files.
- Do not block on full repo tests in this task; this wave is intentionally throughput-oriented.
- Do not mark the task done by editing markdown only; add executable code or typed runtime surfaces.

## Required implementation
- [ ] Add a fail-closed bridge that returns a stable blocked/denied/error code when required upstream evidence is absent.
- [ ] Reuse or extend `evaluateRbacSodPolicy` where it is the nearest existing runtime primitive.
- [ ] Add a stable exported symbol, type, helper, evidence key, fixture, or orchestrator projection that makes rbac -> aigc linkage more executable.
- [ ] Preserve purchase approval and leave approval sample compatibility when touching sample models.
- [ ] Add deterministic failure semantics: absent upstream evidence must produce an explicit blocked/denied/error state instead of silent allow.

## Required tests
- [ ] Heavy tests are deferred for this wave. If cheap, add a focused unit test in the touched Skill test file.
- [ ] At minimum, leave code in a shape that can be covered by the existing Skill test files during landing.

## Required validation
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-cross-rbac-024-fail-closed-bridge-to-aigc-118.md`

## Acceptance criteria
- The task adds executable cross-skill runtime linkage, not only comments.
- The new code is deterministic and local-only.
- The linkage has a positive evidence path and a fail-closed negative path.
- Existing exported runtime primitives remain available.
- The AgentLoop final report identifies changed files and the new runtime linkage symbol or evidence key.
