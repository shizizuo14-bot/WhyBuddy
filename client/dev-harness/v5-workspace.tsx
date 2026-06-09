/**
 * V5 Workspace Harness (dev only)
 *
 * 演示 “聊天操纵杆 + 内联临时黑板 + 按需 pin + 失效/重入” 的核心形态。
 * 使用 fixture 模拟多 Agent 讨论 → 报告 → 用户质疑特定节点 → 失效级联 → 重新调度能力。
 *
 * 必须验证的路径（见 V5 文档 §6）：
 * - gate 失败打回（未过 commit 闸的 artifact 不进状态）
 * - 失效级联 + 重新调度（UserIntervention 或上游变更触发 invalidate → recompute）
 *
 * 真实实现会接后端的 orchestrateReasoningTurn + V5SessionState。
 * 当前是 fixture 驱动的交互原型，用于验证产品形态。
 *
 * 参考：
 * - docs/WhyBuddyV5CapabilityPool.md
 * - docs/WhyBuddyV5闭环总图_完整版.md
 */

import React, { useState } from 'react';

// 简化 fixture
const initialState = {
  goal: "做一个权限管理系统",
  turns: [] as any[],
  artifacts: [] as any[],
};

export default function V5WorkspaceHarness() {
  const [state, setState] = useState(initialState);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;

    // 模拟：用户输入 → 触发新一轮 (模拟 orchestrator 选能力)
    const newTurn = {
      id: `turn-${Date.now()}`,
      userText: input,
      selectedCapabilities: ["intent.clarify", "risk.analyze", "route.compare"],
      reason: "用户提供了新约束，需澄清 + 风险 + 路线对比",
      artifacts: [
        { id: `art-${Date.now()}`, kind: "clarification", trustLevel: "gated_pass", text: "权限边界需明确" },
      ],
    };

    setState((s) => ({
      ...s,
      turns: [...s.turns, newTurn],
      artifacts: [...s.artifacts, ...newTurn.artifacts],
    }));
    setInput("");
  };

  const challenge = (artifactId: string) => {
    // 模拟针对节点/artifact 的质疑 → 触发失效 + 重新调度
    alert(`已记录 UserIntervention (challenge on ${artifactId})，将触发 invalidate + 重新 pick capabilities。\n\n（原型：实际会调用 orchestrateReasoningTurn 并走失效主循环）`);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>V5 Workspace Harness（聊天 + 动态 artifact + 失效重入原型）</h1>
      <p style={{ color: '#666' }}>
        顶部状态条（唯一常驻） | 聊天流 + 内联临时黑板（可 pin） | 按 V5 文档验证 gate / 失效路径
      </p>

      <div style={{ border: '1px solid #ddd', padding: 10, marginBottom: 20 }}>
        <strong>当前目标：</strong> {state.goal}
        <div>已调用能力轮次：{state.turns.length}</div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* 聊天操纵杆 */}
        <div style={{ flex: 1, border: '1px solid #ccc', padding: 10 }}>
          <h3>聊天框（操纵杆）</h3>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入质疑 / 补充 / 挑战，例如：这段 RBAC 结论不对，让安全 Agent 再反驳"
            style={{ width: '100%', height: 80 }}
          />
          <button onClick={send}>发送（触发新一轮调度）</button>

          <div style={{ marginTop: 20 }}>
            {state.turns.map((t, i) => (
              <div key={i} style={{ marginBottom: 12, background: '#f8f8f8', padding: 8 }}>
                <div><strong>用户：</strong>{t.userText}</div>
                <div><strong>选中的能力：</strong>{t.selectedCapabilities.join(', ')}</div>
                <div><strong>原因：</strong>{t.reason}</div>
                {t.artifacts.map((a: any, j: number) => (
                  <div key={j} style={{ marginTop: 4, fontSize: 12 }}>
                    • {a.kind} (trust: {a.trustLevel}) <button onClick={() => challenge(a.id)}>挑战此 artifact</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 临时黑板区（模拟内联） */}
        <div style={{ flex: 1, border: '1px solid #ccc', padding: 10 }}>
          <h3>内联临时黑板（可滚走 · 可 pin）</h3>
          <p style={{ fontSize: 12, color: '#888' }}>V5：没有常驻活报告面板。artifact 出现在产生它的那一轮，随流滚走，但状态里一直可找回。</p>
          {state.artifacts.length === 0 && <div>暂无 artifact，发送消息后会出现。</div>}
          {state.artifacts.map((a, i) => (
            <div key={i} style={{ border: '1px dashed #aaa', padding: 6, marginBottom: 6 }}>
              {a.kind}: {a.text || '(结构化内容)'}
              <br />
              <small>trustLevel: {a.trustLevel}</small>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 30, fontSize: 12, color: '#666' }}>
        提示：此 harness 仅验证形态。真实版需接后端 V5SessionState + orchestrateReasoningTurn（含 invalidate + commit gate）。
        参考 V5 文档的 §3.2 主循环和 §5 交互形态。
      </div>
    </div>
  );
}
