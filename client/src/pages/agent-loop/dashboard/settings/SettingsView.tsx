import { Button, Card, message, Space, Tabs, Typography, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import type { AgentLoopSettingsViewModel } from '../dashboardTypes';
import { CliConfigForm } from './CliConfigPanel';
import { LlmKeyForm } from './LlmKeysPanel';
import { QueueDefaultsView } from './QueueDefaultsPanel';
import { DiagnosticsView } from './DiagnosticsPanel';
import { ProfileCrudView } from './ProfilesPanel';
import { RedactedImportExport } from './RedactedImportExport';
import { SettingsLayout } from './SettingsLayout';

const { Text, Title } = Typography;

// The orchestrating SettingsView; delegates panel impl to sibling modules.
export function SettingsView({
  data,
  onSave,
  providerTests,
  onTestProvider,
  workerCliTests,
  onTestWorkerCli,
  queueDefaultsData,
  queuePreview,
  onPreviewQueue,
  queueApply,
  onApplyQueue,
  exportedSettings,
  importResult,
  onExportSettings,
  onImportSettings,
  diagnosticsData,
  onRefreshDiagnostics,
  profilesData,
  onListProfiles,
  onCreateProfile,
  onRenameProfile,
  onDuplicateProfile,
  onDeleteProfile,
  onSelectProfile,
}: {
  data: AgentLoopSettingsViewModel | null;
  onSave: (v: any) => void;
  providerTests?: any[];
  onTestProvider?: (p: string) => void;
  workerCliTests?: any[];
  onTestWorkerCli?: (w: string) => void;
  queueDefaultsData?: any;
  queuePreview?: any;
  onPreviewQueue?: (p: any) => void;
  queueApply?: any;
  onApplyQueue?: (p: any) => void;
  exportedSettings?: any;
  importResult?: any;
  onExportSettings?: () => void;
  onImportSettings?: (text: string) => void;
  diagnosticsData?: any;
  onRefreshDiagnostics?: () => void;
  profilesData?: any;
  onListProfiles?: () => void;
  onCreateProfile?: (n: string, v?: any) => void;
  onRenameProfile?: (o: string, n: string) => void;
  onDuplicateProfile?: (n: string, nn: string) => void;
  onDeleteProfile?: (n: string) => void;
  onSelectProfile?: (n: string) => void;
}) {
  const activeProfile = data?.activeProfile || 'local';
  const fixAgent = data?.fixAgent || '-';
  const reviewAgent = data?.reviewAgent || '-';

  const tabItems = useMemo(() => [
    {
      key: 'cli',
      label: 'CLI 配置',
      children: (
        <CliConfigForm initial={data?.nonSensitive} onSave={onSave} queueRunning={data?.queueRunning} activeProfile={data?.activeProfile} />
      ),
    },
    {
      key: 'keys',
      label: 'LLM Keys',
      children: (
        <Card size="small" title="LLM Keys 状态" style={{ maxWidth: 620 }}>
          <LlmKeyForm initial={data || {}} onSave={onSave} providerTests={providerTests} onTestProvider={onTestProvider} workerCliTests={workerCliTests} onTestWorkerCli={onTestWorkerCli} queueRunning={data?.queueRunning} />
        </Card>
      ),
    },
    {
      key: 'queue',
      label: '队列默认值',
      children: (
        <Card size="small" title="队列默认值">
          <QueueDefaultsView data={queueDefaultsData} preview={queuePreview} onPreview={onPreviewQueue || (() => {})} applyResult={queueApply} onApply={onApplyQueue || (() => {})} settingsData={data} />
        </Card>
      ),
    },
    {
      key: 'diagnostics',
      label: 'Diagnostics',
      children: (
        <Card size="small" title="Diagnostics（只读）" style={{ maxWidth: 720 }}>
          <DiagnosticsView data={diagnosticsData} onRefresh={onRefreshDiagnostics || (() => {})} />
        </Card>
      ),
    },
    {
      key: 'profiles',
      label: 'Profiles',
      children: (
        <Card size="small" title="Profiles 管理" style={{ maxWidth: 800 }}>
          <ProfileCrudView
            data={profilesData}
            queueRunning={data?.queueRunning}
            activeProfile={data?.activeProfile}
            onList={onListProfiles || (() => {})}
            onCreate={onCreateProfile || (() => {})}
            onRename={onRenameProfile || (() => {})}
            onDuplicate={onDuplicateProfile || (() => {})}
            onDelete={onDeleteProfile || (() => {})}
            onSelect={onSelectProfile || (() => {})}
          />
        </Card>
      ),
    },
  ], [data, onSave, providerTests, onTestProvider, workerCliTests, onTestWorkerCli, queueDefaultsData, queuePreview, onPreviewQueue, queueApply, onApplyQueue, diagnosticsData, onRefreshDiagnostics, profilesData, onListProfiles, onCreateProfile, onRenameProfile, onDuplicateProfile, onDeleteProfile, onSelectProfile]);

  const footer = (
    <Card size="small" title="设置导入/导出（redacted）" style={{ maxWidth: 720 }}>
      <RedactedImportExport
        exportedSettings={exportedSettings}
        importResult={importResult}
        onExportSettings={onExportSettings}
        onImportSettings={onImportSettings}
      />
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
        非敏感配置通过 /api/agent-loop/settings 持久化；LLM key 仅暴露 configured 状态（此 web 切片不支持秘密保存/清除）。队列 defaults 支持预览后确认 apply 写入；仅 owned 支持键；secrets 拒绝；写后 JSON + tasks 校验。
      </Text>
    </Card>
  );

  // Use layout for visual consistency with suggested notes (summary + tabs)
  return (
    <SettingsLayout
      title="AgentLoop 设置中心"
      summary={{ activeProfile, fixAgent, reviewAgent }}
      tabs={<Tabs defaultActiveKey="cli" items={tabItems} />}
      footer={footer}
    />
  );
}

export default SettingsView;
