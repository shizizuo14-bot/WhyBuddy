(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  let lastOverview = null;
  let lastDetail = null;
  let view = 'overview';

  const OUTCOME_META = {
    done: { icon: '✓', label: '完成', cls: 'ok' },
    failed: { icon: '✗', label: '失败', cls: 'err' },
    crashed: { icon: '⚠', label: '崩溃', cls: 'err' },
    quarantined: { icon: '⏸', label: '隔离', cls: 'warn' },
    running: { icon: '◌', label: '运行中', cls: 'run' },
    pending: { icon: '○', label: '待跑', cls: 'idle' },
    disabled: { icon: '–', label: '已禁用', cls: 'idle' },
  };

  const HALT_GUIDANCE = {
    HALT_NO_SUCCESS_CRITERIA: '任务缺少非空「## 成功标准」。补上完成判定标准（由 spec 派生）后再入队。',
    HALT_BUDGET: '达到最大修复轮次仍未通过。提高 --max-iterations 重跑，或人工接手。',
    HALT_NO_PROGRESS: '修复后 gate 仍红，且有效失败数没有下降。打开失败 gate 日志人工核对。',
    HALT_NO_CHANGES: '修复工人运行了但没有产生有效 diff。检查任务描述或 agent 状态。',
    HALT_AGENT_NOT_FOUND: '本次运行所需的 agent（grok / codex）没找到。',
    HALT_HUMAN: '需要人工接管：可能是审查判定 blocked、agent 失败或超时。',
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toolbar(queueRunning) {
    const run = queueRunning ? '' : '<button class="btn" data-act="runQueue">▶ 运行队列</button>';
    const stop = queueRunning ? '<button class="btn danger" data-act="stopRun">■ 停止</button>' : '';
    return `<div class="toolbar">${run}${stop}<button class="btn ghost" data-act="refresh">↻ 刷新</button></div>`;
  }

  function renderOverview(payload) {
    const counts = payload.counts || { total: 0 };
    const settled = counts.done + counts.failed + counts.crashed + counts.quarantined;
    const pct = counts.total ? Math.round((settled / counts.total) * 100) : 0;
    const chip = (key) => {
      const meta = OUTCOME_META[key];
      const n = counts[key] || 0;
      return `<span class="chip ${meta.cls}"><b>${n}</b> ${meta.label}</span>`;
    };

    const banner = payload.current
      ? `<div class="banner run">正在运行：<b>${esc(payload.current.taskLabel)}</b> · ${esc(payload.current.phaseLabel)} · ${esc(payload.current.elapsedText)}</div>`
      : '';

    const rows = (payload.tasks || []).map((task) => {
      const meta = OUTCOME_META[task.badge] || OUTCOME_META.pending;
      const sub = task.statusLabel ? `<span class="row-sub">${esc(task.statusLabel)}</span>` : '';
      return `<button class="task-row ${task.running ? 'active' : ''}" data-act="openTask" data-task="${esc(task.task)}">
        <span class="dot ${meta.cls}">${meta.icon}</span>
        <span class="row-main">${esc(task.taskLabel)}</span>
        ${sub}
      </button>`;
    }).join('') || '<div class="empty">队列为空，检查 migration-queue.json。</div>';

    app.innerHTML = `
      <div class="head">
        <div><h1>AgentLoop 队列</h1><div class="muted">${counts.total} 个任务 · ${settled}/${counts.total} 已结束</div></div>
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

  function renderDetail(p) {
    const reviewLoops = (p.reviewRounds || []).filter((r) => r.decision === 'needs_changes').length;
    const loopChip = reviewLoops ? `<span class="chip warn">↩ 审查回修 ${reviewLoops} 次</span>` : '';

    const cards = `
      <div class="grid">
        <div class="card"><h3>阶段</h3><div class="v">${esc(p.phaseLabel || '—')}</div></div>
        <div class="card"><h3>状态码</h3><div class="v mono">${esc(p.status || '—')}</div></div>
        <div class="card"><h3>耗时</h3><div class="v">${esc(p.elapsedText || '—')}</div></div>
        <div class="card"><h3>Gate</h3><div class="v ${gateClass(p.gateOk)}">${esc(p.gateText || '—')}</div></div>
        <div class="card"><h3>Agent</h3><div class="v">${esc(p.agentText || '—')}${p.agentLogKb ? ` · ${p.agentLogKb}KB` : ''}</div></div>
      </div>`;

    const halt = p.halt
      ? `<div class="halt">
          <div class="halt-title">⚠ ${esc(p.halt.status)}${p.halt.reason ? ` · ${esc(p.halt.reason)}` : ''}</div>
          <div class="halt-body">${esc(HALT_GUIDANCE[p.halt.status] || '运行已停止，打开 state.json / 报告查看原因。')}</div>
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
      return `<div class="review">
        <div class="review-head"><span class="tag ${verdictClass(r.decision, r.verdict)}">${esc(r.verdict || r.decision || '?')}</span><span class="muted">第 ${esc(r.round)} 轮</span></div>
        ${r.summary ? `<div class="review-sum">${esc(r.summary)}</div>` : ''}
        ${findings ? `<ul class="findings">${findings}</ul>` : ''}
      </div>`;
    }).join('') || '<div class="empty">没有审查轮次。</div>';

    const links = `<div class="links">
      ${p.reportPath ? `<button class="btn ghost" data-act="openReport" data-path="${esc(p.reportPath)}">📄 最终报告</button>` : ''}
      ${p.statePath ? `<button class="btn ghost" data-act="openState" data-path="${esc(p.statePath)}">{} state.json</button>` : ''}
    </div>`;

    app.innerHTML = `
      <div class="head">
        <div>
          <button class="back" data-act="showOverview">← 队列</button>
          <h1>${esc(p.taskLabel || '—')}</h1>
          <div class="muted">${esc(p.runId || '等待运行')} · 模式 ${esc(p.runMode || '—')} · ${esc(p.roleText || '')} ${loopChip}</div>
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
      lastOverview = message.payload;
      view = 'overview';
      renderOverview(lastOverview);
    } else if (message?.type === 'detail') {
      lastDetail = message.payload;
      view = 'detail';
      renderDetail(lastDetail);
    }
  });

  app.innerHTML = '<div class="empty">加载中…</div>';
  vscode.postMessage({ type: 'ready' });
})();
