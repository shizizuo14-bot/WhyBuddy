import { Button, Segmented, Space } from 'antd';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardApp, DashboardDetailApp } from './DashboardApp';
import './dashboard-react.css';
import { previewDetailPayload, previewOverviewPayload } from './devPayload';
import { normalizeSaveSettingsPayload, redactSettingsMessageForLog } from '../settingsMessages';

type PreviewMode = 'detail' | 'overview';

window.__AGENT_LOOP_ASSETS__ = {
  brandLogo: '/media/sliderule-brand.svg',
};
let mockSettings: any = {
  nonSensitive: {
    fixAgent: 'grok',
    reviewAgent: 'codex',
    workerMaxTurns: 128,
    workerMaxRetries: 2,
    queuePath: 'agent-loop/scripts/migration-queue.json',
    worktreeScope: 'queue',
  },
  keys: { grokApiKey: '', openaiApiKey: '', anthropicApiKey: '' },
  baseUrl: '',
  injectToWorker: true,
  queueRunning: false,
  activeProfile: 'grok / codex',
};

window.__AGENT_LOOP_VSCODE_API__ = {
  postMessage(message: any) {
    console.info('[AgentLoop preview command]', redactSettingsMessageForLog(message));
    if (message?.type === 'getSettings') {
      // Simulate response
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'settings', payload: mockSettings } }));
      }, 10);
    }
    if (message?.type === 'saveSettings') {
      const data = normalizeSaveSettingsPayload(message);
      const newKeys = { ...mockSettings.keys };
      if (typeof data.grokApiKey === 'string') {
        newKeys.grokApiKey = data.grokApiKey ? 'configured' : '';
      }
      if (typeof data.openaiApiKey === 'string') {
        newKeys.openaiApiKey = data.openaiApiKey ? 'configured' : '';
      }
      if (typeof data.anthropicApiKey === 'string') {
        newKeys.anthropicApiKey = data.anthropicApiKey ? 'configured' : '';
      }
      const nonSensitiveUpdate: Record<string, unknown> = {};
      const nonSecretKeys = ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'queuePath', 'worktreeScope', 'baseUrl', 'injectToWorker'] as const;
      for (const key of nonSecretKeys) {
        if (key in data) {
          nonSensitiveUpdate[key] = data[key];
        }
      }
      mockSettings = {
        ...mockSettings,
        nonSensitive: { ...mockSettings.nonSensitive, ...nonSensitiveUpdate },
        keys: newKeys,
        baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : mockSettings.baseUrl,
        injectToWorker: typeof data.injectToWorker === 'boolean' ? data.injectToWorker : mockSettings.injectToWorker,
        queueRunning: typeof data.queueRunning === 'boolean' ? data.queueRunning : mockSettings.queueRunning,
        activeProfile: mockSettings.activeProfile,
      };
      // respond with updated
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'settings', payload: mockSettings } }));
      }, 10);
    }
    if (message?.type === 'testProvider') {
      const prov = (message.provider || (message.payload && message.payload.provider) || 'grok') as 'grok' | 'openai' | 'anthropic';
      const keyName = (prov + 'ApiKey') as 'grokApiKey' | 'openaiApiKey' | 'anthropicApiKey';
      const hasKey = mockSettings.keys && mockSettings.keys[keyName] === 'configured';
      setTimeout(() => {
        const payload = hasKey
          ? { provider: prov, status: 'ok', durationMs: 87, reason: 'ok' }
          : { provider: prov, status: 'skipped', durationMs: 0, reason: 'missing key' };
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'providerHealth', payload } }));
      }, 10);
    }
    if (message?.type === 'getQueueDefaults') {
      setTimeout(() => {
        const payload = {
          defaults: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, workerMaxRetries: 2, skipReview: false, useWorktree: true, worktreeScope: 'queue', maxIterations: 3 },
          supportedKeys: ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'skipReview', 'useWorktree', 'worktreeScope', 'maxIterations'],
          queuePath: 'agent-loop/scripts/migration-queue.json',
        };
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'queueDefaults', payload } }));
      }, 5);
    }
    if (message?.type === 'previewQueueDefaults') {
      const proposed = (message && (message.proposed || (message.payload && message.payload.proposed))) || {};
      setTimeout(() => {
        const hasUnsupported = Object.keys(proposed).some((k: string) => ['workerEnv'].includes(k) || !['fixAgent','reviewAgent','workerMaxTurns','workerMaxRetries','skipReview','useWorktree','worktreeScope','maxIterations'].includes(k));
        if (hasUnsupported) {
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'queuePreview', payload: { ok: false, error: 'redacted error' } } }));
        } else {
          const before = { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, workerMaxRetries: 2, skipReview: false, useWorktree: true, worktreeScope: 'queue', maxIterations: 3 };
          const after = { ...before, ...proposed };
          const diff = Object.keys(after).filter(k => JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k])).map(k => ({ key: k, before: (before as any)[k], after: (after as any)[k] }));
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'queuePreview', payload: { ok: true, before, after, diff } } }));
        }
      }, 5);
    }
    if (message?.type === 'applyQueueDefaults') {
      const proposed = (message && (message.proposed || (message.payload && message.payload.proposed))) || {};
      setTimeout(() => {
        const hasUnsupported = Object.keys(proposed).some((k: string) => ['workerEnv'].includes(k) || !['fixAgent','reviewAgent','workerMaxTurns','workerMaxRetries','skipReview','useWorktree','worktreeScope','maxIterations'].includes(k));
        if (hasUnsupported) {
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'queueApply', payload: { ok: false, error: 'redacted error' } } }));
        } else {
          const before = { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, workerMaxRetries: 2, skipReview: false, useWorktree: true, worktreeScope: 'queue', maxIterations: 3 };
          const after = { ...before, ...proposed };
          const diff = Object.keys(after).filter(k => JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k])).map(k => ({ key: k, before: (before as any)[k], after: (after as any)[k] }));
          const applied = { ...proposed };
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'queueApply', payload: { ok: true, before, after, diff, applied } } }));
          // simulate refresh of current
          setTimeout(() => {
            const payload = { defaults: after, supportedKeys: ['fixAgent','reviewAgent','workerMaxTurns','workerMaxRetries','skipReview','useWorktree','worktreeScope','maxIterations'], queuePath: 'agent-loop/scripts/migration-queue.json' };
            window.dispatchEvent(new MessageEvent('message', { data: { type: 'queueDefaults', payload } }));
          }, 5);
        }
      }, 5);
    }
    if (message?.type === 'exportSettings') {
      setTimeout(() => {
        const exp = {
          schemaVersion: 1,
          profiles: { fixAgent: mockSettings.nonSensitive.fixAgent, reviewAgent: mockSettings.nonSensitive.reviewAgent },
          nonSensitive: { ...mockSettings.nonSensitive },
          keys: { ...mockSettings.keys },
        };
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'settingsExported', payload: exp } }));
      }, 5);
    }
    if (message?.type === 'importSettings') {
      const raw = (message && (message.payload || message)) || {};
      setTimeout(() => {
        const ver = raw && raw.schemaVersion;
        let hasSecret = false;
        try {
          const s = JSON.stringify(raw);
          hasSecret = /sk-|Bearer |x-api-key|private key/i.test(s) && !/configured/i.test(s);
        } catch {}
        if (ver !== 1 || hasSecret) {
          const err = ver !== 1 ? 'unsupported schema version' : 'contains secret-looking keys';
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'importSettingsResult', payload: { ok: false, error: err } } }));
        } else {
          // apply non-sensitive only to mock
          const ns = raw.nonSensitive || {};
          const prof = raw.profiles || {};
          if (prof.fixAgent) mockSettings.nonSensitive.fixAgent = prof.fixAgent;
          if (prof.reviewAgent) mockSettings.nonSensitive.reviewAgent = prof.reviewAgent;
          Object.keys(ns).forEach((k) => {
            if (['fixAgent','reviewAgent','workerMaxTurns','workerMaxRetries','queuePath','worktreeScope','baseUrl','injectToWorker'].includes(k)) {
              (mockSettings.nonSensitive as any)[k] = (ns as any)[k];
            }
          });
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'importSettingsResult', payload: { ok: true } } }));
          setTimeout(() => {
            window.dispatchEvent(new MessageEvent('message', { data: { type: 'settings', payload: mockSettings } }));
          }, 5);
        }
      }, 5);
    }
    if (message?.type === 'getDiagnostics') {
      setTimeout(() => {
        const payload = {
          effectiveConfig: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, workerMaxRetries: 2, queuePath: 'agent-loop/scripts/migration-queue.json', worktreeScope: 'queue', baseUrl: '', injectToWorker: true },
          configSources: { fixAgent: 'default', reviewAgent: 'default', workerMaxTurns: 'default', workerMaxRetries: 'default', queuePath: 'default', worktreeScope: 'default', baseUrl: 'default', injectKeysToWorker: 'default' },
          keys: { grokApiKey: 'configured', openaiApiKey: '', anthropicApiKey: '' },
          queuePath: 'agent-loop/scripts/migration-queue.json',
          repoRoot: '/workspace/repo',
          lastRunState: { runId: '2026-06-24Txx', status: 'DONE_REVIEWED', task: 'agent-loop/tasks/demo.md' },
          warnings: [
            { category: 'ready', message: 'provider key(s) configured' },
            { category: 'ready', message: 'key injection enabled' },
            { category: 'ready', message: 'queue file present at resolved path' },
            { category: 'ready', message: 'last run state: DONE_REVIEWED' },
            { category: 'skipped', message: 'sample skipped warning' },
            { category: 'failed', message: 'sample failed (demo)' },
            { category: 'unknown', message: 'sample unknown' },
          ],
        };
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'diagnostics', payload } }));
      }, 5);
    }
  },
};

function DevDashboard() {
  const [mode, setMode] = useState<PreviewMode>('detail');

  return (
    <>
      <div className="native-dev-toolbar">
        <Space>
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as PreviewMode)}
            options={[
              { label: '详情', value: 'detail' },
              { label: '总览', value: 'overview' },
            ]}
          />
          <Button onClick={() => window.location.reload()}>刷新预览</Button>
          <span style={{ fontSize: 11, color: '#888' }}>(总览模式下可通过左侧菜单进入“设置”测试表单)</span>
        </Space>
      </div>
      {mode === 'detail'
        ? <DashboardDetailApp payload={previewDetailPayload} />
        : <DashboardApp payload={previewOverviewPayload} />}
    </>
  );
}

createRoot(document.getElementById('app')!).render(<DevDashboard />);
