/**
 * SPEC Documents LLM Policy — 纯函数模块。
 *
 * 定义安全 / schema 上界 / 脱敏策略，以及默认工厂与脱敏纯函数。
 * 本文件禁止 import 任何运行时 / 业务模块（保持纯函数）。
 *
 * 对应 design §4.3 + requirements 2.7, 4.5, 5.1。
 */

// ─── Interface ───────────────────────────────────────────────────────────────

export interface SpecDocumentsLlmPolicy {
  /** 单次 LLM 调用 + 校验的总墙钟上限；不超过 30_000 */
  maxInvocationTimeoutMs: number;
  /** 温度（保持确定性偏向） */
  temperature: number;
  /** retry attempts 传给 callJson */
  callJsonRetryAttempts: number;
  /** sections 数组下界 */
  minSectionCount: number;
  /** sections 数组上界 */
  maxSectionCount: number;
  /** 单 section.body 最大长度 */
  maxSectionBodyLength: number;
  /** title 最大长度 */
  maxTitleLength: number;
  /** summary 最大长度 */
  maxSummaryLength: number;
  /** section.id 最大长度 */
  maxSectionIdLength: number;
  /** section.title 最大长度 */
  maxSectionTitleLength: number;
  /** section.summary 最大长度 */
  maxSectionSummaryLength: number;
  /** 脱敏：key 级敏感关键词（大小写不敏感） */
  redactionKeywords: readonly string[];
  /** 脱敏：email 正则 */
  redactedEmailPattern: RegExp;
  /** 脱敏：通用长字串 API key 正则 */
  redactedApiKeyPattern: RegExp;
  /** 脱敏：GitHub PAT 正则 */
  redactedGithubPatPattern: RegExp;
  /** error message 截断上界 */
  maxErrorLength: number;
}

// ─── Default Factory ─────────────────────────────────────────────────────────

/**
 * 创建默认 policy。
 *
 * `maxInvocationTimeoutMs` 默认 30_000；可通过环境变量
 * `BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS` 覆盖，仅当解析为正整数且 <= 30_000 时采用，
 * 否则回退到 30_000。
 */
export function createDefaultSpecDocumentsLlmPolicy(): SpecDocumentsLlmPolicy {
  const timeoutOverride = Number.parseInt(
    process.env.BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS ?? "",
    10
  );
  return {
    maxInvocationTimeoutMs:
      Number.isFinite(timeoutOverride) &&
      timeoutOverride > 0 &&
      timeoutOverride <= 30_000
        ? timeoutOverride
        : 30_000,
    temperature: 0.2,
    callJsonRetryAttempts: 1,
    minSectionCount: 2,
    maxSectionCount: 20,
    maxSectionBodyLength: 8_000,
    maxTitleLength: 200,
    maxSummaryLength: 500,
    maxSectionIdLength: 64,
    maxSectionTitleLength: 200,
    maxSectionSummaryLength: 500,
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
    redactedEmailPattern: /[\w.+-]{1,64}@[\w.-]{1,253}\.[a-zA-Z]{2,24}/g,
    redactedApiKeyPattern: /\b(sk-[A-Za-z0-9]{20,256}|clp_[A-Za-z0-9]{20,256})\b/g,
    redactedGithubPatPattern:
      /\b(gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
    maxErrorLength: 400,
  };
}

// ─── Redaction ───────────────────────────────────────────────────────────────

/**
 * 对字符串进行脱敏处理，覆盖：
 * - API key（sk-... / clp_...）
 * - GitHub PAT（gh[pousr]_... / github_pat_...）
 * - Email 地址
 * - Authorization / Bearer / token= / api_key= / x-github-token / openai-api-key 等 key-value 对
 *
 * 纯函数，无副作用。
 *
 * 为避免灾难性回溯（ReDoS），此函数在进入正则扫描前先做快速短路检查：
 * 如果输入不含任何 "@" / "sk-" / "clp_" / "gh" / ":" / "=" 这些必然出现在任何
 * 敏感标识里的 marker 字符，则直接原样返回。这把 5MB 以上无敏感内容输入
 * 的耗时压到 < 50ms，同时不改变对真正含敏感串输入的脱敏语义。
 */
export function applySpecDocumentsRedaction(
  value: string,
  policy: SpecDocumentsLlmPolicy
): string {
  // Fast short-circuit: skip regex scanning when the input has no marker chars.
  // Every genuine secret must contain at least one of: @ sk- clp_ gh : =
  if (
    !value.includes("@") &&
    !value.includes("sk-") &&
    !value.includes("clp_") &&
    !value.includes("gh") &&
    !value.includes(":") &&
    !value.includes("=")
  ) {
    return value;
  }

  let result = value;

  // 1. API key patterns (sk-..., clp_...)
  result = result.replace(
    new RegExp(policy.redactedApiKeyPattern.source, "g"),
    "[REDACTED_API_KEY]"
  );

  // 2. GitHub PAT patterns (gh[pousr]_..., github_pat_...)
  result = result.replace(
    new RegExp(policy.redactedGithubPatPattern.source, "g"),
    "[REDACTED_GITHUB_PAT]"
  );

  // 3. Email addresses
  result = result.replace(
    new RegExp(policy.redactedEmailPattern.source, "g"),
    "[REDACTED_EMAIL]"
  );

  // 4. Key-value pairs: Authorization / Bearer / token= / api_key= / x-github-token / openai-api-key
  //    Matches patterns like: `key: value`, `key=value`, `key "value"`, `key 'value'`
  const keywordsPattern = policy.redactionKeywords
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const kvPattern = new RegExp(
    `((?:${keywordsPattern}))[\\s]*[:=][\\s]*["']?([^"'\\s,;}{\\]\\[]+)["']?`,
    "gi"
  );
  result = result.replace(kvPattern, "$1=[REDACTED]");

  return result;
}
