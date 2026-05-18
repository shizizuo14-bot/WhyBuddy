/**
 * 流恢复处理器
 *
 * 纯 class 实现，不依赖 React。负责在流中断恢复后，
 * 检测补偿数据并合并到已有内容，避免重复展示。
 *
 * 核心行为：
 * - `handleResume(newTokens, existingContent)` 过滤掉已存在的重复 token，
 *   返回需要追加的增量 token 数组
 *
 * 去重策略：
 * - 基于内容尾部匹配：检查 newTokens 的前缀是否与 existingContent 的尾部重叠
 * - 若 newTokens 中的前 N 个 token 拼接后是 existingContent 尾部的子串，
 *   则跳过这些重复 token，仅返回增量部分
 *
 * 对应 spec：`.kiro/specs/autopilot-streaming-lifecycle-weave/`
 * - 需求 3.4：恢复后收到补偿数据时，合并到已有内容而非重复展示
 */

// ---------------------------------------------------------------------------
// 类实现
// ---------------------------------------------------------------------------

/**
 * 流恢复处理器。
 *
 * 设计为无状态工具类，每次调用 `handleResume` 独立判定。
 * 不持有内部缓冲或历史记录。
 */
export class StreamResumeHandler {
  /**
   * 用于尾部匹配的最大检查长度。
   *
   * 避免对超长 existingContent 做全量扫描。
   */
  private readonly maxTailCheckLength: number;

  constructor(maxTailCheckLength = 200) {
    this.maxTailCheckLength = maxTailCheckLength;
  }

  /**
   * 处理流恢复后的补偿数据。
   *
   * 将 newTokens 与 existingContent 的尾部进行重叠检测，
   * 过滤掉已存在的重复 token，返回需要追加的增量 token。
   *
   * @param newTokens - 恢复后收到的新 token 数组
   * @param existingContent - 中断前已累积的内容字符串
   * @returns 去重后需要追加的 token 数组
   */
  handleResume(newTokens: string[], existingContent: string): string[] {
    // 无新 token 或无已有内容，直接返回全部新 token
    if (newTokens.length === 0) {
      return [];
    }
    if (existingContent.length === 0) {
      return [...newTokens];
    }

    // 取 existingContent 尾部用于匹配
    const tail = existingContent.slice(-this.maxTailCheckLength);

    // 逐步拼接 newTokens，检查是否与尾部重叠
    let accumulated = "";
    let overlapEndIndex = 0;

    for (let i = 0; i < newTokens.length; i++) {
      accumulated += newTokens[i];

      // 检查累积的 token 是否是尾部的子串
      if (tail.endsWith(accumulated)) {
        // 当前累积完全匹配尾部末尾，标记为重复
        overlapEndIndex = i + 1;
      } else if (tail.includes(accumulated)) {
        // 累积内容存在于尾部中但不在末尾，继续检查
        // 这种情况可能是部分重叠，继续累积
        overlapEndIndex = i + 1;
      } else {
        // 累积内容不再匹配尾部，停止检查
        break;
      }
    }

    // 返回去重后的增量 token
    if (overlapEndIndex === 0) {
      return [...newTokens];
    }

    return newTokens.slice(overlapEndIndex);
  }
}
