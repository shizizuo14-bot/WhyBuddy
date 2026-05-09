/**
 * Summary derivation helpers for the Role System Architecture capability bridge.
 *
 * Owns:
 * - `deriveRoleOutputSummary(data, options)` — locale-aware human-readable summary.
 * - `buildStructuredRolesSummary(data, policy)` — short summary for evidence provenance.
 * - `sha256Hex(text)` — deterministic SHA-256 hex digest.
 *
 * No runtime / business imports — only `node:crypto` is allowed.
 * Pure functions only.
 *
 * See design §4.8, requirements 3.5 / 4.3 / 4.5 / 4.7.
 */

import { createHash } from "node:crypto";
import type { RoleArchitectureResponse } from "./schema.js";
import type { RoleSystemArchitectureCapabilityPolicy } from "./policy.js";

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Derive a locale-aware human-readable output summary from validated role data.
 *
 * - en-US: "Composed N role(s); covering K stage(s)."
 *   (singular when N=1 or K=1)
 * - zh-CN: "规划 N 个角色；覆盖 K 个阶段。"
 *   (Chinese does not distinguish singular/plural)
 *
 * K = number of unique activation stages across all roles.
 */
export function deriveRoleOutputSummary(
  data: RoleArchitectureResponse,
  options: { locale: "zh-CN" | "en-US" },
): string {
  const roleCount = data.roles.length;
  const uniqueStages = new Set(data.roles.flatMap((r) => r.activationStages));
  const stageCount = uniqueStages.size;

  if (options.locale === "zh-CN") {
    return `规划 ${roleCount} 个角色；覆盖 ${stageCount} 个阶段。`;
  }

  // en-US with singular/plural
  const roleWord = roleCount === 1 ? "role" : "roles";
  const stageWord = stageCount === 1 ? "stage" : "stages";
  return `Composed ${roleCount} ${roleWord}; covering ${stageCount} ${stageWord}.`;
}

/**
 * Build a short human-readable summary for `evidence.provenance.structuredRoles.summary`.
 *
 * Format: `"roles=N [id1, id2, id3]"` — when more than 3 roles, appends `", +M more"`.
 * Truncated to `policy.maxStructuredPayloadSummaryBytes` bytes (UTF-8), ending with `"..."`
 * if truncation occurs.
 */
export function buildStructuredRolesSummary(
  data: RoleArchitectureResponse,
  policy: RoleSystemArchitectureCapabilityPolicy,
): string {
  const ids = data.roles.map((r) => r.id);
  const count = ids.length;

  let inner: string;
  if (count <= 3) {
    inner = ids.join(", ");
  } else {
    inner = ids.slice(0, 3).join(", ") + `, +${count - 3} more`;
  }

  const full = `roles=${count} [${inner}]`;

  // Truncate to maxStructuredPayloadSummaryBytes
  const maxBytes = policy.maxStructuredPayloadSummaryBytes;
  if (Buffer.byteLength(full, "utf8") <= maxBytes) {
    return full;
  }

  // Binary search for the longest prefix that fits within maxBytes - 3 (for "...")
  const ellipsis = "...";
  const ellipsisBytes = Buffer.byteLength(ellipsis, "utf8");
  const targetBytes = maxBytes - ellipsisBytes;

  let result = "";
  for (let i = 0; i < full.length; i++) {
    const candidate = full.slice(0, i + 1);
    if (Buffer.byteLength(candidate, "utf8") > targetBytes) {
      break;
    }
    result = candidate;
  }

  return result + ellipsis;
}

/**
 * Compute SHA-256 hex digest of a UTF-8 string.
 *
 * Returns a 64-character lowercase hex string.
 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
