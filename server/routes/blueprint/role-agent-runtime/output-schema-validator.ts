/**
 * `autopilot-role-autonomous-agent` spec Task 10.1：Agent 输出 schema 校验器。
 *
 * 在 Delegator 接受 Agent 产物前，用 `DelegateInput.outputSchema` 做一层
 * 最小 JSON Schema 校验。校验失败会触发 Delegator 的三级降级链。
 *
 * 设计约束：
 * - **零依赖**：不引入 ajv 或任何 JSON Schema 库，手工实现最小子集。
 * - **最小子集**：只覆盖 `type + required + properties`（递归），其余结构
 *   统一视为通过（保守策略）。
 * - **不实现**：`$ref` / `anyOf` / `oneOf` / `allOf` / `const` / `enum` /
 *   `pattern` / `format` / `minItems` / `uniqueItems` 等高级特性。
 * - **纯函数**：无副作用，不写日志，不 emit 事件。
 *
 * 支持的 type 关键字：`object` / `array` / `string` / `number` / `boolean`。
 * 遇到未识别的 type 或缺失 type 时，一律视为通过，避免把 runtime 误伤成失败。
 *
 * 与 Delegator 的集成约定：
 * - schema 未提供（`undefined`）→ 视为通过，直接返回 `{valid: true, errors: []}`。
 * - output 为 `null` 或 `undefined` → 无条件失败。
 * - 其余情况按 schema 递归校验；把所有错误聚合到 `errors` 数组里一次性返回，
 *   便于 Delegator 日志追踪。
 */

/**
 * 校验结果：`valid=true` 表示通过，`errors` 始终为空数组；否则 `errors`
 * 至少包含一条人类可读的错误说明。
 */
export interface OutputSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 对 Agent 输出执行 schema 校验。
 *
 * @param output Agent 产物（可能是任意 JSON 值）。
 * @param schema `DelegateInput.outputSchema`，可选。
 */
export function validateAgentOutput(
  output: unknown,
  schema: Record<string, unknown> | undefined,
): OutputSchemaValidationResult {
  if (schema === undefined) {
    return { valid: true, errors: [] };
  }
  if (output === null || output === undefined) {
    return { valid: false, errors: ["output_is_null_or_undefined"] };
  }
  const errors: string[] = [];
  validateValue(output, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}

// ─── internal helpers ──────────────────────────────────────────────────────

/**
 * 递归校验单个 value 是否符合 schema，错误直接 push 到 `errors` 中。
 *
 * 未识别的 type 或非对象 schema 一律视为通过，保证最小实现对未来扩展安全。
 */
function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const type = schema.type;

  switch (type) {
    case "object":
      validateObject(value, schema, path, errors);
      break;
    case "array":
      if (!Array.isArray(value)) {
        errors.push(
          `${path}: expected array, got ${describeType(value)}`,
        );
      }
      break;
    case "string":
      if (typeof value !== "string") {
        errors.push(
          `${path}: expected string, got ${describeType(value)}`,
        );
      }
      break;
    case "number":
      if (typeof value !== "number") {
        errors.push(
          `${path}: expected number, got ${describeType(value)}`,
        );
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        errors.push(
          `${path}: expected boolean, got ${describeType(value)}`,
        );
      }
      break;
    default:
      // 未识别的 type / 缺失 type：保守通过，不推入错误。
      break;
  }
}

/**
 * 校验 object 类型：结构、required keys、递归 properties。
 */
function validateObject(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(
      `${path}: expected object, got ${describeType(value)}`,
    );
    return;
  }
  const obj = value as Record<string, unknown>;

  // required keys 校验
  const required = schema.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key !== "string") continue;
      if (!(key in obj) || obj[key] === undefined) {
        errors.push(`${path}.${key}: missing required key`);
      }
    }
  }

  // properties 递归校验（只递归声明过的属性）
  const properties = schema.properties;
  if (
    properties !== undefined &&
    properties !== null &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    const propsRecord = properties as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(propsRecord)) {
      if (!(key in obj)) continue;
      if (obj[key] === undefined) continue;
      if (
        propSchema === null ||
        typeof propSchema !== "object" ||
        Array.isArray(propSchema)
      ) {
        continue;
      }
      validateValue(
        obj[key],
        propSchema as Record<string, unknown>,
        `${path}.${key}`,
        errors,
      );
    }
  }
}

/**
 * 为错误信息生成稳定的 type 描述。
 *
 * 与 `typeof` 的差异：
 * - `null` → `"null"`（`typeof null === "object"`）
 * - 数组 → `"array"`
 * - 其余对象 → `"object"`
 */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
