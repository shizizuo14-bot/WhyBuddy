import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  ConfigProvider,
  Input,
  Layout,
  Menu,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import type { OverviewPayload, OverviewTask } from './types';
import { postCommand } from './vscodeBridge';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

const PAGE_SIZE = 6;
const CATEGORY_ORDER = ['queue', 'all', 'attention', 'running', 'landed', 'pending', 'disabled'] as const;

type FilterKey = typeof CATEGORY_ORDER[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  queue: '任务队列',
  all: '全部任务',
  attention: '需关注',
  running: '进行中',
  landed: '已落地',
  pending: '待跑',
  disabled: '已禁用',
};

const STATUS_TONE: Record<string, string> = {
  done: 'success',
  applied: 'success',
  reviewed: 'success',
  manualRescueLanded: 'success',
  noDiff: 'default',
  running: 'processing',
  pending: 'default',
  disabled: 'default',
  stale: 'warning',
  stopped: 'warning',
  applyConflict: 'warning',
  rescuePatch: 'warning',
  human: 'warning',
  failed: 'error',
  crashed: 'error',
  quarantined: 'warning',
};

function countValue(counts: OverviewPayload['counts'], key: string): number {
  return Number(counts?.[key]) || 0;
}

function queueTasks(tasks: OverviewTask[]): OverviewTask[] {
  return tasks.filter((task) => task.enabled !== false);
}

function taskCategory(task: OverviewTask): FilterKey {
  if (task.running) return 'running';
  if (task.enabled === false) return 'disabled';
  if (task.category && CATEGORY_ORDER.includes(task.category as FilterKey)) {
    return task.category as FilterKey;
  }
  const badge = task.outcomeGroup || task.badge || task.outcome || 'pending';
  if (['failed', 'crashed', 'quarantined', 'stale', 'human', 'rescuePatch', 'applyConflict', 'stopped'].includes(badge)) {
    return 'attention';
  }
  if (['done', 'applied', 'reviewed', 'manualRescueLanded', 'noDiff'].includes(badge)) {
    return 'landed';
  }
  return 'pending';
}

function statusColor(task: OverviewTask): string {
  return STATUS_TONE[task.outcomeGroup || task.badge || task.outcome || 'pending'] || 'default';
}

function statusLabel(task: OverviewTask): string {
  if (task.statusLabel) return task.statusLabel;
  const key = task.outcomeGroup || task.badge || task.outcome || 'pending';
  const labels: Record<string, string> = {
    done: '完成',
    applied: '已落地',
    reviewed: '已审查',
    noDiff: '无新增 diff',
    manualRescueLanded: '人工救回',
    running: '运行中',
    pending: '待跑',
    disabled: '已禁用',
    stale: '运行中断',
    stopped: '已停止',
    applyConflict: '应用冲突',
    rescuePatch: '可救援补丁',
    human: '人工接管',
    failed: '失败',
    crashed: '崩溃',
    quarantined: '隔离',
  };
  return labels[key] || key;
}

function taskLabel(task: OverviewTask): string {
  return task.taskLabel || task.task.split('/').pop()?.replace(/\.md$/, '') || task.task;
}

function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes) || 0;
  if (value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  return `${Math.round(value / 1024)} KB`;
}

function filterTasks(tasks: OverviewTask[], filter: FilterKey, query: string): OverviewTask[] {
  const base = filter === 'queue'
    ? queueTasks(tasks)
    : filter === 'all'
      ? tasks
      : tasks.filter((task) => taskCategory(task) === filter);
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return base;
  return base.filter((task) => {
    const haystack = [
      task.id,
      task.task,
      task.taskLabel,
      task.statusLabel,
      task.outcome,
      task.outcomeGroup,
      task.agent,
      task.fixAgent,
      task.reviewAgent,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(trimmed);
  });
}

function filterCount(tasks: OverviewTask[], filter: FilterKey, counts: OverviewPayload['counts']): number {
  if (filter === 'queue') return countValue(counts, 'queueTotal') || queueTasks(tasks).length;
  if (filter === 'all') return countValue(counts, 'total') || tasks.length;
  return tasks.filter((task) => taskCategory(task) === filter).length;
}

function BrandMark() {
  const brandLogo = window.__AGENT_LOOP_ASSETS__?.brandLogo || 'media/sliderule-brand.svg';
  return (
    <span className="native-brand-mark" aria-label="SlideRule" role="img">
      <img src={brandLogo} alt="" />
    </span>
  );
}

function DashboardSidebar() {
  return (
    <Sider width={224} theme="light" className="native-sidebar">
      <div className="native-brand">
        <BrandMark />
      </div>
      <Menu
        mode="inline"
        selectedKeys={['workbench']}
        items={[{ key: 'workbench', label: '工作台' }]}
      />
    </Sider>
  );
}

function OverviewHeader({ payload }: { payload: OverviewPayload }) {
  const queueRunning = Boolean(payload.queueRunning);
  const queueTotal = countValue(payload.counts, 'queueTotal') || queueTasks(payload.tasks || []).length;
  const total = countValue(payload.counts, 'total') || (payload.tasks || []).length;

  return (
    <Card>
      <Row align="middle" justify="space-between" gutter={[16, 16]}>
        <Col flex="auto">
          <Title level={3}>AgentLoop 控制台</Title>
          <Text type="secondary">{queueTotal} 个队列任务 / {total} 个全部任务</Text>
        </Col>
        <Col>
          <Space wrap>
            <Tag color={queueRunning ? 'processing' : 'default'}>{queueRunning ? '运行中' : '待命'}</Tag>
            {queueRunning ? (
              <Button danger onClick={() => postCommand('stopRun')}>停止</Button>
            ) : (
              <Button type="primary" onClick={() => postCommand('runQueue')}>运行队列</Button>
            )}
            <Button onClick={() => postCommand('refresh')}>刷新</Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );
}

function SummaryStats({ payload }: { payload: OverviewPayload }) {
  const counts = payload.counts || {};
  const tasks = payload.tasks || [];
  const queueTotal = countValue(counts, 'queueTotal') || queueTasks(tasks).length;
  const total = countValue(counts, 'total') || tasks.length;
  const landed = countValue(counts, 'done')
    + countValue(counts, 'applied')
    + countValue(counts, 'reviewed')
    + countValue(counts, 'manualRescueLanded')
    + countValue(counts, 'noDiff');

  return (
    <Row gutter={[16, 16]}>
      <Col xs={12} lg={6}>
        <Card>
          <Statistic title="队列任务" value={queueTotal} />
        </Card>
      </Col>
      <Col xs={12} lg={6}>
        <Card>
          <Statistic title="全部任务" value={total} />
        </Card>
      </Col>
      <Col xs={12} lg={6}>
        <Card>
          <Statistic title="运行中" value={countValue(counts, 'running')} />
        </Card>
      </Col>
      <Col xs={12} lg={6}>
        <Card>
          <Statistic title="已落地" value={landed} />
        </Card>
      </Col>
    </Row>
  );
}

function QueueTable({ tasks }: { tasks: OverviewTask[] }) {
  const columns: ColumnsType<OverviewTask> = [
    {
      title: '状态',
      key: 'status',
      render: (_, task) => <Tag color={statusColor(task)}>{statusLabel(task)}</Tag>,
    },
    {
      title: '任务',
      key: 'task',
      render: (_, task) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => postCommand('openTask', { taskPath: task.task })}>
            {taskLabel(task)}
          </Typography.Link>
          <Text type="secondary" className="native-task-path" ellipsis={{ tooltip: task.task }}>
            {task.task}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Agent',
      key: 'agent',
      render: (_, task) => task.agent || task.fixAgent || '-',
    },
    {
      title: '变更',
      key: 'diff',
      render: (_, task) => formatBytes(task.diffBytes),
    },
    {
      title: '最后更新',
      key: 'updated',
      render: (_, task) => task.lastUpdatedText || '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, task) => (
        <Space>
          <Button size="small" onClick={() => postCommand('openTask', { taskPath: task.task })}>打开</Button>
          {task.enabled === false && task.id ? (
            <Button size="small" onClick={() => postCommand('reEnable', { taskId: task.id })}>启用</Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey={(task) => task.id || task.task}
      columns={columns}
      dataSource={tasks}
      pagination={{ pageSize: PAGE_SIZE }}
    />
  );
}

function CurrentRun({ current }: { current: OverviewPayload['current'] }) {
  if (!current) {
    return <Alert type="info" showIcon message="当前没有运行中的任务" />;
  }
  return (
    <Alert
      type={current.staleRun ? 'warning' : 'info'}
      showIcon
      message={current.taskLabel || '当前运行'}
      description={`${current.phaseLabel || current.status || '-'} · ${current.elapsedText || '-'}`}
    />
  );
}

function SidePanel({ payload }: { payload: OverviewPayload }) {
  const counts = payload.counts || {};
  const tasks = payload.tasks || [];
  const total = countValue(counts, 'total') || tasks.length || 1;
  const landed = countValue(counts, 'done')
    + countValue(counts, 'applied')
    + countValue(counts, 'reviewed')
    + countValue(counts, 'manualRescueLanded')
    + countValue(counts, 'noDiff');
  const progress = Math.min(100, Math.round((landed / total) * 100));

  return (
    <Space direction="vertical" size="middle" className="native-side">
      <Card title="当前任务">
        <CurrentRun current={payload.current || null} />
      </Card>
      <Card>
        <Space direction="vertical" size="middle" className="native-side">
          <Statistic title="待处理" value={filterCount(tasks, 'pending', counts)} />
          <Statistic title="需关注" value={filterCount(tasks, 'attention', counts)} />
          <Progress percent={progress} status={progress >= 100 ? 'success' : 'active'} />
        </Space>
      </Card>
    </Space>
  );
}

export function DashboardApp({ payload }: { payload: OverviewPayload }) {
  const [filter, setFilter] = useState<FilterKey>('queue');
  const [query, setQuery] = useState('');
  const tasks = payload.tasks || [];
  const visibleTasks = useMemo(() => filterTasks(tasks, filter, query), [tasks, filter, query]);
  const tabItems = CATEGORY_ORDER.map((key) => ({
    key,
    label: `${FILTER_LABELS[key]} ${filterCount(tasks, key, payload.counts)}`,
  }));

  return (
    <ConfigProvider
      prefixCls="agent-ant"
      csp={window.__AGENT_LOOP_CSP_NONCE__ ? { nonce: window.__AGENT_LOOP_CSP_NONCE__ } : undefined}
    >
      <Layout className="native-dashboard">
        <DashboardSidebar />
        <Layout className="native-main">
          <Header className="native-header">
            <Breadcrumb items={[{ title: 'AgentLoop' }, { title: '工作台' }]} />
          </Header>
          <Content className="native-content">
            <Space direction="vertical" size="middle" className="native-stack">
              <OverviewHeader payload={payload} />
              <SummaryStats payload={payload} />
              <Row gutter={[16, 16]} align="top">
                <Col xs={24} xl={18}>
                  <Card
                    title="任务列表"
                    extra={<Input.Search placeholder="搜索任务" allowClear onChange={(event) => setQuery(event.target.value)} />}
                  >
                    <Tabs
                      activeKey={filter}
                      items={tabItems}
                      onChange={(next) => setFilter(next as FilterKey)}
                    />
                    <QueueTable tasks={visibleTasks} />
                  </Card>
                </Col>
                <Col xs={24} xl={6}>
                  <SidePanel payload={payload} />
                </Col>
              </Row>
            </Space>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
