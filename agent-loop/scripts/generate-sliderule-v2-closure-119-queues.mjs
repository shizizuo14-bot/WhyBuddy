import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tasksDir = path.join(root, "agent-loop", "tasks");
const scriptsDir = path.join(root, "agent-loop", "scripts");

const themes = [
  {
    key: "appbundle",
    queue: "sliderule-v2-closure-appbundle-119-queue.json",
    worktree: "sliderule-v2-closure-appbundle-119-run",
    tasks: [
      ["appbundle-runtime-closure-report-digest", "Add closureId, closureHash, generatedAt, and stable digest fields to the AppBundle runtime closure report."],
      ["appbundle-release-artifact-closure-summary", "Attach runtime closure summary to AppBundle release artifact evidence without weakening existing publish gate semantics."],
      ["appbundle-publish-manifest-closure-evidence", "Expose publish closure evidence digest through the AppBundle publish manifest surface."],
      ["appbundle-closure-blocker-taxonomy", "Classify AppBundle runtime closure findings into hard blocker, warning, and info tiers with deterministic mapping."],
      ["appbundle-rollback-closure-hash", "Compare rollback target snapshots by runtime closure hash and expose changed closure refs."],
      ["appbundle-snapshot-mismatch-negative", "Add fail-closed negative handling for version pin versus runtime snapshot mismatch."],
      ["appbundle-leave-purchase-positive-closure", "Keep leave and purchase approval AppBundle closure green with explicit per-skill evidence coverage."],
      ["appbundle-runtime-closure-fixtures", "Add deterministic fixtures for closed and blocked AppBundle runtime closure reports."],
    ],
  },
  {
    key: "report",
    queue: "sliderule-v2-closure-report-119-queue.json",
    worktree: "sliderule-v2-closure-report-119-run",
    tasks: [
      ["sliderule-delivery-md-publish-closure", "Render AppBundle publish/runtime closure in SlideRule delivery markdown."],
      ["sliderule-report-write-runtime-closure", "Make report.write include runtime closure summary when closure evidence is present."],
      ["sliderule-report-blocked-section", "Add a blocked closure report section with blocker code, path, and affected skill."],
      ["sliderule-report-closed-section", "Add a closed closure report section with evidence coverage and checked version pins."],
      ["sliderule-report-evidence-coverage-table", "Render a stable per-skill evidence coverage table for DataModel/RBAC/Workflow/Page/AIGC/AppBundle."],
      ["sliderule-report-blocker-path-rendering", "Normalize blocker path rendering for markdown and UI preview consumers."],
      ["sliderule-export-closure-tests", "Add focused export tests for closure fields in generated delivery/report content."],
      ["sliderule-report-fixture-smoke", "Add fixture smoke coverage for report output with closed and blocked runtime closure."],
    ],
  },
  {
    key: "python",
    queue: "sliderule-v2-closure-python-119-queue.json",
    worktree: "sliderule-v2-closure-python-119-run",
    tasks: [
      ["python-drive-full-skill-runtime-graph-schema", "Add Python schema for skillRuntimeGraph compatible with the TypeScript crossRuntimeGraph shape."],
      ["python-drive-full-publish-closure-schema", "Add Python schema for publishClosure/runtimeClosure response payloads."],
      ["python-drive-full-closure-response", "Return skillRuntimeGraph and publishClosure from /drive-full where deterministic closure evidence is available."],
      ["python-drive-full-model-dump-compat", "Keep /drive-full compatible with Pydantic model_dump results and plain dict capability results."],
      ["node-sliderule-proxy-closure-pass-through", "Preserve Python skillRuntimeGraph and publishClosure fields through the Node thin proxy."],
      ["frontend-session-store-publish-closure", "Persist publish closure evidence in the frontend SlideRule session state without breaking older sessions."],
      ["frontend-prefer-python-closure-over-preview", "Prefer Python-produced closure evidence in the page and fall back to TS preview only when absent."],
      ["python-drive-full-happy-closure-test", "Add Python happy path test proving /drive-full returns closed publish closure evidence."],
      ["python-drive-full-blocked-closure-test", "Add Python blocked path test proving missing declared Skill evidence does not fake green."],
      ["sliderule-python-closure-browser-smoke", "Add or update browser smoke coverage for closure visibility after a /agent-loop/sliderule command."],
    ],
  },
  {
    key: "skills",
    queue: "sliderule-v2-closure-skills-119-queue.json",
    worktree: "sliderule-v2-closure-skills-119-run",
    tasks: [
      ["datamodel-to-rbac-impact-closure", "Strengthen DataModel field/entity changes so RBAC policy impact reaches runtime closure evidence."],
      ["datamodel-to-page-impact-closure", "Strengthen DataModel field changes so Page binding impact reaches runtime closure evidence."],
      ["datamodel-to-workflow-impact-closure", "Strengthen DataModel field changes so Workflow condition/form impact reaches runtime closure evidence."],
      ["rbac-pdp-explain-evidence", "Expose deterministic RBAC PDP allow/deny/fail-closed explanation evidence for downstream closure."],
      ["rbac-fail-closed-negative-path", "Add RBAC fail-closed negative path consumed by Page, Workflow, AIGC, or AppBundle closure."],
      ["workflow-assignee-policy-closure", "Close Workflow assignee policy evidence against RBAC roles and policy decisions."],
      ["workflow-task-view-closure", "Close Workflow task view evidence against Page task surfaces and AppBundle bindings."],
      ["page-field-binding-closure", "Close Page field binding evidence against DataModel SSOT fields."],
      ["page-permission-render-closure", "Close Page permission rendering evidence against RBAC policy surfaces."],
      ["aigc-positive-sample-closure", "Expose AIGC positive sample evidence that can feed DataModel/Page/RBAC/AppBundle closure."],
      ["aigc-negative-sample-closure", "Expose AIGC negative sample evidence that fails closed when policy or schema evidence is absent."],
      ["appbundle-aggregate-edge-validation", "Validate AppBundle aggregate edges across all six Skill runtime evidence surfaces."],
    ],
  },
  {
    key: "ui",
    queue: "sliderule-v2-closure-ui-119-queue.json",
    worktree: "sliderule-v2-closure-ui-119-run",
    tasks: [
      ["sliderule-blocker-drilldown", "Add UI drilldown data for publish closure blockers without adding a heavy modal."],
      ["sliderule-skill-linkage-click-target", "Make Skill linkage rows expose stable click/selection targets for affected Skill and ref."],
      ["sliderule-status-bar-publish-closure-badge", "Surface publish closure closed/blocked state in the SlideRule status bar."],
      ["workbench-outcome-closure-status", "Record closure status in AgentLoop queue outcomes and Workbench task overview when available."],
      ["queue-final-report-closure-summary", "Write closure status and top blockers into AgentLoop final report text."],
      ["sliderule-closure-visual-smoke", "Add a lightweight browser smoke assertion for visible publish closure state."],
    ],
  },
  {
    key: "precheck",
    queue: "sliderule-v2-closure-precheck-119-queue.json",
    worktree: "sliderule-v2-closure-precheck-119-run",
    tasks: [
      ["closure-focused-vitest-matrix", "Define and run the focused vitest matrix for AppBundle closure, reports, and Skill linkage."],
      ["closure-python-test-matrix", "Define and run the Python test matrix for drive-full closure schema and blocked/happy paths."],
      ["closure-frontend-typecheck", "Run frontend typecheck after closure integration and record any baseline-safe findings."],
      ["closure-no-secret-scan", "Scan closure landing diff for secrets and runtime artifacts before main landing."],
      ["closure-queue-outcome-cleanup", "Normalize queue outcomes for the 119 closure shards after Codex review/landing."],
      ["closure-final-landing-commit", "Prepare final reviewed landing commit summary with evidence commands and clean main status."],
    ],
  },
];

const commonAllowedFiles = [
  "client/src/lib/skills/**",
  "client/src/pages/sliderule/**",
  "client/src/pages/SlideRule.tsx",
  "slide-rule-python/**",
  "server/routes/sliderule.ts",
  "server/sliderule/**",
  "agent-loop/tasks/**",
  "agent-loop/scripts/**",
];

const themeNotes = {
  appbundle: "Focus on AppBundle as the publish/runtime closure aggregator. Prefer pure TypeScript helpers, deterministic fixtures, and focused tests.",
  report: "Focus on delivery/report serialization. Do not change core runtime semantics unless a focused test proves the need.",
  python: "Focus on Python /drive-full schema and pass-through. Preserve degraded/error states and avoid provider calls.",
  skills: "Focus on one Skill boundary at a time. Add deterministic positive and fail-closed negative evidence paths.",
  ui: "Focus on compact operational visibility. Keep the page quiet and avoid large layout rewrites.",
  precheck: "Focus on validation, landing evidence, and queue hygiene. Do not add broad feature code here.",
};

function taskMarkdown(theme, index, slug, objective) {
  const id = `sliderule-v2-closure-${theme.key}-${String(index).padStart(2, "0")}-${slug}-119`;
  return {
    id,
    path: path.join(tasksDir, `${id}.md`),
    content: `# ${id}

## Execution status
- Status: PENDING
- Phase: 119-appbundle-runtime-closure
- Theme: ${theme.key}
- Owner: grok
- Reviewer: codex
- Landing: codex-reviewed-only
- Reference wave: 480-task 118 cross-runtime outputs

## Objective
${objective}

## Context
This task is part of the 50-task AppBundle publish/runtime closure integration wave. Use the prior 118 cross-runtime task files, queue outcomes, and shard worktrees as reference material, but do not blindly apply generated patches. Grok may implement candidate code in the shard worktree; Codex will review, extract, test, and land only clean slices to main.

${themeNotes[theme.key]}

## Reference sources
- \`agent-loop/tasks/sliderule-v2-cross-*-118.md\`
- \`agent-loop/scripts/sliderule-v2-cross-runtime-118-shard-*-queue.json\`
- \`.worktrees/sliderule-v2-cross-runtime-118-shard-*-run\`
- Current main commits around AppBundle runtime closure and Skill linkage.

## Allowed files
${commonAllowedFiles.map((file) => `- \`${file}\``).join("\n")}

## Do not
- Do not edit \`.env\`, credentials, lockfiles, or unrelated runtime artifacts.
- Do not weaken existing tests, gates, or fail-closed semantics.
- Do not apply a raw 480-task patch wholesale.
- Do not mark done with markdown-only changes.
- Do not make network, DB, Redis, provider, or browser calls from pure Skill helpers.

## Required implementation
- [ ] Add or update executable code, typed schema, fixture, adapter, or focused tests for the objective.
- [ ] Preserve deterministic local behavior.
- [ ] Include both positive evidence and fail-closed negative behavior where applicable.
- [ ] Keep public API names stable or document any migration in the final report.
- [ ] Add a concise final report listing changed files, exported symbols, and validation commands.

## Acceptance criteria
- The result is useful as candidate material for Codex review and main landing.
- The changed code is scoped to the objective and theme.
- Focused tests are added or updated when practical.
- Existing AppBundle publish/runtime closure semantics are not weakened.
- AgentLoop final report explains how this task advances publish/runtime closure.
`,
  };
}

function queueJson(theme, tasks) {
  return {
    cwd: "..",
    defaults: {
      useWorktree: true,
      worktreeScope: "queue",
      queueWorktreeName: theme.worktree,
      autoFix: true,
      skipReview: false,
      fixAgent: "grok",
      fixModel: "grok-build",
      reviewAgent: "codex",
      reviewModel: "gpt-5.5",
      scopedReview: true,
      workerMaxTurns: 512,
      workerMaxRetries: 1,
      grokMaxTurns: 512,
      grokMaxRetries: 1,
      reviewMaxTurns: 4,
      guardTests: false,
      maxIterations: 12,
      agentIdleTimeoutMs: 1200000,
      agentTimeoutMs: 2400000,
      noSyncTaskStatus: false,
      autoDisableOnNoChanges: false,
      cleanupWorktree: false,
      timeoutMs: 3600000,
      lang: "zh-CN",
      pythonExe: "slide-rule-python/.venv/Scripts/python.exe",
      workerEnv: {
        HTTP_PROXY: "http://127.0.0.1:7890",
        HTTPS_PROXY: "http://127.0.0.1:7890",
        ALL_PROXY: "http://127.0.0.1:7890",
        NO_PROXY: "localhost,127.0.0.1,::1",
      },
    },
    gates: ["node agent-loop/src/check-mojibake.js {{taskFile}}"],
    tasks: tasks.map((task) => ({
      id: task.id,
      task: `agent-loop/tasks/${path.basename(task.path)}`,
      enabled: true,
      gates: [
        "node -e \"const fs=require('fs'); const task=fs.readFileSync(process.argv[1],'utf8'); for (const needle of ['119-appbundle-runtime-closure','## Required implementation','## Acceptance criteria','codex-reviewed-only']) { if(!task.includes(needle)) throw new Error('task missing marker: '+needle); }\" {{taskFile}}",
        "node agent-loop/src/check-mojibake.js {{taskFile}}",
      ],
      workerMaxTurns: 512,
      maxIterations: 12,
      fixAgent: "grok",
      fixModel: "grok-build",
      reviewAgent: "codex",
      reviewModel: "gpt-5.5",
      scopedReview: true,
      skipReview: false,
    })),
  };
}

fs.mkdirSync(tasksDir, { recursive: true });
fs.mkdirSync(scriptsDir, { recursive: true });

const generated = [];
for (const theme of themes) {
  const taskFiles = theme.tasks.map(([slug, objective], index) => taskMarkdown(theme, index + 1, slug, objective));
  for (const task of taskFiles) {
    fs.writeFileSync(task.path, task.content, "utf8");
    generated.push(path.relative(root, task.path));
  }
  const queuePath = path.join(scriptsDir, theme.queue);
  fs.writeFileSync(queuePath, `${JSON.stringify(queueJson(theme, taskFiles), null, 2)}\n`, "utf8");
  generated.push(path.relative(root, queuePath));
}

console.log(`Generated ${generated.length} files`);
for (const file of generated) console.log(file.replace(/\\/g, "/"));
