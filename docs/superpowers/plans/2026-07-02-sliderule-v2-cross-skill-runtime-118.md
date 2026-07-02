# SlideRule V2 Cross-Skill Runtime 118

## Goal
Use Grok aggressively to connect the six SlideRule Skills after 117 runtime helper landing. This wave creates 480 task specs and 16 shard queues. It is intentionally code-heavy and light-gated.

## Scope
- RBAC, DataModel, Workflow, Page, AIGC, AppBundle.
- 80 tasks per Skill, 480 tasks total.
- 16 shards, 30 tasks per shard.
- Queue-level review is skipped to maximize throughput; landing to main remains manual and verified after shard completion.

## Runtime Linkage Themes
- RBAC to Page/Workflow/AIGC/AppBundle PDP evidence.
- DataModel to Page/Workflow/AIGC/AppBundle SSOT field, dataset, lifecycle, migration evidence.
- Workflow to Page/AppBundle task view, form binding, instance lifecycle evidence.
- Page to Workflow/AppBundle component state, action, binding expression evidence.
- AIGC to DataModel/RBAC/AppBundle output schema, citation, tool budget evidence.
- AppBundle runtime closure across all Skills.

## Safety Constraints
- No secrets, network, DB, Redis, browser, provider calls, timers, or unrelated rewrites.
- No per-task heavy tests; final landing must run consolidated tests.
- Keep worktrees for audit. Do not clean automatically.

## Generated Assets
- Tasks: `agent-loop/tasks/sliderule-v2-cross-*-118.md`
- Queues: `agent-loop/scripts/sliderule-v2-cross-runtime-118-shard-*-queue.json`
