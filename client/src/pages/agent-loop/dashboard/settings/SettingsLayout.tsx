import { Card, Col, Row, Space, Typography } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

const { Text, Title } = Typography;

export type SettingsSummary = {
  activeProfile?: string | null;
  fixAgent?: string | null;
  reviewAgent?: string | null;
};

export function SettingsSummaryCards({ summary }: { summary: SettingsSummary }) {
  const { activeProfile = 'local', fixAgent = '-', reviewAgent = '-' } = summary || {};
  return (
    <Row gutter={12}>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center' }} className="summary-card">
          <Space direction="vertical" size={2}>
            <UserOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>活跃 Profile</Text>
            <Text strong data-testid="summary-active-profile">{activeProfile}</Text>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center' }} className="summary-card">
          <Space direction="vertical" size={2}>
            <RobotOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Review Agent</Text>
            <Text strong data-testid="summary-review-agent">{reviewAgent}</Text>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center' }} className="summary-card">
          <Space direction="vertical" size={2}>
            <RobotOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Fix Agent</Text>
            <Text strong data-testid="summary-fix-agent">{fixAgent}</Text>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

export function SettingsLayout({
  title = 'AgentLoop 设置中心',
  summary,
  tabs,
  footer,
}: {
  title?: string;
  summary?: SettingsSummary;
  tabs: ReactNode; // Tabs items or prebuilt <Tabs />
  footer?: ReactNode;
}) {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={4} style={{ marginBottom: 0 }}>{title}</Title>
      {summary && <SettingsSummaryCards summary={summary} />}
      {tabs}
      {footer}
    </Space>
  );
}

export default SettingsLayout;
