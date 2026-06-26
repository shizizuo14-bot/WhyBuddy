import { useEffect } from 'react';
import { Alert, Button, Form, Input, message, Space, Switch, Tag, Typography } from 'antd';
import type { LlmKeysPanelProps } from './types';

const { Text } = Typography;

// LlmKeyForm name preserved for any legacy direct references / test compat.
function LlmKeyForm({ initial, onSave, providerTests, onTestProvider, workerCliTests, onTestWorkerCli, queueRunning }: LlmKeysPanelProps) {
  const [form] = Form.useForm();
  const isRunning = Boolean(queueRunning);
  const baseUrlLocked = isRunning;

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        baseUrl: initial.baseUrl || '',
        injectToWorker: initial.injectToWorker !== false,
      });
    }
  }, [initial, form]);

  const getKeyStatus = (key?: string) => key === 'configured' ? <Tag color="success">已配置 (redacted)</Tag> : <Tag>未配置</Tag>;

  const handleFinish = (values: any) => {
    const payload: any = {
      baseUrl: values.baseUrl,
      injectToWorker: values.injectToWorker,
    };
    const hadKeyAttempt = !!(values.grokApiKey || values.openaiApiKey || values.anthropicApiKey);

    onSave(payload);
    if (hadKeyAttempt) {
      message.warning('LLM key 值未持久化（此 web 切片仅 /settings 非秘密后端）；不报告保存成功。');
    } else {
      message.success('配置已保存');
    }
    form.setFieldsValue({ grokApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
  };

  const handleClear = (keyName: string) => {
    if (['grokApiKey', 'openaiApiKey', 'anthropicApiKey'].includes(keyName)) {
      message.warning('LLM key 清除在此 web 切片中不支持（无持久化）；仅显示 configured 状态。');
      form.setFieldsValue({ [keyName]: '' });
      return;
    }
    const payload: any = { [keyName]: '' };
    onSave(payload);
    message.success('已清除');
  };

  const handleTest = (provider: string) => {
    if (onTestProvider) onTestProvider(provider);
  };

  const getTestResult = (provider: string) => {
    return (providerTests || []).find((r: any) => r.provider === provider);
  };

  const renderResult = (provider: string) => {
    const r = getTestResult(provider);
    if (!r) return null;
    const tone = r.status === 'ok' ? 'success' : r.status === 'skipped' ? 'default' : 'error';
    let timeStr = '';
    try { if (r.checkedAt) timeStr = ' ' + new Date(r.checkedAt).toLocaleTimeString(); } catch {}
    return (
      <div style={{ marginTop: 4, fontSize: 12 }}>
        <Tag color={tone}>{r.status}</Tag>
        <span>{r.durationMs}ms · {r.reason}{timeStr} (cached)</span>
      </div>
    );
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} style={{ maxWidth: 620 }}>
      <Alert type="warning" showIcon message="LLM Keys 保存/清除在此 web 切片不支持（/settings 为 non-secret 后端）；仅显示状态，持久化操作被阻断。" style={{ marginBottom: 12 }} />
      <Form.Item label="Grok API Key / Token">
        <Space>
          {getKeyStatus(initial?.keys?.grokApiKey)}
          <Button size="small" danger disabled title="LLM key 持久化/清除在此 web 切片不支持">清除</Button>
          <Button size="small" onClick={() => handleTest('grok')}>测试</Button>
        </Space>
        <Form.Item name="grokApiKey" noStyle>
          <Input.Password placeholder="（此 web 切片不支持输入保存）" disabled />
        </Form.Item>
        {renderResult('grok')}
      </Form.Item>

      <Form.Item label="OpenAI API Key">
        <Space>
          {getKeyStatus(initial?.keys?.openaiApiKey)}
          <Button size="small" danger disabled title="LLM key 持久化/清除在此 web 切片不支持">清除</Button>
          <Button size="small" onClick={() => handleTest('openai')}>测试</Button>
        </Space>
        <Form.Item name="openaiApiKey" noStyle>
          <Input.Password placeholder="（此 web 切片不支持输入保存）" disabled />
        </Form.Item>
        {renderResult('openai')}
      </Form.Item>

      <Form.Item label="Anthropic API Key">
        <Space>
          {getKeyStatus(initial?.keys?.anthropicApiKey)}
          <Button size="small" danger disabled title="LLM key 持久化/清除在此 web 切片不支持">清除</Button>
          <Button size="small" onClick={() => handleTest('anthropic')}>测试</Button>
        </Space>
        <Form.Item name="anthropicApiKey" noStyle>
          <Input.Password placeholder="（此 web 切片不支持输入保存）" disabled />
        </Form.Item>
        {renderResult('anthropic')}
      </Form.Item>

      <Form.Item label="Worker CLI 健康 (本地 grok/codex 命令探针)">
        <Space>
          <Button size="small" onClick={() => onTestWorkerCli && onTestWorkerCli('grok')}>Probe grok</Button>
          <Button size="small" onClick={() => onTestWorkerCli && onTestWorkerCli('codex')}>Probe codex</Button>
        </Space>
        {(() => {
          const gr = (workerCliTests || []).find((r: any) => r.worker === 'grok');
          const cr = (workerCliTests || []).find((r: any) => r.worker === 'codex');
          const tone = (st: string) => st === 'ok' ? 'success' : (st === 'skipped' ? 'default' : (st === 'timeout' ? 'warning' : 'error'));
          return (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              {gr && <div><Tag color={tone(gr.status)}>{gr.worker}</Tag> {gr.status} {gr.durationMs}ms · {gr.reason}</div>}
              {cr && <div><Tag color={tone(cr.status)}>{cr.worker}</Tag> {cr.status} {cr.durationMs}ms · {cr.reason}</div>}
            </div>
          );
        })()}
      </Form.Item>

      <Form.Item label="代理地址 / Base URL" name="baseUrl">
        <Input placeholder="https://api.example.com/v1" disabled={baseUrlLocked} />
      </Form.Item>

      <Form.Item label="将 Keys 注入到 Worker 环境" name="injectToWorker" valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">保存非秘密设置</Button>
          <Button danger onClick={async () => {
            await onSave({ baseUrl: form.getFieldValue('baseUrl'), injectToWorker: form.getFieldValue('injectToWorker') });
            message.warning('LLM keys 清除不支持（web /settings 切片无秘密持久化能力）；仅状态显示。');
            form.setFieldsValue({ grokApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
          }}>清除全部 Keys</Button>
        </Space>
      </Form.Item>

      <Text type="secondary" style={{ fontSize: 12 }}>
        此 web 切片仅显示 LLM key configured 状态（来自 /settings）；保存/清除持久化不受支持。点击“测试”触发 provider health check。
      </Text>

      {(providerTests && providerTests.length > 0) && (
        <div style={{ marginTop: 12, padding: 8, background: '#fafafa', border: '1px solid #eee' }}>
          <Text strong style={{ fontSize: 12 }}>最近 Provider 健康检查 (会话缓存)</Text>
          {providerTests.map((r: any, idx: number) => (
            <div key={idx} style={{ fontSize: 12, marginTop: 2 }}>
              {r.provider} · {r.status} · {r.durationMs}ms · {r.reason} {r.checkedAt ? ('@' + new Date(r.checkedAt).toLocaleTimeString()) : ''} (cached)
            </div>
          ))}
        </div>
      )}
    </Form>
  );
}

export { LlmKeyForm as LlmKeysPanel };
export { LlmKeyForm };
export default LlmKeyForm;
