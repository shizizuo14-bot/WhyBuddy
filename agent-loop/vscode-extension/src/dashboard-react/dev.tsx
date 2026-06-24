import { Button, Segmented, Space } from 'antd';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardApp, DashboardDetailApp } from './DashboardApp';
import './dashboard-react.css';
import { previewDetailPayload, previewOverviewPayload } from './devPayload';

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
};

window.__AGENT_LOOP_VSCODE_API__ = {
  postMessage(message: any) {
    console.info('[AgentLoop preview command]', message);
    if (message?.type === 'getSettings') {
      // Simulate response
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'settings', payload: mockSettings } }));
      }, 10);
    }
    if (message?.type === 'saveSettings') {
      console.info('[AgentLoop preview] saveSettings (mock)', message);
      const newKeys = { ...mockSettings.keys };
      if (typeof message.grokApiKey === 'string') {
        newKeys.grokApiKey = message.grokApiKey ? 'configured' : '';
      }
      if (typeof message.openaiApiKey === 'string') {
        newKeys.openaiApiKey = message.openaiApiKey ? 'configured' : '';
      }
      if (typeof message.anthropicApiKey === 'string') {
        newKeys.anthropicApiKey = message.anthropicApiKey ? 'configured' : '';
      }
      mockSettings = {
        ...mockSettings,
        nonSensitive: { ...mockSettings.nonSensitive, ...message },
        keys: newKeys,
      };
      // respond with updated
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'settings', payload: mockSettings } }));
      }, 10);
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
