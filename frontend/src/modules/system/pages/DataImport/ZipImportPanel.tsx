import React, { useRef } from 'react';
import { Card, Button, Alert, Space, Typography, Tag, Result as AntResult, Progress, Steps } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  FileZipOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { dataImportService } from '@/services/system/dataImport';
import { message } from '@/utils/antdStatic';
import { useZipImport } from './useZipImport';
import { validateZipFile, toUploadFile } from './helpers';

const { Text, Paragraph } = Typography;

const ZipImportPanel: React.FC = () => {
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const {
    fileList,
    uploading,
    progress,
    result,
    setFileList,
    setProgress,
    setResult,
    handleUpload,
  } = useZipImport();

  const failedColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    { title: '错误原因', dataIndex: 'error', key: 'error', render: (t: string) => <Text type="danger">{t}</Text> },
  ];

  return (
    <div>
      {/* 说明 */}
      <Card style={{ marginBottom: 16, background: '#f0f7ff', border: '1px solid #91caff' }}>
        <Paragraph style={{ marginBottom: 8 }}>
          <Text strong><FileZipOutlined style={{ marginRight: 6 }} />ZIP 打包导入：一次性导入款式数据 + 封面图片</Text>
        </Paragraph>
        <Steps

          style={{ marginBottom: 12 }}
          items={[
            { title: '下载 Excel 模板', content: '填写款式数据' },
            { title: '准备图片', content: '文件名 = 款号（如 FZ2024001.jpg）' },
            { title: '打包 ZIP', content: 'Excel + 图片一起压缩' },
            { title: '上传导入', content: '系统自动解析并关联' },
          ]}
        />
        <Space orientation="vertical" size={2}>
          <Text type="secondary">• 图片命名规则：<Text code>款号.jpg</Text>（或 .png .webp），图片文件名 = 款号，系统自动关联为封面图</Text>
          <Text type="secondary">• Excel 格式与"款式资料"Tab 完全相同，可下载同一份模板</Text>
          <Text type="secondary">• 支持格式：<Text code>jpg / jpeg / png / gif / webp</Text>；ZIP 包最大 <Text strong>500MB</Text></Text>
          <Text type="secondary">• 图片上传失败不影响款式数据导入，会单独提示</Text>
        </Space>
      </Card>

      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* 下载模板 */}
        <Card title="第一步：下载款式 Excel 模板">
          <Button icon={<DownloadOutlined />} onClick={() => { void dataImportService.downloadTemplate('style'); }}>
            下载款式模板
          </Button>
        </Card>

        {/* 上传 ZIP */}
        <Card title={<span><PictureOutlined style={{ marginRight: 6 }} />第二步：上传 ZIP 包</span>}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const err = validateZipFile(f);
                if (err) {
                  message.error(err);
                  if (zipInputRef.current) zipInputRef.current.value = '';
                  return;
                }
                setFileList([toUploadFile(f)]);
                setResult(null);
                if (zipInputRef.current) zipInputRef.current.value = '';
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                const err = validateZipFile(f);
                if (err) { message.error(err); return; }
                setFileList([toUploadFile(f)]);
                setResult(null);
              }}
              style={{ display: 'inline-block' }}
            >
              <Button icon={<FileZipOutlined />} onClick={() => zipInputRef.current?.click()}>
                {fileList.length > 0 ? `已选择: ${fileList[0].name}` : '选择 ZIP 文件'}
              </Button>
              {fileList.length > 0 && (
                <Button size="small" style={{ marginLeft: 8 }} onClick={() => { setFileList([]); setResult(null); }}>
                  移除
                </Button>
              )}
            </div>

            {uploading && <Progress percent={progress} status="active" />}

            <Space>
              <Button type="primary" icon={<UploadOutlined />} onClick={handleUpload} loading={uploading} disabled={fileList.length === 0}>
                {uploading ? `上传中 ${progress}%...` : '开始导入'}
              </Button>
              {result && <Button onClick={() => { setFileList([]); setResult(null); setProgress(0); }}>重新导入</Button>}
            </Space>
          </Space>
        </Card>

        {/* 结果 */}
        {result && (
          <Card title="导入结果">
            {result.failedCount === 0 ? (
              <AntResult
                status="success"
                title={result.message}
                subTitle={
                  <Space>
                    <span>共 {result.total} 条款式</span>
                    {(result.withCoverCount ?? 0) > 0 && (
                      <Tag icon={<PictureOutlined />} color="blue">关联封面图 {result.withCoverCount} 张</Tag>
                    )}
                    {(result.imageCount ?? 0) > (result.withCoverCount ?? 0) && (
                      <Tag color="default">ZIP内图片 {result.imageCount} 张（未匹配 {(result.imageCount ?? 0) - (result.withCoverCount ?? 0)} 张）</Tag>
                    )}
                  </Space>
                }
                style={{ padding: '12px 0' }}
              />
            ) : (
              <>
                <Alert
                  type={result.successCount > 0 ? 'warning' : 'error'}
                  showIcon
                  title={result.message}
                  description={
                    <Space wrap>
                      <Tag icon={<CheckCircleOutlined />} color="success">成功 {result.successCount} 条</Tag>
                      <Tag icon={<CloseCircleOutlined />} color="error">失败 {result.failedCount} 条</Tag>
                      <Text type="secondary">（共 {result.total} 条）</Text>
                      {(result.withCoverCount ?? 0) > 0 && <Tag icon={<PictureOutlined />} color="blue">封面图 {result.withCoverCount} 张</Tag>}
                    </Space>
                  }
                  style={{ marginBottom: 12 }}
                />
                <ResizableTable
                  dataSource={result.failedRecords as Record<string, unknown>[]}
                  columns={failedColumns}
                  rowKey="row"

                  pagination={false}
                  emptyDescription="暂无数据"
                  scroll={{ y: 300 }}
                />
              </>
            )}
          </Card>
        )}
      </Space>
    </div>
  );
};

export default ZipImportPanel;
