import { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ProfilesPanelProps } from './types';

const { Text, Title } = Typography;

// ProfileCrudView preserved name for test direct renders and existing calls.
export function ProfileCrudView({ data, queueRunning, activeProfile, onList, onCreate, onRename, onDuplicate, onDelete, onSelect }: ProfilesPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');
  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState('');
  const [form] = Form.useForm();
  const [renameForm] = Form.useForm();
  const [dupForm] = Form.useForm();

  const profiles: Record<string, any> = (data && data.profiles) || {};
  const active = (data && data.activeProfile) || activeProfile || 'local';
  const isRunning = Boolean(queueRunning);
  const entries = Object.keys(profiles).sort();

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ name: '', fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, workerMaxRetries: 2, worktreeScope: 'queue' });
    setCreateOpen(true);
  };

  const submitCreate = () => {
    const vals = form.getFieldsValue();
    const n = (vals.name || '').trim();
    if (!n) {
      message.error('profile name required');
      return;
    }
    const v: any = {};
    ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope', 'baseUrl', 'queuePath'].forEach(k => { if (vals[k] !== undefined) v[k] = vals[k]; });
    if (vals.injectKeysToWorker !== undefined) v.injectKeysToWorker = vals.injectKeysToWorker;
    onCreate(n, v);
    setCreateOpen(false);
  };

  const openRename = (n: string) => {
    setRenameTarget(n);
    renameForm.resetFields();
    renameForm.setFieldsValue({ newName: n });
    setRenameOpen(true);
  };

  const submitRename = () => {
    const vals = renameForm.getFieldsValue();
    const nn = (vals.newName || '').trim();
    if (!nn || nn === renameTarget) {
      setRenameOpen(false);
      return;
    }
    onRename(renameTarget, nn);
    setRenameOpen(false);
  };

  const openDup = (n: string) => {
    setDupTarget(n);
    dupForm.resetFields();
    dupForm.setFieldsValue({ newName: n + '-copy' });
    setDupOpen(true);
  };

  const submitDup = () => {
    const vals = dupForm.getFieldsValue();
    const nn = (vals.newName || '').trim();
    if (!nn) {
      message.error('new name required');
      return;
    }
    onDuplicate(dupTarget, nn);
    setDupOpen(false);
  };

  const doDelete = (n: string) => {
    if (entries.length <= 1) {
      message.error('cannot delete last profile');
      return;
    }
    onDelete(n);
  };

  const doSelect = (n: string) => {
    if (n === active) return;
    if (isRunning) {
      message.warning('队列运行中，禁止切换 profile');
      return;
    }
    onSelect(n);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Space style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Settings Profiles</Title>
        <Button size="small" onClick={onList}>刷新</Button>
        <Button size="small" type="primary" onClick={openCreate} disabled={isRunning}>创建</Button>
      </Space>

      {isRunning ? (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={`队列运行中 (激活 Profile: ${active || '未知'})，禁止切换/删除 profile。`} />
      ) : null}

      <Table
        size="small"
        pagination={false}
        dataSource={entries.map((name: string) => {
          const p = profiles[name] || {};
          const isActive = name === active;
          const summary = [p.fixAgent, p.reviewAgent].filter(Boolean).join(' / ') || '-';
          return {
            key: name,
            name,
            isActive,
            summary,
            baseUrl: p.baseUrl,
            fixAgent: p.fixAgent,
            reviewAgent: p.reviewAgent,
            workerMaxTurns: p.workerMaxTurns,
            workerMaxRetries: p.workerMaxRetries,
            worktreeScope: p.worktreeScope,
            raw: p,
          };
        })}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: any) => (
              <Space>
                <Text strong>{name}</Text>
                {record.isActive ? <Tag color="success">当前</Tag> : null}
              </Space>
            ),
          },
          {
            title: '配置',
            dataIndex: 'summary',
            key: 'summary',
            render: (summary: string, record: any) => (
              <Space size={4}>
                <Tag>{summary}</Tag>
                {record.baseUrl ? <Tag color="blue">{record.baseUrl}</Tag> : null}
                <Text type="secondary">{record.workerMaxTurns || 128} turns / {record.workerMaxRetries || 2} retries / {record.worktreeScope || 'queue'}</Text>
              </Space>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, record: any) => (
              <Space size="small">
                {!record.isActive ? (
                  <Button size="small" onClick={() => doSelect(record.name)} disabled={isRunning}>选择</Button>
                ) : (
                  <Tag color="success">active</Tag>
                )}
                <Button size="small" onClick={() => openRename(record.name)} disabled={isRunning}>重命名</Button>
                <Button size="small" onClick={() => openDup(record.name)}>复制</Button>
                <Button size="small" danger disabled={isRunning || entries.length <= 1} onClick={() => doDelete(record.name)}>删除</Button>
              </Space>
            ),
          },
        ]}
      />

      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
        仅非敏感配置；不可删除最后一个 profile；运行中禁止切换与删除。
      </Text>

      <Modal title="创建 Profile" open={createOpen} onOk={submitCreate} onCancel={() => setCreateOpen(false)} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: 'name required' }, { pattern: /^[a-zA-Z0-9_-]+$/, message: 'invalid chars (use a-z0-9_-)'} ]}>
            <Input placeholder="my-profile" />
          </Form.Item>
          <Form.Item label="Fix Agent" name="fixAgent">
            <Select><Select.Option value="grok">grok</Select.Option><Select.Option value="codex">codex</Select.Option></Select>
          </Form.Item>
          <Form.Item label="Review Agent" name="reviewAgent">
            <Select><Select.Option value="codex">codex</Select.Option><Select.Option value="grok">grok</Select.Option><Select.Option value="none">none</Select.Option></Select>
          </Form.Item>
          <Form.Item label="Max Turns" name="workerMaxTurns"><InputNumber min={1} /></Form.Item>
          <Form.Item label="Max Retries" name="workerMaxRetries"><InputNumber min={0} /></Form.Item>
          <Form.Item label="Worktree Scope" name="worktreeScope">
            <Select><Select.Option value="queue">queue</Select.Option><Select.Option value="task">task</Select.Option></Select>
          </Form.Item>
          <Form.Item label="Base URL" name="baseUrl"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`重命名 ${renameTarget}`} open={renameOpen} onOk={submitRename} onCancel={() => setRenameOpen(false)} okText="重命名" cancelText="取消">
        <Form form={renameForm} layout="vertical">
          <Form.Item label="新名称" name="newName" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9_-]+$/, message: 'invalid profile name' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`复制 ${dupTarget}`} open={dupOpen} onOk={submitDup} onCancel={() => setDupOpen(false)} okText="复制" cancelText="取消">
        <Form form={dupForm} layout="vertical">
          <Form.Item label="新名称" name="newName" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9_-]+$/, message: 'invalid profile name' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export { ProfileCrudView as ProfilesPanel };
export default ProfileCrudView;
