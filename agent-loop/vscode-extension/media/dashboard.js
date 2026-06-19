(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  const OUTCOME_META = {
    done: { icon: 'OK', label: '完成', cls: 'ok' },
    failed: { icon: 'FAIL', label: '失败', cls: 'err' },
    crashed: { icon: 'ERR', label: '崩溃', cls: 'err' },
    quarantined: { icon: 'HOLD', label: '隔离', cls: 'warn' },
    running: { icon: 'RUN', label: '运行中', cls: 'run' },
    pending: { icon: 'WAIT', label: '待跑', cls: 'idle' },
    disabled: { icon: 'OFF', label: '已禁用', cls: 'idle' },
  };

  const HALT_GUIDANCE = {
    HALT_NO_SUCCESS_CRITERIA: '任务缺少非空的 ## 成功标准。补完成判定标准后再入队。',
    HALT_BUDGET: '达到最大修复轮次后仍未通过。可以提高 --max-iterations 重跑，或人工接手。',
    HALT_NO_PROGRESS: '修复后 gate 仍红，并且有效失败数没有下降。请打开 gate 日志人工核对。',
    HALT_NO_CHANGES: '修复 agent 运行了，但没有产生有效 diff。请检查任务描述或 agent 输出。',
    HALT_AGENT_NOT_FOUND: '本次运行需要的 agent 没有找到。',
    HALT_HUMAN: '需要人工接管：可能是审查 blocked、agent 失败或超时。',
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toolbar(queueRunning) {
    const run = queueRunning ? '' : '<button class="btn" data-act="runQueue">运行队列</button>';
    const stop = queueRunning ? '<button class="btn danger" data-act="stopRun">停止</button>' : '';
    return `<div class="toolbar">${run}${stop}<button class="btn ghost" data-act="refresh">刷新</button></div>`;
  }

  function renderOverview(payload) {
    const counts = payload.counts || { total: 0 };
    const settled = (counts.done || 0) + (counts.failed || 0) + (counts.crashed || 0) + (counts.quarantined || 0);
    const pct = counts.total ? Math.round((settled / counts.total) * 100) : 0;
    const chip = (key) => {
      const meta = OUTCOME_META[key];
      const n = counts[key] || 0;
      return `<span class="chip ${meta.cls}"><b>${n}</b> ${meta.label}</span>`;
    };

    const banner = payload.current
      ? `<div class="banner run">正在运行：<b>${esc(payload.current.taskLabel)}</b> / ${esc(payload.current.phaseLabel)} / ${esc(payload.current.elapsedText)}</div>`
      : '';

    const rows = (payload.tasks || []).map((task) => {
      const meta = OUTCOME_META[task.badge] || OUTCOME_META.pending;
      const sub = task.statusLabel ? `<span class="row-sub">${esc(task.statusLabel)}</span>` : '';
      return `<button class="task-row ${task.running ? 'active' : ''}" data-act="openTask" data-task="${esc(task.task)}">
        <span class="dot ${meta.cls}">${meta.icon}</span>
        <span class="row-main">${esc(task.taskLabel)}</span>
        ${sub}
      </button>`;
    }).join('') || '<div class="empty">队列为空，请检查 migration-queue.json。</div>';

    app.innerHTML = `
      <div class="head">
        <div><h1>AgentLoop 队列</h1><div class="muted">${counts.total || 0} 个任务 / ${settled}/${counts.total || 0} 已有结果</div></div>
        ${toolbar(payload.queueRunning)}
      </div>
      <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
      <div class="chips">${chip('done')}${chip('failed')}${chip('crashed')}${chip('quarantined')}${chip('running')}${chip('pending')}</div>
      ${banner}
      <div class="list">${rows}</div>
    `;
  }

  function resolveActiveIndex(status, steps) {
    const normalized = status || 'IDLE';
    if (normalized.startsWith('DONE_') || normalized.startsWith('HALT_')) {
      return steps.findIndex((s) => s.key === 'DONE');
    }
    if (normalized === 'BUDGET_LOOP_HEAD' || normalized === 'REVIEW_NEEDS_CHANGES') {
      return steps.findIndex((s) => s.key === 'GROK_FIX' || s.key === 'CODEX_FIX');
    }
    return steps.findIndex((s) => s.key === normalized);
  }

  function renderPipeline(status, steps) {
    const list = Array.isArray(steps) && steps.length ? steps : [];
    const done = (status || '').startsWith('DONE_') || (status || '').startsWith('HALT_');
    const activeIndex = resolveActiveIndex(status, list);
    return list.map((step, index) => {
      let cls = 'step';
      if (done && step.key === 'DONE') cls += ' active done';
      else if (activeIndex === index) cls += ' active';
      else if (activeIndex > index) cls += ' done';
      return `<span class="${cls}">${esc(step.label)}</span>`;
    }).join('<span class="arrow">→</span>');
  }

  function gateClass(ok) {
    if (ok === true) return 'ok';
    if (ok === false) return 'err';
    return 'warn';
  }

  function verdictClass(decision, verdict) {
    if (decision === 'pass' || verdict === 'pass') return 'ok';
    if (decision === 'needs_changes' || verdict === 'needs_changes') return 'warn';
    return 'err';
  }

  function landingClass(status) {
    if (status === 'COMMITTED' || status === 'MAIN_GATE_GREEN') return 'ok';
    if (status === 'APPLIED_TO_MAIN') return 'warn';
    return 'idle';
  }

  function renderLanding(p) {
    const landing = p.landing || { status: 'PENDING_APPLY' };
    const status = landing.status || 'PENDING_APPLY';
    const bits = [
      landing.appliedToMain ? '已应用到主仓' : '未应用到主仓',
      landing.mainGateGreen ? '主仓 gate 已绿' : '主仓 gate 未确认',
      landing.committed ? `已提交${landing.commit ? ` ${landing.commit}` : ''}` : '未提交',
    ];
    return `<div class="card wide">
      <h3>落地状态</h3>
      <div class="v ${landingClass(status)}">${esc(status)}</div>
      <div class="muted">${bits.map(esc).join(' / ')}</div>
    </div>`;
  }

  function renderGuard(p) {
    const policy = p.guardPolicy || p.finalReport?.guardPolicy || null;
    const globs = Array.isArray(policy?.protectedGlobs) ? policy.protectedGlobs : [];
    const text = policy
      ? [
        `protectTests=${policy.protectTests !== false}`,
        `protectTaskDocs=${Boolean(policy.protectTaskDocs)}`,
        globs.length ? `protectedGlobs=${globs.join(', ')}` : '',
      ].filter(Boolean).join(' / ')
      : '未配置额外护栏策略';
    return `<div class="card wide">
      <h3>护栏策略</h3>
      <div class="v">${policy ? '已加载' : '默认测试护栏'}</div>
      <div class="muted">${esc(text)}</div>
    </div>`;
  }

  function renderDetail(p) {
    const reviewLoops = (p.reviewRounds || []).filter((r) => r.decision === 'needs_changes').length;
    const loopChip = reviewLoops ? `<span class="chip warn">审查回修 ${reviewLoops} 次</span>` : '';

    const cards = `
      <div class="grid">
        <div class="card"><h3>阶段</h3><div class="v">${esc(p.phaseLabel || '-')}</div></div>
        <div class="card"><h3>状态码</h3><div class="v mono">${esc(p.status || '-')}</div></div>
        <div class="card"><h3>耗时</h3><div class="v">${esc(p.elapsedText || '-')}</div></div>
        <div class="card"><h3>Gate</h3><div class="v ${gateClass(p.gateOk)}">${esc(p.gateText || '-')}</div></div>
        <div class="card"><h3>Agent</h3><div class="v">${esc(p.agentText || '-')}${p.agentLogKb ? ` / ${p.agentLogKb}KB` : ''}</div></div>
        ${renderLanding(p)}
        ${renderGuard(p)}
      </div>`;

    const halt = p.halt
      ? `<div class="halt">
          <div class="halt-title">${esc(p.halt.status)}${p.halt.reason ? ` / ${esc(p.halt.reason)}` : ''}</div>
          <div class="halt-body">${esc(HALT_GUIDANCE[p.halt.status] || '运行已停止，请打开 state.json / 报告查看原因。')}</div>
        </div>`
      : '';

    const iters = (p.iterations || []).map((it) => {
      const g = it.gateOk === true ? '<span class="tag ok">Gate 绿</span>'
        : it.gateOk === false ? `<span class="tag err">Gate 红${it.failureCount != null ? ` (${it.failureCount})` : ''}</span>`
        : '<span class="tag warn">Gate 未跑</span>';
      const kb = it.diffBytes ? `${Math.max(1, Math.round(it.diffBytes / 1024))}KB` : '0';
      const guard = it.guard ? '<span class="tag err">护栏命中</span>' : '';
      return `<div class="line"><span class="idx">#${it.iteration}</span>${g}<span class="tag">diff ${kb}</span><span class="tag">尝试 ${it.attempts}</span>${guard}</div>`;
    }).join('') || '<div class="empty">没有修复迭代。</div>';

    const reviews = (p.reviewRounds || []).map((r) => {
      const findings = (r.findings || []).map((f) =>
        `<li><span class="sev ${esc(f.severity || '')}">${esc(f.severity || '?')}</span> <code>${esc(f.path || '-')}</code> ${esc(f.message || '')}</li>`,
      ).join('');
      const meta = [
        r.riskLevel ? `风险 ${r.riskLevel}` : '',
        r.applyRecommendation ? `建议 ${r.applyRecommendation}` : '',
        Array.isArray(r.verifiedBoundaries) && r.verifiedBoundaries.length ? `已验 ${r.verifiedBoundaries.join(', ')}` : '',
      ].filter(Boolean).join(' / ');
      return `<div class="review">
        <div class="review-head"><span class="tag ${verdictClass(r.decision, r.verdict)}">${esc(r.verdict || r.decision || '?')}</span><span class="muted">第 ${esc(r.round)} 轮</span></div>
        ${r.summary ? `<div class="review-sum">${esc(r.summary)}</div>` : ''}
        ${meta ? `<div class="muted">${esc(meta)}</div>` : ''}
        ${findings ? `<ul class="findings">${findings}</ul>` : ''}
      </div>`;
    }).join('') || '<div class="empty">没有审查轮次。</div>';

    const links = `<div class="links">
      ${p.reportPath ? `<button class="btn ghost" data-act="openReport" data-path="${esc(p.reportPath)}">最终报告</button>` : ''}
      ${p.reportJsonPath ? `<button class="btn ghost" data-act="openReport" data-path="${esc(p.reportJsonPath)}">结构化报告</button>` : ''}
      ${p.landingPath ? `<button class="btn ghost" data-act="openReport" data-path="${esc(p.landingPath)}">落地状态</button>` : ''}
      ${p.statePath ? `<button class="btn ghost" data-act="openState" data-path="${esc(p.statePath)}">state.json</button>` : ''}
    </div>`;

    app.innerHTML = `
      <div class="head">
        <div>
          <button class="back" data-act="showOverview">← 队列</button>
          <h1>${esc(p.taskLabel || '-')}</h1>
          <div class="muted">${esc(p.runId || '等待运行')} / 模式 ${esc(p.runMode || '-')} / ${esc(p.roleText || '')} ${loopChip}</div>
        </div>
        ${toolbar(false)}
      </div>
      <div class="pipeline">${renderPipeline(p.status, p.pipelineSteps)}</div>
      ${cards}
      ${halt}
      <h2>修复迭代</h2><div class="block">${iters}</div>
      <h2>审查轮次</h2><div class="block">${reviews}</div>
      <h2>Agent 最新输出</h2><pre class="log">${esc(p.agentTail || '暂无输出')}</pre>
      ${links}
    `;
  }

  app.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.getAttribute('data-act');
    if (act === 'openTask') {
      vscode.postMessage({ type: 'openTask', taskPath: target.getAttribute('data-task') });
    } else if (act === 'openReport') {
      vscode.postMessage({ type: 'openReport', reportPath: target.getAttribute('data-path') });
    } else if (act === 'openState') {
      vscode.postMessage({ type: 'openState', statePath: target.getAttribute('data-path') });
    } else {
      vscode.postMessage({ type: act });
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.type === 'overview') {
      renderOverview(message.payload);
    } else if (message?.type === 'detail') {
      renderDetail(message.payload);
    }
  });

  app.innerHTML = '<div class="empty">加载中...</div>';
  vscode.postMessage({ type: 'ready' });
})();
