import { useState } from 'react';
import { Alert, Button, Input, message, Space, Table, Typography } from 'antd';
import { filterSupportedQueuePatch } from '../agentLoopApi';
import type { QueueDefaultsPanelProps } from './types';

const { Text, Title } = Typography;

// QueueDefaultsView name kept for test contract and direct <QueueDefaultsView ... />
export function QueueDefaultsView({ data, preview, onPreview, applyResult, onApply, settingsData }: QueueDefaultsPanelProps) {
  const [proposedText, setProposedText] = useState('{\n  "workerMaxTurns": 256\n}');
  const [lastRejected, setLastRejected] = useState<string[]>([]);
  const current = (data && data.defaults) || {};
  const supported = (data && data.supportedKeys) || [];
  const isUnsupported = !!(data && (data.unsupported || (supported.length === 0 && !data.defaults)));

  const copyToClipboard = (text: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => message.success(`${label} 已复制`));
      } else {
        message.info(`${label}（请手动复制）`);
      }
    } catch {
      message.info(`${label}（请手动复制）`);
    }
  };

  const renderLineNumbered = (obj: Record<string, unknown>) => {
    const json = JSON.stringify(obj || {}, null, 2);
    const lines = json.split('\n');
    return (
      <div className="native-code-shell" style={{ position: 'relative', maxHeight: 240 }}>
        <button
          type="button"
          className="native-code-copy"
          onClick={() => copyToClipboard(json, '当前 defaults')}
          aria-label="复制当前 defaults JSON"
        >
          复制
        </button>
        <div className="native-code" style={{ padding: '12px 16px', fontSize: 12 }}>
          {lines.map((line, idx) => (
            <div className="native-code-line" key={idx} style={{ gridTemplateColumns: '32px 1fr' }}>
              <span className="native-code-no" style={{ fontSize: 11 }}>{idx + 1}</span>
              <span className="native-code-text" style={{ fontSize: 12 }}>{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const computeClientDryRun = (proposedPatch: Record<string, unknown>) => {
    const before: Record<string, unknown> = { ...current };
    const after: Record<string, unknown> = { ...current, ...proposedPatch };
    const diffKeys = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    const diff = diffKeys.map((k) => ({ key: k, before: before[k], after: after[k] }));
    return { before, after, diff, ok: true };
  };

  const doPreview = () => {
    try {
      const parsed = JSON.parse(proposedText || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const { patch, rejected } = filterSupportedQueuePatch(parsed, supported.length ? supported : null);
        setLastRejected(rejected);
        setProposedText(JSON.stringify(patch, null, 2));
        onPreview(patch);
      } else {
        message.error('proposed 必须是对象');
      }
    } catch {
      message.error('proposed JSON 无效');
    }
  };

  const doApply = () => {
    try {
      const parsed = JSON.parse(proposedText || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const { patch } = filterSupportedQueuePatch(parsed, supported.length ? supported : null);
        onApply && onApply(patch);
      } else {
        message.error('proposed 必须是对象');
      }
    } catch {
      message.error('proposed JSON 无效');
    }
  };

  const doSyncFromSettings = () => {
    const ns = (settingsData && (settingsData.nonSensitive || settingsData)) || {};
    const prop: Record<string, unknown> = {};
    const sup = new Set(supported);
    for (const [k, v] of Object.entries(ns)) {
      if ((sup.size === 0 || sup.has(k)) && k !== 'workerEnv') {
        prop[k] = v;
      }
    }
    if (Object.keys(prop).length === 0) {
      const nsa: any = ns || {};
      if (nsa.fixAgent !== undefined) prop.fixAgent = nsa.fixAgent;
      if (nsa.reviewAgent !== undefined) prop.reviewAgent = nsa.reviewAgent;
      if (nsa.workerMaxTurns !== undefined) prop.workerMaxTurns = nsa.workerMaxTurns;
      if (nsa.workerMaxRetries !== undefined) prop.workerMaxRetries = nsa.workerMaxRetries;
      if (nsa.worktreeScope !== undefined) prop.worktreeScope = nsa.worktreeScope;
      if (nsa.queuePath !== undefined) prop.queuePath = nsa.queuePath;
    }
    const { patch, rejected } = filterSupportedQueuePatch(prop, supported.length ? supported : null);
    setLastRejected(rejected);
    const json = JSON.stringify(patch, null, 2) || '{}';
    setProposedText(json);
    onPreview(patch);
  };

  const localDry = (() => {
    try {
      const p = JSON.parse(proposedText || '{}');
      return computeClientDryRun(filterSupportedQueuePatch(p, supported.length ? supported : null).patch);
    } catch {
      return { before: current, after: current, diff: [], ok: false };
    }
  })();

  return (
    <div style={{ maxWidth: 620 }}>
      <Title level={5}>队列 defaults（仅支持键，当前值）</Title>
      {isUnsupported && (
        <Alert type="info" showIcon style={{ marginBottom: 8 }} message="后端此切片为只读/不支持完整 queue defaults 持久化（honest state）" description="仅支持键预览与 patch 过滤可用；真实写入由后端 queue 文件处理。" />
      )}
      {renderLineNumbered(current)}
      <Space size={8} style={{ marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>supported: {supported.length ? supported.join(', ') : '(后端未提供，使用已知安全键)'}</Text>
        <Button size="small" onClick={() => copyToClipboard(JSON.stringify(current, null, 2), '当前 defaults')}>复制当前</Button>
      </Space>

      <div style={{ marginTop: 16 }}>
        <Text strong>预览 patch（dry-run，仅支持键；secrets / workerEnv 自动剔除）</Text>
        <Input.TextArea
          rows={5}
          value={proposedText}
          onChange={(e) => setProposedText(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}
        />
        <Space style={{ marginTop: 8 }}>
          <Button onClick={doSyncFromSettings}>从 Settings 同步并预览 diff</Button>
          <Button onClick={doPreview}>预览 structured diff（不写入）</Button>
          <Button type="primary" onClick={doApply}>确认应用（调用 bridge）</Button>
        </Space>
      </div>

      {lastRejected.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8 }}
          message="已剔除不支持或危险键"
          description={`以下键被拒绝/省略（workerEnv、secrets、unsupported 不会进入 patch）：${lastRejected.join(', ')}。仅 supported keys 可预览/apply。`}
        />
      )}

      <div style={{ marginTop: 12, padding: 8, background: '#f0f7ff', border: '1px solid #d6e4ff', borderRadius: 4 }}>
        <Text strong>Proposed（过滤后，仅支持键）:</Text>
        <pre style={{ background: '#fff', padding: 6, fontSize: 12, marginTop: 4, maxHeight: 120, overflow: 'auto' }}>{proposedText}</pre>
        <Text strong style={{ display: 'block', marginTop: 6 }}>Dry-run diff（客户端计算，支持键 before/after）:</Text>
        {localDry.diff.length > 0 ? (
          <Table
            size="small"
            style={{ marginTop: 4 }}
            columns={[
              { title: 'Key', dataIndex: 'key', key: 'key' },
              { title: 'Before', dataIndex: 'before', key: 'before', render: (v: unknown) => JSON.stringify(v) },
              { title: 'After', dataIndex: 'after', key: 'after', render: (v: unknown) => JSON.stringify(v) },
            ]}
            dataSource={localDry.diff.map((d: any, i: number) => ({ ...d, key: d.key || String(i) }))}
            pagination={false}
            rowKey="key"
          />
        ) : (
          <div style={{ fontSize: 12 }}>no diff（与当前一致或空 patch）</div>
        )}
      </div>

      {preview && (
        <div style={{ marginTop: 12, padding: 8, background: preview.ok ? '#f6ffed' : '#fff1f0', border: '1px solid #eee' }}>
          {preview.ok === false || preview.unsupported ? (
            <Alert type="info" showIcon message={preview.error || preview.note || 'unsupported / read-only (bridge 返回 honest 状态)'} description="调用了 preview bridge；实际应用受后端 queue 能力限制，未伪造成功。" />
          ) : (
            <>
              <Text strong>Preview result (before/after diff for supported keys):</Text>
              {Array.isArray(preview.diff) && preview.diff.length > 0 ? (
                <Table
                  size="small"
                  style={{ marginTop: 4 }}
                  columns={[
                    { title: 'Key', dataIndex: 'key', key: 'key' },
                    { title: 'Before', dataIndex: 'before', key: 'before', render: (v: unknown) => JSON.stringify(v) },
                    { title: 'After', dataIndex: 'after', key: 'after', render: (v: unknown) => JSON.stringify(v) },
                  ]}
                  dataSource={(preview.diff || []).map((d: any, i: number) => ({ ...d, key: d.key || String(i) }))}
                  pagination={false}
                  rowKey="key"
                />
              ) : (
                <div style={{ fontSize: 12 }}>no diff (values match)</div>
              )}
              <div style={{ fontSize: 12, marginTop: 4 }}>before keys: {Object.keys(preview.before || {}).join(', ')}</div>
              <div style={{ fontSize: 12 }}>after keys: {Object.keys(preview.after || {}).join(', ')}</div>
            </>
          )}
        </div>
      )}

      {applyResult && (
        <div style={{ marginTop: 12, padding: 8, background: applyResult.ok ? '#f6ffed' : '#fff1f0', border: '1px solid #eee' }}>
          {applyResult.ok === false || applyResult.unsupported ? (
            <Alert type="info" showIcon message={(applyResult.rolledBack ? 'rolled back: ' : '') + (applyResult.error || 'unsupported / read-only')} description="已调用 apply bridge，未发明成功；请检查后端或直接编辑 queue 文件（受支持键限制）。" />
          ) : (
            <>
              <Text strong>Apply result (written + validated):</Text>
              {Array.isArray(applyResult.diff) && applyResult.diff.length > 0 ? (
                <Table
                  size="small"
                  style={{ marginTop: 4 }}
                  columns={[
                    { title: 'Key', dataIndex: 'key', key: 'key' },
                    { title: 'Before', dataIndex: 'before', key: 'before', render: (v: unknown) => JSON.stringify(v) },
                    { title: 'After', dataIndex: 'after', key: 'after', render: (v: unknown) => JSON.stringify(v) },
                  ]}
                  dataSource={(applyResult.diff || []).map((d: any, i: number) => ({ ...d, key: d.key || String(i) }))}
                  pagination={false}
                  rowKey="key"
                />
              ) : (
                <div style={{ fontSize: 12 }}>no diff</div>
              )}
              <div style={{ fontSize: 12, marginTop: 4 }}>applied: {JSON.stringify(applyResult.applied || {})}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>after keys: {Object.keys(applyResult.after || {}).join(', ')}</div>
            </>
          )}
        </div>
      )}

      <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
        仅支持键通过 preview/apply 桥；workerEnv/secrets 及未列出键被显式拒绝并解释。调用 bridge 后以其返回为准（不支持时 honest 展示）。写入后建议校验队列 JSON。
      </Text>
    </div>
  );
}

export { QueueDefaultsView as QueueDefaultsPanel };
export default QueueDefaultsView;
