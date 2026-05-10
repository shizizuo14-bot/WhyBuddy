/**
 * Policy + redaction helpers for the Prompt Package LLM generator.
 *
 * Owns:
 * - `PromptPackageLlmPolicy` interface (resource / schema upper bounds / redaction config).
 * - `createDefaultPromptPackageLlmPolicy()` factory honoring
 *   `BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS` env override
 *   (clamped to `(0, 30_000]`; illegal / non-finite / non-positive / empty
 *   values fall back to the 30s default).
 * - `applyPromptPackageRedaction(value, policy)` pure redaction helper.
 *
 * No runtime / business imports — this file is intentionally a pure data
 * module + pure functions so it can be imported from service.ts, tests, and
 * future shared-redaction abstractions without introducing cycles. Only
 * `process.env` is consulted, and only at factory invocation time.
 *
 * See design §4.3 / §D9, requirements 2.8, 4.1, 5.1.
 */

export interface PromptPackageLlmPolicy {
  /** Single LLM-call + validation wall-clock upper bound (ms); never exceeds 30_000. */
  maxInvocationTimeoutMs: number;
  /** Temperature forwarded to ctx.llm.callJson. */
  temperature: number;
  /** Retry attempts forwarded to ctx.llm.callJson. */
  callJsonRetryAttempts: number;
  /** Top-level field upper bounds. */
  maxTitleLength: number;
  maxSummaryLength: number;
  /** Prompts array bounds. */
  minPrompts: number;
  maxPrompts: number;
  maxPromptIdLength: number;
  maxPromptTitleLength: number;
  maxSystemPromptLength: number;
  maxUserPromptLength: number;
  maxVariablesPerPrompt: number;
  maxVariableNameLength: number;
  maxVariableDescriptionLength: number;
  maxExamplesPerPrompt: number;
  maxExampleTitleLength: number;
  maxExampleInputLength: number;
  maxExampleOutputLength: number;
  /** Sections array bounds. */
  minSections: number;
  maxSections: number;
  maxSectionHeadingLength: number;
  maxSectionBodyLength: number;
  /** Case-insensitive keyword list for key:value redaction. */
  redactionKeywords: readonly string[];
  /** Email regex (global) for defensive redaction. */
  redactedEmailPattern: RegExp;
  /** OpenAI / Anthropic API key regex. */
  redactedApiKeyPattern: RegExp;
  /** GitHub PAT / fine-grained token regex. */
  redactedGithubPatPattern: RegExp;
  /** Error message truncation upper bound. */
  maxErrorLength: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 30_000;
const TIMEOUT_ENV_VAR = "BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS";

function resolveTimeoutOverride(): number {
  const raw = process.env[TIMEOUT_ENV_VAR];
  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(parsed, MAX_TIMEOUT_MS);
}

export function createDefaultPromptPackageLlmPolicy(): PromptPackageLlmPolicy {
  return {
    maxInvocationTimeoutMs: resolveTimeoutOverride(),
    temperature: 0.2,
    callJsonRetryAttempts: 1,
    maxTitleLength: 200,
    maxSummaryLength: 500,
    minPrompts: 1,
    maxPrompts: 12,
    maxPromptIdLength: 128,
    maxPromptTitleLength: 200,
    maxSystemPromptLength: 4000,
    maxUserPromptLength: 4000,
    maxVariablesPerPrompt: 30,
    maxVariableNameLength: 64,
    maxVariableDescriptionLength: 500,
    maxExamplesPerPrompt: 10,
    maxExampleTitleLength: 200,
    maxExampleInputLength: 4000,
    maxExampleOutputLength: 4000,
    minSections: 1,
    maxSections: 20,
    maxSectionHeadingLength: 200,
    maxSectionBodyLength: 5000,
    redactionKeywords: [
      "authorization",
      "token",
      "api_key",
      "apikey",
      "secret",
      "password",
      "bearer",
      "access_token",
      "x-github-token",
      "openai-api-key",
    ],
    redactedEmailPattern: /[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g,
    redactedApiKeyPattern: /\b(sk-[A-Za-z0-9]{20,}|clp_[A-Za-z0-9]{20,})\b/g,
    redactedGithubPatPattern:
      /\b(gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
    maxErrorLength: 400,
  };
}

/**
 * Escape regex metacharacters so user-supplied keywords can be safely embedded
 * inside a `new RegExp(...)` without regex-injection surprises.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Defensive redaction for strings that will be persisted to `provenance.error`,
 * logger meta, or other observable surfaces.
 *
 * Applied in order:
 *   1. API keys (OpenAI / Anthropic-style: sk-... / clp_...)
 *   2. GitHub PATs (classic gh[pousr]_... + fine-grained github_pat_...)
 *   3. Emails
 *   4. key:value pairs for each `redactionKeywords` entry (case-insensitive,
 *      combined into a single alternation to minimise scans over large inputs)
 *
 * The key:value pattern consumes the entire remainder of the line (up to a
 * newline, comma, or semicolon) to ensure scheme-prefixed secrets such as
 * `Authorization: Bearer <jwt>` are redacted as a whole rather than leaving
 * the payload after the scheme token exposed.
 *
 * Each redaction pass is guarded by an `indexOf` fast-path trigger so large
 * inputs without any secret markers bail out at linear native-string speed
 * rather than paying the cost of four regex scans. Together with the
 * bounded-quantifier regexes this keeps the helper well under a 200ms
 * budget on a 5 MB pathological input (see policy.test.ts task 2.6).
 *
 * Pure, side-effect free, no dependency on ctx. Returns a new string; never
 * mutates input.
 */
export function applyPromptPackageRedaction(
  value: string,
  policy: PromptPackageLlmPolicy,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  let result = value;
  // API keys: fast-path on common scheme prefixes.
  if (result.includes("sk-") || result.includes("clp_")) {
    result = result.replace(policy.redactedApiKeyPattern, "[redacted-api-key]");
  }
  // GitHub tokens: fast-path on scheme prefixes.
  if (
    result.includes("ghp_") ||
    result.includes("gho_") ||
    result.includes("ghu_") ||
    result.includes("ghs_") ||
    result.includes("ghr_") ||
    result.includes("github_pat_")
  ) {
    result = result.replace(
      policy.redactedGithubPatPattern,
      "[redacted-github-token]",
    );
  }
  // Emails: require `@`.
  if (result.includes("@")) {
    result = result.replace(policy.redactedEmailPattern, "[redacted-email]");
  }
  // key:value: require at least one `:` or `=`.
  if (
    policy.redactionKeywords.length > 0 &&
    (result.includes(":") || result.includes("="))
  ) {
    const alternation = policy.redactionKeywords
      .map((keyword) => escapeRegex(keyword))
      .join("|");
    const pattern = new RegExp(
      `(${alternation})\\s*[:=]\\s*"?[^"\\r\\n,;]+"?`,
      "gi",
    );
    result = result.replace(pattern, "$1: [redacted]");
  }
  return result;
}
