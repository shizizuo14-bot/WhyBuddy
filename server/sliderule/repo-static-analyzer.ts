/**
 * Thin SlideRule-specific adapter for static repo analysis capability (repo.static.inspect).
 *
 * Reuses patterns from the GitHub MCP adapter (safe fetch, context extraction from state/inputArtifactIds).
 * Only reads files (raw or API contents), no execution, no side effects.
 * Returns the exact raw executor shape.
 * Graceful for missing files.
 */

import { fetch } from "undici";

import {
  scanForGithubUrl,
  extractFirstGithubUrl,
} from "./github-mcp-adapter.js";

export interface RepoStaticResult {
  title: string;
  summary: string;
  content: string;
  provenance: "repo:static";
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;

async function safeGithubFetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "sliderule-repo-static-analyzer",
        Accept: "text/plain",
      },
    });

    if (!res.ok) {
      const err = new Error(`GitHub HTTP ${res.status}`);
      (err as any).status = res.status >= 400 && res.status < 500 ? 400 : 502;
      throw err;
    }

    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) {
      const e = new Error("response too large");
      (e as any).status = 502;
      throw e;
    }
    return text;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err = new Error("timeout");
      (err as any).status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function safeGithubFetchJson(url: string): Promise<unknown> {
  const text = await safeGithubFetchText(url.replace("text/plain", "application/vnd.github+json")); // hacky, better separate
  // For API, call with proper
  // Simpler: duplicate minimal for json
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "sliderule-repo-static-analyzer",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub HTTP ${res.status}`);
      (err as any).status = res.status >= 400 && res.status < 500 ? 400 : 502;
      throw err;
    }
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("too large");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function executeRepoStaticInspect(
  capabilityId: string,
  state: any,
  inputArtifactIds: string[] = [],
): Promise<RepoStaticResult> {
  const url = extractFirstGithubUrl(state, inputArtifactIds);
  if (!url) {
    const err: any = new Error("no github repo context found in goal or input artifacts for static analysis");
    err.status = 400;
    throw err;
  }

  // parse owner/repo from the matched url
  const m = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!m) {
    const err: any = new Error(`invalid github url for static: ${url}`);
    err.status = 400;
    throw err;
  }
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  const fullName = `${owner}/${repo}`;

  // fetch key files as raw text (graceful)
  const pkgText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`).catch(() => null);
  let pkg: any = null;
  if (pkgText) {
    try { pkg = JSON.parse(pkgText); } catch {}
  }

  const pnpmLock = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/pnpm-lock.yaml`).catch(() => null);
  const yarnLock = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/yarn.lock`).catch(() => null);
  const npmLock = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package-lock.json`).catch(() => null);

  const packageManager = pnpmLock ? "pnpm" : yarnLock ? "yarn" : npmLock ? "npm" : (pkg?.packageManager || "unknown");

  const tsconfigText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/tsconfig.json`).catch(() => null);
  const readmeText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`).catch(() => null);
  const licenseText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/LICENSE`).catch(() => null);
  const dockerText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/Dockerfile`).catch(() => null);
  const envExampleText = await safeGithubFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/.env.example`).catch(() => null);

  // CI: use API to count workflows (light)
  let hasGithubActions = false;
  let workflowCount = 0;
  try {
    const wfJson = (await safeGithubFetchJson(`https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`)) as any[];
    if (Array.isArray(wfJson)) {
      workflowCount = wfJson.length;
      hasGithubActions = workflowCount > 0;
    }
  } catch {
    // no workflows dir or error -> false
  }

  // detected stack (simple heuristics)
  const detectedStack: string[] = [];
  if (pkg) {
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (allDeps.react) detectedStack.push("react");
    if (allDeps.next || allDeps["next/server"]) detectedStack.push("next");
    if (allDeps.vue) detectedStack.push("vue");
    if (allDeps.svelte) detectedStack.push("svelte");
    if (allDeps.vite) detectedStack.push("vite");
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) detectedStack.push("typescript");
  }
  if (tsconfigText && !detectedStack.includes("typescript")) detectedStack.push("typescript");

  const scripts = pkg?.scripts || {};

  // risks
  const risks: string[] = [];
  if (!scripts.test && !scripts["test:unit"] && !scripts["test:ci"]) risks.push("No test script found");
  if (!hasGithubActions) risks.push("No CI workflow detected");
  if (!dockerText) risks.push("No Dockerfile found");
  if (!envExampleText) risks.push("No .env.example found");

  // recommended
  const recommendedNextChecks: string[] = ["Review key config files and scripts"];
  if (!scripts.test) recommendedNextChecks.push("Add or expose test script");
  if (!hasGithubActions) recommendedNextChecks.push("Add GitHub Actions CI");
  if (packageManager === "unknown") recommendedNextChecks.push("Confirm package manager / lockfile");

  const content = JSON.stringify(
    {
      repository: fullName,
      detectedStack,
      packageManager,
      scripts,
      ci: {
        hasGithubActions,
        workflowCount,
      },
      configSignals: {
        hasTsconfig: !!tsconfigText,
        hasDockerfile: !!dockerText,
        hasEnvExample: !!envExampleText,
      },
      risks,
      recommendedNextChecks,
    },
    null,
    2,
  );

  const title = `Static Repo Analysis: ${fullName}`;
  const summary = `Detected ${detectedStack.length ? detectedStack.join(", ") : "unknown stack"} with ${packageManager}. ${risks.length} risks noted.`;

  return {
    title,
    summary,
    content,
    provenance: "repo:static" as const,
  };
}