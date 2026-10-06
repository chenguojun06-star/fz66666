import React, { useRef, useState } from 'react';
import { Card, Button, Alert, Space, Typography, Tag, Result as AntResult, Segmented } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import { useImportPanel } from './useImportPanel';
import { validateExcelFile, toUploadFile } from './helpers';
import SmartImportPanel from './SmartImportPanel';
import type { TabConfig } from './types';

const { Text, Paragraph } = Typography;

const errorCellRender = (text: string) => <Text type="danger">{text}</Text>;

/** 旧四类页签的失败定位列（key 约定不变） */
const legacyFailedColumns = (key: TabConfig['key']) => [
  { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
  ...(key === 'style'
    ? [{ title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 }]
    : key === 'factory'
    ? [{ title: '供应商名称', dataIndex: 'factoryName', key: 'factoryName', width: 150 }]
    : key === 'employee'
    ? [{ title: '姓名', dataIndex: 'name', key: 'name', width: 100 }]
    : [
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
        { title: '工序名', dataIndex: 'processName', key: 'processName', width: 120 },
      ]),
  { title: '错误原因', dataIndex: 'error', key: 'error', render: errorCellRender },
];

const ImportPanel: React.FC<{ config: TabConfig }> = ({ config }) => {
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  // D-751 二期：同一页签两种导入方式——按模板（默认）或智能识别任意格式
  const [mode, setMode] = useState<'template' | 'smart'>('template');
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

  // 失败记录表格列：配置了 failedColumns 用之，否则按旧 key 约定兜底
  const failedColumns = config.failedColumns
    ? [
        { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
        ...config.failedColumns,
        {
          title: '错误原因',
          dataIndex: 'error',
          key: 'error',
          render: (text: string) => <Text type="danger">{text}</Text>,
        },
      ]
    : legacyFailedColumns(config.key);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'template' | 'smart')}
          options={[
            { value: 'template', label: <span><FileTextOutlined className="u-mr-6" />按模板导入</span> },
            { value: 'smart', label: <span><ThunderboltOutlined className="u-mr-6" />智能识别（任意格式）</span> },
          ]}
        />
      </div>
      {mode === 'smart' && <SmartImportPanel config={config} />}
      {mode === 'template' && (
      <>
      {/* 说明区域 */}
      <Card style={{ marginBottom: 16, background: 'var(--color-slate-50)' }}>
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
              className="u-d-inline-block"
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
      </>
      )}
    </div>
  );
};

export default ImportPanel;
