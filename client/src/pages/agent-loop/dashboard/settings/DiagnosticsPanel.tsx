import { Button, Card, Descriptions, Empty, List, Space, Tag, Typography, message } from 'antd';
import { ReloadOutlined, SnippetsOutlined } from '@ant-design/icons';
import type { DiagnosticsPanelProps } from './types';

const { Text, Title } = Typography;

export function DiagnosticsView({ data, onRefresh }: DiagnosticsPanelProps) {
  const d = data || {};
  const eff = d.effectiveConfig || {};
  const srcs = d.configSources || {};
  const keys = d.keys || {};
  const warns: Array<{ category: string; message: string }> = Array.isArray(d.warnings) ? d.warnings : [];
  const catColor = (c: string) => (c === 'ready' ? 'success' : c === 'failed' ? 'error' : c === 'skipped' ? 'default' : 'warning');

  const handleCopy = () => {
    try {
      const text = JSON.stringify(d, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          message.success('已复制 redacted diagnostics artifact JSON');
        }).catch(() => {
          message.info('复制到剪贴板（手动）');
        });
      } else {
        message.info('复制到剪贴板（手动）');
      }
    } catch {
      message.info('复制到剪贴板（手动）');
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={5} style={{ margin: 0 }}>Diagnostics（只读）</Title>
        <Space>
          <Button size="small" onClick={onRefresh} icon={<ReloadOutlined />}>刷新</Button>
          <Button size="small" onClick={handleCopy} icon={<SnippetsOutlined />}>复制 JSON</Button>
        </Space>
      </div>

      <Card size="small" title="基础信息">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Repo root">{d.repoRoot || '-'}</Descriptions.Item>
          <Descriptions.Item label="Queue path">{d.queuePath || '-'}</Descriptions.Item>
          <Descriptions.Item label="Active Profile">{d.activeProfile || '-'}</Descriptions.Item>
          <Descriptions.Item label="Key status">
            {Object.keys(keys).map((k) => (
              <Tag key={k} color={keys[k] === 'configured' ? 'success' : undefined} style={{ marginRight: 4 }}>{k}:{keys[k] || 'unset'}</Tag>
            ))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="Effective Config">
        <pre style={{ background: '#fafafa', padding: 12, fontSize: 12, maxHeight: 180, overflow: 'auto', margin: 0, borderRadius: 4 }}>{JSON.stringify(eff, null, 2)}</pre>
      </Card>

      <Card size="small" title="Config Sources">
        <pre style={{ background: '#fafafa', padding: 12, fontSize: 12, maxHeight: 120, overflow: 'auto', margin: 0, borderRadius: 4 }}>{JSON.stringify(srcs, null, 2)}</pre>
      </Card>

      <Card size="small" title="Warnings (categorized)">
        {warns.length === 0 ? (
          <Empty description="无警告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={warns}
            renderItem={(w) => (
              <List.Item>
                <Space>
                  <Tag color={catColor(w.category)}>{w.category}</Tag>
                  <Text>{w.message}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Text type="secondary" style={{ fontSize: 11 }}>
        所有数据已通过 redaction helper；不执行网络检查；只读。
      </Text>
    </Space>
  );
}

export { DiagnosticsView as DiagnosticsPanel };
export default DiagnosticsView;
