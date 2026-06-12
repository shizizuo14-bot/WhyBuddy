/**
 * B3 · browser-llm provider（替代 deprecated 原型）。
 *
 * 消费 B1 同源 prompt。
 * 按 preset 适配信封。
 * 通过 B6 dispatcher 租约执行。
 * 失败 throw 触发既有 PilotReal fallback。
 * 生产 baseline 显式（由调用方在 B4 切换时传）。
 *
 * key 零信任：仅在闭包 + fetch header，绝不泄露。
 */

import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";
import { buildCapabilityPrompt } from "@shared/blueprint/whybuddy-capability-prompts";
import type { ByokPoolDispatcher, ByokLease } from "./whybuddy-byok-dispatcher";
import { createByokDispatcher } from "./whybuddy-byok-dispatcher";
import type { ByokKeyEntry } from "./whybuddy-byok-config";

export interface LlmCapabilityProvider {
  // simplified for whybuddy: the executor will call with state etc.
  // for direct, we expose the execute for the capability.
  executeCapability(params: {
    capabilityId: string;
    state: V5SessionState;
    inputArtifactIds: string[];
    roleId?: string;
    turnId: string;
  }): Promise<{ title: string; summary: string; content: string; provenance?: string; usage?: any }>;
}

export function createBrowserLlmCapabilityProvider(dispatcher?: ByokPoolDispatcher): LlmCapabilityProvider {
  const pool = dispatcher || createByokDispatcher();

  async function doFetch(lease: ByokLease, systemPrompt: string, userPrompt: string, maxTokens: number, temperature: number) {
    const entry = lease.entry;
    const isAnthropic = entry.presetId === "anthropic";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      let res: Response;
      if (isAnthropic) {
        // Anthropic messages API
        const body = {
          model: entry.model,
          max_tokens: maxTokens,
          messages: [
            { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
          ],
          temperature,
        };
        res = await fetch(entry.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": entry.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            ...(entry.extraHeaders || {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } else {
        // OpenAI compatible
        const body = {
          model: entry.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        };
        res = await fetch(entry.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${entry.apiKey}`,
            ...(entry.extraHeaders || {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 429) throw new Error(`http_429 ${text.slice(0,100)}`);
        if (res.status === 401 || res.status === 403) throw new Error(`http_401 ${text.slice(0,100)}`);
        throw new Error(`http_${res.status} ${text.slice(0,100)}`);
      }

      const data = await res.json();

      // Parse to {title,summary,content} - simple heuristic or assume the model followed the prompt
      let content = "";
      let title = "";
      let summary = "";

      if (isAnthropic) {
        content = data.content?.[0]?.text || JSON.stringify(data);
        // try parse json from content if model returned wrapped
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const j = JSON.parse(jsonMatch[0]);
            title = j.title || "";
            summary = j.summary || "";
            content = j.content || content;
          } catch {}
        }
      } else {
        const choice = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || JSON.stringify(data);
        content = choice;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const j = JSON.parse(jsonMatch[0]);
            title = j.title || "";
            summary = j.summary || "";
            content = j.content || content;
          } catch {}
        }
      }

      // hijack simple check (mirror server)
      if (/```|<\s*script|ignore previous|system prompt/i.test(content)) {
        throw new Error("llm_content_hijack_detected");
      }

      const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        title: title || (content.split("\n")[0] || "Evidence").slice(0, 80),
        summary: summary || content.slice(0, 200),
        content,
        provenance: `browser-llm:${entry.label || entry.presetId}:${entry.model}`,
        usage: {
          inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
          outputTokens: usage.completion_tokens || usage.output_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          model: entry.model,
        },
      };
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === "AbortError") throw new Error("timeout");
      throw e;
    }
  }

  return {
    async executeCapability(params: {
      capabilityId: string;
      state: V5SessionState;
      inputArtifactIds: string[];
      roleId?: string;
      turnId: string;
    }) {
      const prompt = buildCapabilityPrompt({
        capabilityId: params.capabilityId,
        state: params.state,
        inputArtifactIds: params.inputArtifactIds,
        roleId: params.roleId,
        turnId: params.turnId,
      });

      let lease: ByokLease | null = null;
      try {
        lease = await pool.acquire();
        const result = await doFetch(lease, prompt.systemPrompt, prompt.userPrompt, prompt.maxTokens, prompt.temperature);
        pool.release(lease, "ok");
        // record tokens if possible (dispatcher snapshot)
        return {
          title: result.title,
          summary: result.summary,
          content: result.content,
          provenance: result.provenance,
          usage: result.usage,
        };
      } catch (e: any) {
        if (lease) {
          const msg = String(e?.message || e);
          const outcome: any = msg.includes("429") ? "http_429" : msg.includes("401") ? "http_401" : "error";
          pool.release(lease, outcome);
        }
        // rethrow to trigger fallback in executor
        throw e;
      }
    },
  };
}

export function useBrowserLlmCapabilityExecutor(dispatcher?: ByokPoolDispatcher) {
  const provider = createBrowserLlmCapabilityProvider(dispatcher);
  // The executor in runtime expects a certain shape; here we return a simple adapter
  // In practice wired in B4 by replacing the executor.
  return {
    provider,
  };
}
