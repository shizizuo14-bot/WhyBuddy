/**
 * Policy + redaction helpers for the SPEC Tree LLM generation service.
 *
 * Owns:
 * - `SpecTreeLlmPolicy` interface (resource / schema / redaction limits).
 * - `createDefaultSpecTreeLlmPolicy()` factory honoring
 *   `BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS` env override
 *   (only accepted when parsed as a positive integer `<= 30_000`;
 *   illegal / non-finite / non-positive / zero / empty / > 30_000
 *   values fall back to the 30_000 default).
 * - `applySpecTreeRedaction(value, policy)` pure redaction helper.
 *
 * No runtime / business imports — this file is intentionally a pure data
 * module + pure functions so it can be imported from service.ts, tests, and
 * future shared-redaction abstractions without introducing cycles. Only
 * `process.env` is consulted, and only at factory invocation time.
 *
 * See design §4.3 / §2.D4 / §2.D9, requirements 2.7 / 4.5 / 5.1.
 */

export interface SpecTreeLlmPolicy {
  /** Single LLM-call + validation wall-clock upper bound (ms); never exceeds 30_000. */
  maxInvocationTimeoutMs: number;
  /** Temperature forwarded to ctx.llm.callJson (deterministic bias). */
  temperature: number;
  /** Retry attempts forwarded to ctx.llm.callJson. */
  callJsonRetryAttempts: number;
  /** Node count upper bound for schema validation. */
  maxNodeCount: number;
  /** Node count lower bound for schema validation. */
  minNodeCount: number;
  /** Tree depth upper bound (root = layer 1). */
  maxDepth: number;
  /** Single node title max character length. */
  maxTitleLength: number;
  /** Single node summary max character length. */
  maxSummaryLength: number;
  /** Case-insensitive keyword list for key:value redaction. */
  redactionKeywords: readonly string[];
  /** Email regex (global) for defensive redaction. */
  redactedEmailPattern: RegExp;
  /** OpenAI / Anthropic-style API key regex. */
  redactedApiKeyPattern: RegExp;
  /** GitHub PAT (classic + fine-grained) regex. */
  redactedGithubPatPattern: RegExp;
  /** Error message truncation upper bound (characters). */
  maxErrorLength: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 30_000;
const TIMEOUT_ENV_VAR = "BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS";

function resolveTimeoutOverride(): number {
  const raw = process.env[TIMEOUT_ENV_VAR];
  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  // Must be a finite positive integer and <= 30_000.
  // `Number.isFinite` excludes NaN / Infinity / -Infinity.
  // `parsed <= 0` covers zero and negative values.
  // `parsed > MAX_TIMEOUT_MS` enforces the 30s ceiling per design §2.D4.
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_TIMEOUT_MS
  ) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

export function createDefaultSpecTreeLlmPolicy(): SpecTreeLlmPolicy {
  return {
    maxInvocationTimeoutMs: resolveTimeoutOverride(),
    temperature: 0.2,
    callJsonRetryAttempts: 1,
    maxNodeCount: 50,
    minNodeCount: 3,
    maxDepth: 4,
    maxTitleLength: 120,
    maxSummaryLength: 400,
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
    redactedEmailPattern: /[\w.+-]+@[\w.-]+/g,
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, (match) => "\\" + match);
}

/**
 * Defensive redaction for strings that will be persisted to
 * `provenance.error`, logger meta, or any other externally-visible field.
 *
 * Applied in order:
 *   1. API keys (OpenAI `sk-...` / Anthropic `clp_...`)
 *   2. GitHub PATs (classic `gh[pousr]_...` / fine-grained `github_pat_...`)
 *   3. Emails
 *   4. Key-value pairs for each `redactionKeywords` entry (case-insensitive),
 *      covering patterns like `Authorization: Bearer <jwt>`, `token=<value>`,
 *      `api_key=<value>`, `x-github-token: <value>`, `openai-api-key: <value>`
 *
 * The key:value pattern consumes the value portion up to the next newline,
 * comma, or semicolon boundary to ensure scheme-prefixed secrets such as
 * `Authorization: Bearer <jwt>` are redacted as a whole.
 *
 * Pure, side-effect free, no dependency on ctx. Returns a new string; never
 * mutates input. Non-string / empty inputs are returned as-is for defensive
 * ergonomics.
 *
 * ReDoS safety: all patterns are linear-time (no nested quantifiers, no
 * overlapping alternations). A 5MB string must complete in < 200ms.
 */
export function applySpecTreeRedaction(
  value: string,
  policy: SpecTreeLlmPolicy,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  let result = value;
  result = result.replace(policy.redactedApiKeyPattern, "[redacted-api-key]");
  result = result.replace(
    policy.redactedGithubPatPattern,
    "[redacted-github-token]",
  );
  result = result.replace(policy.redactedEmailPattern, "[redacted-email]");
  for (const keyword of policy.redactionKeywords) {
    // Match "keyword" (case-insensitive), optional surrounding whitespace,
    // followed by ':' or '=', then a quoted-or-bare value that extends up to
    // the next newline / comma / semicolon boundary. This is deliberately
    // looser than a single non-whitespace token so scheme-prefixed secrets
    // (e.g. `Authorization: Bearer <jwt>`) are redacted as a whole.
    const pattern = new RegExp(
      `(${escapeRegex(keyword)})\\s*[:=]\\s*"?[^"\\r\\n,;]+"?`,
      "gi",
    );
    result = result.replace(pattern, "$1: [redacted]");
  }
  return result;
}
