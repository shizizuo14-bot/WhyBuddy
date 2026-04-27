import { readFile } from "node:fs/promises";
import path from "node:path";

const FRONTEND_AUTOPILOT_PROGRESS_SPECS = [
  "autopilot-cockpit-three-column-layout",
  "autopilot-destination-card-and-goal-lock",
  "autopilot-drive-state-timeline-and-replan",
  "autopilot-empty-state-and-onboarding",
  "autopilot-evidence-driving-recorder",
  "autopilot-fleet-live-visualization",
  "autopilot-frontend-state-model-and-store",
  "autopilot-launch-destination-input",
  "autopilot-mobile-and-responsive-cockpit",
  "autopilot-route-planning-overlay",
  "autopilot-takeover-control-panel",
  "autopilot-visual-language-and-motion-system",
];

const TASKS_PER_SPEC = 12;
const checkedTaskPattern = /-\s*\[x\]/gi;
const taskPattern = /-\s*\[[ x]\]/gi;
const root = process.cwd();

function summarize(files) {
  const specs = FRONTEND_AUTOPILOT_PROGRESS_SPECS.map(slug => {
    const content = files.get(slug);
    const done = content ? (content.match(checkedTaskPattern) ?? []).length : 0;
    const foundTotal = content ? (content.match(taskPattern) ?? []).length : 0;
    const total = Math.max(foundTotal, TASKS_PER_SPEC);
    return {
      slug,
      done,
      total,
      missing: content === undefined,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
  const done = specs.reduce((sum, spec) => sum + spec.done, 0);
  const total = specs.reduce((sum, spec) => sum + spec.total, 0);
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    completedSpecs: specs.filter(spec => spec.done >= spec.total).length,
    totalSpecs: specs.length,
    specs,
  };
}

async function main() {
  const files = new Map();
  for (const slug of FRONTEND_AUTOPILOT_PROGRESS_SPECS) {
    const filePath = path.join(root, ".kiro", "specs", slug, "tasks.md");
    try {
      files.set(slug, await readFile(filePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const summary = summarize(files);
  console.log(
    `Frontend Autopilot P2 progress: ${summary.done} / ${summary.total} (${summary.percent}%)`
  );
  for (const spec of summary.specs) {
    const marker = spec.missing ? "missing" : `${spec.percent}%`;
    console.log(`- ${spec.slug}: ${spec.done} / ${spec.total} (${marker})`);
  }
}

await main();
