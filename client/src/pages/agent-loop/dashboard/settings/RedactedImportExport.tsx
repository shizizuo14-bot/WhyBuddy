import { Button, Upload, Space, Alert, Typography, message } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { RedactedImportExportProps } from './types';

const { Text } = Typography;

// Shared redacted import/export card/footer for settings.
export function RedactedImportExport({ exportedSettings, importResult, onExportSettings, onImportSettings }: RedactedImportExportProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space>
        <Button icon={<DownloadOutlined />} onClick={() => onExportSettings && onExportSettings()}>导出设置</Button>
        <Upload
          accept=".json,application/json"
          showUploadList={false}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const txt = (e.target && (e.target as any).result) || '';
              if (txt) onImportSettings && onImportSettings(String(txt));
            };
            reader.readAsText(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>导入设置</Button>
        </Upload>
      </Space>

      {exportedSettings && (
        <div style={{ marginTop: 12 }}>
          <Text strong>导出内容（secret 字段为状态，非明文）:</Text>
          <pre style={{ background: '#fafafa', padding: 8, fontSize: 12, maxHeight: 160, overflow: 'auto', borderRadius: 4 }}>{JSON.stringify(exportedSettings, null, 2)}</pre>
          <Space size={8}>
            <Button size="small" onClick={() => { try { navigator.clipboard?.writeText(JSON.stringify(exportedSettings, null, 2)); message.success('已复制'); } catch {} }}>复制</Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              try {
                const dataStr = JSON.stringify(exportedSettings, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'agentloop-settings-redacted.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                message.success('已下载');
              } catch {}
            }}>下载文件</Button>
          </Space>
        </div>
      )}

      {importResult && (
        <div style={{ marginTop: 12 }}>
          {importResult.ok ? (
            <Alert type="success" showIcon message="导入成功" />
          ) : (
            <Alert type="error" showIcon message={importResult.error || '导入失败'} />
          )}
        </div>
      )}
    </Space>
  );
}

export { RedactedImportExport as RedactedImportExportPanel };
export default RedactedImportExport;
