/**
 * B1 · 提示词构造下沉 shared（单一真相）。
 *
 * server/routes/sliderule.ts 与未来 browser-llm provider 消费同一套 prompt 构造逻辑。
 * 避免执行器路径分裂。
 *
 * 本模块纯函数：
 * - 不读 env
 * - 不发网络请求
 * - 浏览器可直接 import
 *
 * 内部复用：
 * - K1: buildCapabilityContext + formatContextForPrompt + classify
 * - K2: getOutputContract + render...
 * - report 骨架: buildStructuredReport
 * - domain anchor: capabilityDomainAnchoringBlock (来自 narration-immunity，共享)
 */

import type { V5SessionState } from "./v5-reasoning-state.js";
import { buildStructuredReport } from "./sliderule-report-builder.js";
import {
  buildCapabilityContext,
  formatContextForPrompt,
  classifyCapabilityTier,
} from "./sliderule-capability-context.js";
import {
  getOutputContract,
  renderContractForPrompt,
  renderContractSchema,
} from "./sliderule-output-contracts.js";
import { capabilityDomainAnchoringBlock } from "./sliderule-narration-immunity.js";

export interface CapabilityPromptResult {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}

export function buildCapabilityPrompt(args: {
  capabilityId: string;
  state: V5SessionState;
  inputArtifactIds: string[];
  roleId?: string;
  turnId: string;
}): CapabilityPromptResult {
  const { capabilityId, state, inputArtifactIds, roleId, turnId } = args;

  const goalText = (state as any)?.goal?.text || (state as any)?.goal || "";
  const ctxEntries = buildCapabilityContext(state as any, capabilityId, inputArtifactIds);
  const contextBlock = formatContextForPrompt(ctxEntries);
  const tier = classifyCapabilityTier(capabilityId);

  const domainAnchor = capabilityDomainAnchoringBlock(goalText);

  const contract = getOutputContract(capabilityId);
  const contractBlock = contract ? renderContractForPrompt(contract) : "";
  const contractSchema = contract ? renderContractSchema(contract) : null;

  let systemPrompt =
    "You are an expert AI collaborator for SlideRule V5. " +
    domainAnchor +
    "Return ONLY a single JSON object (no prose, no ```json fences) with exactly these keys:\n" +
    '{"title": string, "summary": string, "content": string}\n' +
    "title: short and specific. summary: one-sentence high-signal. content: professional, actionable, evidence-based.";
  if (contractBlock) {
    systemPrompt += "\n\n" + contractBlock;
  }

  let userPrompt = "";
  if (capabilityId === "risk.analyze") {
    userPrompt =
      `${domainAnchor}` +
      `Capability: risk.analyze (tier=${tier})\nGoal: ${goalText}\n` +
      `Upstream context (full for analysis tier):\n${contextBlock}\n` +
      `Role: ${roleId || "unspecified"}  Turn: ${turnId}\n\n` +
      "Produce a focused risk analysis: key risks, likelihood/impact, mitigations. Use the provided upstream content verbatim where relevant.";
  } else if (capabilityId === "report.write") {
    const built = buildStructuredReport({ state, inputArtifactIds, roleId });
    const fullCtx = formatContextForPrompt(ctxEntries);
    userPrompt =
      `${domainAnchor}` +
      `Capability: report.write (tier=${tier})\nGoal: ${goalText}\n` +
      `Base structured evidence (authoritative 9-section skeleton from buildStructuredReport — preserve all sections, key facts, upstream refs, risks, gaps, and the exact structure verbatim in meaning):\n` +
      `BASE_TITLE: ${built.title}\nBASE_SUMMARY: ${built.summary}\nBASE_CONTENT:\n${built.content}\n\n` +
      `Full upstream context (for expansion, with visible truncation marks):\n${fullCtx}\n\n` +
      (contractBlock ? `Output contract to satisfy:\n${contractBlock}\nContract schema: ${JSON.stringify(contractSchema)}\n\n` : "") +
      `Role: ${roleId || "综合"}  Turn: ${turnId}\n\n` +
      "Expand each section to satisfy the output contract. Preserve all base facts, refs, risks, gaps verbatim in meaning; add depth, do not pad. Return the final evidence report as {title, summary, content}.";
  } else {
    // 兜底（其他未来能力或 deliberation 前置已处理）
    userPrompt =
      `${domainAnchor}` +
      `Capability: ${capabilityId} (tier=${tier})\nGoal: ${goalText}\n` +
      `Upstream context:\n${contextBlock}\n\n` +
      `Role: ${roleId || "agent"} Turn: ${turnId}\n\n` +
      "Produce the artifact.";
  }

  const maxTokens = capabilityId === "report.write" ? 12000 : (contract && ["document.draft", "requirement.write"].includes(capabilityId) ? 16000 : 8000);
  const temperature = 0.25;

  return { systemPrompt, userPrompt, maxTokens, temperature };
}
