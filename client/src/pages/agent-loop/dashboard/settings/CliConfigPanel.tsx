import { useEffect } from 'react';
import { Alert, Button, Col, Form, Input, InputNumber, message, Row, Select } from 'antd';
import type { CliConfigFormProps } from './types';

// CliConfigForm kept for existing test contract and direct renders.
// File is CliConfigPanel.tsx per allowed split module boundary.
export function CliConfigForm({ initial, onSave, queueRunning, activeProfile }: CliConfigFormProps) {
  const [form] = Form.useForm();
  const isRunning = Boolean(queueRunning);
  const runtimeLocked = (f: string) => isRunning && ['fixAgent', 'reviewAgent', 'queuePath', 'worktreeScope'].includes(f);

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        fixAgent: initial.fixAgent || 'grok',
        reviewAgent: initial.reviewAgent || 'codex',
        workerMaxTurns: initial.workerMaxTurns ?? 128,
        workerMaxRetries: initial.workerMaxRetries ?? 2,
        queuePath: initial.queuePath || 'agent-loop/scripts/migration-queue.json',
        worktreeScope: initial.worktreeScope || 'queue',
      });
    }
  }, [initial, form]);

  const handleFinish = (values: any) => {
    if (runtimeLocked('fixAgent') || runtimeLocked('reviewAgent') || runtimeLocked('queuePath') || runtimeLocked('worktreeScope')) {
      message.warning('队列运行中，运行时 profile 字段已禁用');
      return;
    }
    onSave(values);
    message.success('CLI 配置已保存');
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} style={{ maxWidth: 620 }}>
      {isRunning ? (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`队列运行中 (激活 Profile: ${activeProfile || '未知'})，运行时字段已锁定`} description="已锁定: fixAgent, reviewAgent, queuePath, worktreeScope（影响运行 profile/worker 配置）。workerMaxTurns / workerMaxRetries 为安全非运行时字段，可正常编辑。" />
      ) : null}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="默认修复 Worker" name="fixAgent" extra="用于自动修复的默认 Worker">
            <Select disabled={runtimeLocked('fixAgent')}>
              <Select.Option value="grok">Grok</Select.Option>
              <Select.Option value="codex">Codex</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="默认 Review Worker" name="reviewAgent" extra="用于代码审查的默认 Worker">
            <Select disabled={runtimeLocked('reviewAgent')}>
              <Select.Option value="codex">Codex</Select.Option>
              <Select.Option value="grok">Grok</Select.Option>
              <Select.Option value="none">None（跳过审查）</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="最大执行轮次" name="workerMaxTurns" extra="单任务最大迭代上限">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="最大重试次数" name="workerMaxRetries" extra="失败重试上限">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="队列文件路径" name="queuePath" extra="任务队列 JSON 路径">
            <Input placeholder="agent-loop/scripts/migration-queue.json" disabled={runtimeLocked('queuePath')} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="工作树模式" name="worktreeScope" extra="queue: 共享；task: 隔离">
            <Select disabled={runtimeLocked('worktreeScope')}>
              <Select.Option value="queue">queue</Select.Option>
              <Select.Option value="task">task</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item style={{ marginTop: 8 }}>
        <Button type="primary" htmlType="submit" disabled={runtimeLocked('fixAgent') || runtimeLocked('reviewAgent')}>保存 CLI 配置</Button>
      </Form.Item>
    </Form>
  );
}

// Also export under panel name for boundary clarity
export { CliConfigForm as CliConfigPanel };
export default CliConfigForm;
