import React, { useRef } from 'react';
import { Card, Button, Alert, Space, Typography, Tag, Result as AntResult } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import { useImportPanel } from './useImportPanel';
import { validateExcelFile, toUploadFile } from './helpers';
import type { TabConfig } from './types';

const { Text, Paragraph } = Typography;

const ImportPanel: React.FC<{ config: TabConfig }> = ({ config }) => {
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const {
    fileList,
    uploading,
    result,
    setFileList,
    setResult,
    handleDownloadTemplate,
    handleUpload,
    handleReset,
  } = useImportPanel(config);

  // 失败记录表格列
  const failedColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
    ...(config.key === 'style'
      ? [{ title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 }]
      : config.key === 'factory'
      ? [{ title: '供应商名称', dataIndex: 'factoryName', key: 'factoryName', width: 150 }]
      : config.key === 'employee'
      ? [{ title: '姓名', dataIndex: 'name', key: 'name', width: 100 }]
      : [
          { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
          { title: '工序名', dataIndex: 'processName', key: 'processName', width: 120 },
        ]),
    {
      title: '错误原因',
      dataIndex: 'error',
      key: 'error',
      render: (text: string) => <Text type="danger">{text}</Text>,
    },
  ];

  return (
    <div>
      {/* 说明区域 */}
      <Card style={{ marginBottom: 16, background: '#f8f9fa' }}>
        <Paragraph style={{ marginBottom: 8 }}>
          <Text strong>{config.description}</Text>
        </Paragraph>
        <Paragraph style={{ marginBottom: 4 }}>
          <Text type="secondary">必填字段：{config.requiredFields}</Text>
        </Paragraph>
        {config.tips.map((tip, i) => (
          <Paragraph key={i} style={{ marginBottom: 2, paddingLeft: 12 }}>
            <Text type="secondary">• {tip}</Text>
          </Paragraph>
        ))}
      </Card>

      {/* 操作区域 */}
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* 步骤1：下载模板 */}
        <Card title="第一步：下载模板">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
            type="default"
          >
            下载 Excel 模板
          </Button>
          <Text type="secondary" style={{ marginLeft: 12 }}>
            模板中包含表头和示例数据，填写说明在第二个Sheet
          </Text>
        </Card>

        {/* 步骤2：上传文件 */}
        <Card title="第二步：上传数据">
          <Space orientation="vertical" style={{ width: '100%' }}>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const err = validateExcelFile(f);
                if (err) {
                  message.error(err);
                  if (excelInputRef.current) excelInputRef.current.value = '';
                  return;
                }
                setFileList([toUploadFile(f)]);
                setResult(null);
                if (excelInputRef.current) excelInputRef.current.value = '';
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                const err = validateExcelFile(f);
                if (err) { message.error(err); return; }
                setFileList([toUploadFile(f)]);
                setResult(null);
              }}
              style={{ display: 'inline-block' }}
            >
              <Button icon={<UploadOutlined />} onClick={() => excelInputRef.current?.click()}>
                {fileList.length > 0 ? `已选择: ${fileList[0].name}` : '选择 Excel 文件'}
              </Button>
              {fileList.length > 0 && (
                <Button size="small" style={{ marginLeft: 8 }} onClick={() => { setFileList([]); setResult(null); }}>
                  移除
                </Button>
              )}
            </div>

            <Space>
              <Button
                type="primary"
                icon={<FileExcelOutlined />}
                onClick={handleUpload}
                loading={uploading}
                disabled={fileList.length === 0}
              >
                {uploading ? '导入中...' : '开始导入'}
              </Button>
              {result && (
                <Button onClick={handleReset}>重新导入</Button>
              )}
            </Space>
          </Space>
        </Card>

        {/* 导入结果 */}
        {result && (
          <Card title="导入结果">
            {result.failedCount === 0 ? (
              <AntResult
                status="success"
                title={result.message}
                subTitle={`共 ${result.total} 条数据，全部导入成功`}
                style={{ padding: '12px 0' }}
              />
            ) : (
              <>
                <Alert
                  type={result.successCount > 0 ? 'warning' : 'error'}
                  showIcon
                  title={result.message}
                  description={
                    <Space>
                      <Tag icon={<CheckCircleOutlined />} color="success">
                        成功 {result.successCount} 条
                      </Tag>
                      <Tag icon={<CloseCircleOutlined />} color="error">
                        失败 {result.failedCount} 条
                      </Tag>
                      <Text type="secondary">（共 {result.total} 条）</Text>
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

export default ImportPanel;
