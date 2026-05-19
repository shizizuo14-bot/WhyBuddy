/**
 * `autopilot-llm-spec-generation`：LLM Key Pool — 多 key 轮询并发池。
 *
 * 仅用于 `spec_docs` 阶段的规格文档生成，通过 5 个独立 API key 实现
 * 同层兄弟节点的并发 LLM 调用，把总耗时从 N×30s 降到 ceil(N/5)×30s。
 *
 * 其他阶段（澄清、路线生成、SPEC 树推导）继续使用主 LLM（gpt-5.5），
 * 不经过本池。
 *
 * 设计要点：
 * - 轮询（round-robin）分配 key，保证负载均匀；
 * - 每个 key 独立的 fetch 调用，互不阻塞；
 * - 单个 key 失败不影响其他 key 的并发任务；
 * - 池为空时（env 未配置）返回 undefined，调用方回退到主 LLM。
 */

/** 单个 pool entry。 */
export interface LlmKeyPoolEntry {
  /** API key。 */
  apiKey: string;
  /** 关联的用户名标识（仅用于日志/诊断，不参与调用）。 */
  label: string;
}

/** Pool 配置。 */
export interface LlmKeyPoolConfig {
  /** API base URL（所有 key 共享同一 endpoint）。 */
  baseUrl: string;
  /** 模型名称。 */
  model: string;
  /** key 列表。 */
  keys: ReadonlyArray<LlmKeyPoolEntry>;
  /** 单次调用超时（毫秒），默认 60000。 */
  timeoutMs?: number;
}

/** Pool 实例。 */
export interface LlmKeyPool {
  /** 池中 key 数量。 */
  readonly size: number;
  /** 获取下一个可用 key（round-robin）。 */
  next(): LlmKeyPoolEntry;
  /** 并发调用：把 N 个任务分配到池中 key，最多同时 poolSize 个并发。 */
  runConcurrent<T>(
    tasks: ReadonlyArray<() => Promise<T>>,
  ): Promise<T[]>;
  /** 池配置。 */
  readonly config: LlmKeyPoolConfig;
}

/**
 * 从环境变量解析 pool 配置。
 *
 * 格式：
 * - `BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS`：逗号分隔的 key 列表
 * - `BLUEPRINT_SPEC_DOCS_LLM_POOL_LABELS`：逗号分隔的标签列表（与 key 一一对应）
 * - `BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL`：API base URL
 * - `BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL`：模型名称
 * - `BLUEPRINT_SPEC_DOCS_LLM_POOL_TIMEOUT_MS`：单次超时
 *
 * 返回 undefined 表示未配置 pool（调用方应回退到主 LLM）。
 */
export function parseKeyPoolFromEnv(): LlmKeyPoolConfig | undefined {
  const keysRaw = process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS;
  if (!keysRaw || keysRaw.trim().length === 0) return undefined;

  const keys = keysRaw.split(",").map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) return undefined;

  const labelsRaw = process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_LABELS ?? "";
  const labels = labelsRaw.split(",").map(l => l.trim());

  const baseUrl = process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL ?? "https://api.rcouyi.com/v1";
  const model = process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL ?? "ouyi-5-preview-thinking";
  const timeoutMs = parseInt(process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_TIMEOUT_MS ?? "60000", 10);

  return {
    baseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
    keys: keys.map((apiKey, i) => ({
      apiKey,
      label: labels[i] ?? `key-${i}`,
    })),
  };
}

/**
 * 创建 LLM Key Pool 实例。
 *
 * 使用 round-robin 轮询分配 key；`runConcurrent` 按池大小控制并发度，
 * 保证同时最多 `poolSize` 个 LLM 调用在飞。
 */
export function createLlmKeyPool(config: LlmKeyPoolConfig): LlmKeyPool {
  let index = 0;

  function next(): LlmKeyPoolEntry {
    const entry = config.keys[index % config.keys.length];
    index++;
    return entry;
  }

  async function runConcurrent<T>(
    tasks: ReadonlyArray<() => Promise<T>>,
  ): Promise<T[]> {
    const concurrency = config.keys.length;
    const results: T[] = [];
    const executing: Set<Promise<void>> = new Set();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const p = (async () => {
        const result = await task();
        results[i] = result;
      })();
      executing.add(p);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      p.then(() => executing.delete(p));

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  return {
    get size() { return config.keys.length; },
    next,
    runConcurrent,
    config,
  };
}

/**
 * 使用 pool 中的指定 key 调用 LLM chat completion。
 *
 * 返回 LLM 的原始文本响应，由调用方做后续处理。
 * 失败时抛错，由调用方捕获并降级。
 */
export async function callLlmWithPoolKey(
  entry: LlmKeyPoolEntry,
  config: LlmKeyPoolConfig,
  systemMessage: string,
  userMessage: string,
): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;
  const timeoutMs = config.timeoutMs ?? 60000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${entry.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM pool HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM pool: empty response content");
    }
    // thinking 模型可能返回 <think>...</think> 前缀，需要剥离
    return stripThinkingTags(content);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 使用 pool key 生成单个文档类型（requirements / design / tasks）。
 *
 * 不要求 JSON 格式返回——直接接受 Markdown 文本。thinking 模型在不强制 JSON
 * 时能产出更高质量的中文规格文档。
 */
export async function callLlmForSpecDoc(
  entry: LlmKeyPoolEntry,
  config: LlmKeyPoolConfig,
  docType: "requirements" | "design" | "tasks",
  nodeTitle: string,
  nodeSummary: string,
  primaryRouteSummary: string,
  parentSummary?: string,
): Promise<string> {
  const docTypeLabel = docType === "requirements" ? "需求文档" : docType === "design" ? "设计文档" : "任务清单";
  const systemMessage = `你是一个专业的软件架构师和产品经理。请为以下模块生成${docTypeLabel}。

要求：
- 使用中文 Markdown 格式输出
- 内容具体、可执行、有深度
- 不要输出 JSON 格式
- 不要输出代码块包裹
- 直接输出 Markdown 文档内容`;

  const userMessage = `模块名称：${nodeTitle}
模块描述：${nodeSummary}
所属路线：${primaryRouteSummary}
${parentSummary ? `父模块上下文：${parentSummary}` : ""}

请生成该模块的${docTypeLabel}（Markdown 格式）。`;

  return callLlmWithPoolKey(entry, config, systemMessage, userMessage);
}

/**
 * 剥离 thinking 模型返回的 `<think>...</think>` 标签和 markdown code fence，
 * 只保留最终 JSON 内容。
 *
 * 支持的格式：
 * - `<think>思考过程</think>\n{"key": "value"}`
 * - `<think>思考过程</think>\n```json\n{"key": "value"}\n```
 * - ` ```json\n{"key": "value"}\n``` `（无 think 标签）
 * - 纯 JSON（无标签无 fence）
 */
function stripThinkingTags(content: string): string {
  let result = content;
  // 1. 移除 <think>...</think> 块（贪婪匹配，支持多行）
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // 2. 移除 markdown code fence（```json ... ``` 或 ``` ... ```）
  const fenceMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    result = fenceMatch[1].trim();
  }
  // 如果剥离后为空，返回原始内容（让 parser 报 schema 错误）
  return result.length > 0 ? result : content;
}
