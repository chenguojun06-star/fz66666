import React, { useState, useCallback } from 'react';
import {
  Tabs,
  Card,
  Button,
  Upload,
  Alert,
  Table,
  Space,
  Typography,
  Tag,
  message,
  Result as AntResult,
  Progress,
  Steps,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SkinOutlined,
  TeamOutlined,
  ToolOutlined,
  ShopOutlined,
  FileZipOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import Layout from '@/components/Layout';
import { dataImportService } from '@/services/system/dataImport';
import type { ImportResult } from '@/services/system/dataImport';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

// ==================== 类型定义 ====================

type ImportType = 'style' | 'factory' | 'employee' | 'process';

interface TabConfig {
  key: ImportType;
  label: string;
  icon: React.ReactNode;
  description: string;
  requiredFields: string;
  tips: string[];
}

const TAB_CONFIGS: TabConfig[] = [
  {
    key: 'style',
    label: '款式资料',
    icon: <SkinOutlined />,
    description: '导入款式基础信息，包括款号、款名、品类、颜色、码数等',
    requiredFields: '款号（必填）',
    tips: [
      '款号必须唯一，重复的款号会导入失败',
      '颜色和码数支持多个，用逗号分隔（如：红色,白色）',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'factory',
    label: '供应商',
    icon: <ShopOutlined />,
    description: '导入合作供应商/工厂信息',
    requiredFields: '供应商名称（必填）',
    tips: [
      '供应商名称必须唯一',
      '导入后默认为"启用"状态',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'employee',
    label: '员工',
    icon: <TeamOutlined />,
    description: '导入员工/工人信息，系统自动创建账号',
    requiredFields: '姓名（必填）',
    tips: [
      '系统会自动生成用户名',
      '默认密码为 123456，请通知员工修改',
      '角色默认为"普通用户"',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'process',
    label: '工序',
    icon: <ToolOutlined />,
    description: '为已有款式导入工序模板（裁剪、车缝等）',
    requiredFields: '款号 + 工序名称（必填）',
    tips: [
      '款号必须是系统中已存在的，请先导入款式',
      '同一款号下可以有多道工序',
      '工序编码为空时会自动生成 P1, P2...',
      '进度节点可选：采购/裁剪/车缝/尾部/入库',
    ],
  },
];

// ==================== ZIP 批量导入组件（款式+图片） ====================

const ZipImportPanel: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleUpload = useCallback(async () => {
    if (fileList.length === 0) { message.warning('请先选择 ZIP 文件'); return; }
    const file = fileList[0].originFileObj as RcFile;
    if (!file) { message.error('文件读取失败，请重新选择'); return; }

    setUploading(true);
    setProgress(0);
    setResult(null);
    try {
      const res = await dataImportService.uploadZip(file, setProgress);
      setResult(res);
      setProgress(100);
      if (res.failedCount === 0) message.success(res.message);
      else message.warning(res.message);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '导入失败，请检查 ZIP 文件内容');
    } finally {
      setUploading(false);
    }
  }, [fileList]);

  const failedColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    { title: '错误原因', dataIndex: 'error', key: 'error', render: (t: string) => <Text type="danger">{t}</Text> },
  ];

  return (
    <div>
      {/* 说明 */}
      <Card size="small" style={{ marginBottom: 16, background: '#f0f7ff', border: '1px solid #91caff' }}>
        <Paragraph style={{ marginBottom: 8 }}>
          <Text strong><FileZipOutlined style={{ marginRight: 6 }} />ZIP 打包导入：一次性导入款式数据 + 封面图片</Text>
        </Paragraph>
        <Steps
          size="small"
          style={{ marginBottom: 12 }}
          items={[
            { title: '下载 Excel 模板', description: '填写款式数据' },
            { title: '准备图片', description: '文件名 = 款号（如 FZ2024001.jpg）' },
            { title: '打包 ZIP', description: 'Excel + 图片一起压缩' },
            { title: '上传导入', description: '系统自动解析并关联' },
          ]}
        />
        <Space direction="vertical" size={2}>
          <Text type="secondary">• 图片命名规则：<Text code>款号.jpg</Text>（或 .png .webp），图片文件名 = 款号，系统自动关联为封面图</Text>
          <Text type="secondary">• Excel 格式与"款式资料"Tab 完全相同，可下载同一份模板</Text>
          <Text type="secondary">• 支持格式：<Text code>jpg / jpeg / png / gif / webp</Text>；ZIP 包最大 <Text strong>500MB</Text></Text>
          <Text type="secondary">• 图片上传失败不影响款式数据导入，会单独提示</Text>
        </Space>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 下载模板 */}
        <Card size="small" title="第一步：下载款式 Excel 模板">
          <Button icon={<DownloadOutlined />} onClick={() => {
            const url = dataImportService.getTemplateUrl('style');
            const a = document.createElement('a'); a.href = url; a.download = '';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }}>下载 Excel 模板</Button>
          <Text type="secondary" style={{ marginLeft: 12 }}>填写款式数据后，与图片一起压缩成 ZIP</Text>
        </Card>

        {/* 上传 ZIP */}
        <Card size="small" title={<span><PictureOutlined style={{ marginRight: 6 }} />第二步：上传 ZIP 包</span>}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
                if (!isZip) { message.error('仅支持 .zip 格式'); return Upload.LIST_IGNORE; }
                if (file.size > 500 * 1024 * 1024) { message.error('ZIP 包不能超过 500MB'); return Upload.LIST_IGNORE; }
                setFileList([{ ...file, uid: file.uid, name: file.name, originFileObj: file } as UploadFile]);
                setResult(null);
                return false;
              }}
              onRemove={() => { setFileList([]); setResult(null); }}
              maxCount={1}
              accept=".zip"
            >
              <Button icon={<FileZipOutlined />}>选择 ZIP 文件</Button>
            </Upload>

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
          <Card size="small" title="导入结果">
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
                  message={result.message}
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
                <Table
                  dataSource={result.failedRecords as Record<string, unknown>[]}
                  columns={failedColumns}
                  rowKey="row"
                  size="small"
                  pagination={false}
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

const ImportPanel: React.FC<{ config: TabConfig }> = ({ config }) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleDownloadTemplate = useCallback(() => {
    const url = dataImportService.getTemplateUrl(config.key);
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [config.key]);

  const handleUpload = useCallback(async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    const file = fileList[0].originFileObj as RcFile;
    if (!file) {
      message.error('文件读取失败，请重新选择');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const res = await dataImportService.upload(config.key, file);
      setResult(res);
      if (res.failedCount === 0) {
        message.success(res.message);
      } else {
        message.warning(res.message);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '导入失败，请检查文件格式';
      message.error(errorMsg);
    } finally {
      setUploading(false);
    }
  }, [fileList, config.key]);

  const handleReset = useCallback(() => {
    setFileList([]);
    setResult(null);
  }, []);

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
      <Card size="small" style={{ marginBottom: 16, background: '#f8f9fa' }}>
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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 步骤1：下载模板 */}
        <Card size="small" title="第一步：下载模板">
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
        <Card size="small" title="第二步：上传数据">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                const isExcel =
                  file.type ===
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                  file.type === 'application/vnd.ms-excel' ||
                  file.name.endsWith('.xlsx') ||
                  file.name.endsWith('.xls');
                if (!isExcel) {
                  message.error('仅支持 .xlsx 或 .xls 格式的Excel文件');
                  return Upload.LIST_IGNORE;
                }
                if (file.size > 5 * 1024 * 1024) {
                  message.error('文件大小不能超过5MB');
                  return Upload.LIST_IGNORE;
                }
                setFileList([{ ...file, uid: file.uid, name: file.name, originFileObj: file } as UploadFile]);
                setResult(null);
                return false; // 阻止自动上传
              }}
              onRemove={() => {
                setFileList([]);
                setResult(null);
              }}
              maxCount={1}
              accept=".xlsx,.xls"
            >
              <Button icon={<UploadOutlined />}>选择 Excel 文件</Button>
            </Upload>

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
          <Card size="small" title="导入结果">
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
                  message={result.message}
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
                <Table
                  dataSource={result.failedRecords as Record<string, unknown>[]}
                  columns={failedColumns}
                  rowKey="row"
                  size="small"
                  pagination={false}
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

// ==================== 主页面 ====================

const DataImport: React.FC = () => {
  return (
    <Layout>
      <div style={{ padding: '0 0 24px' }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          <FileExcelOutlined style={{ marginRight: 8 }} />
          数据导入
        </Title>
        <Text type="secondary">
          通过 Excel 批量导入基础数据，快速初始化您的账号。请按顺序导入：款式 → 供应商 → 员工 → 工序
        </Text>
      </div>

      <Card>
        <Tabs defaultActiveKey="zip-style" size="large">
          {/* ZIP 图片包导入 */}
          <TabPane
            key="zip-style"
            tab={
              <span>
                <FileZipOutlined />
                <span style={{ marginLeft: 6 }}>款式 + 图片批量导入</span>
              </span>
            }
          >
            <ZipImportPanel />
          </TabPane>

          {/* 普通 Excel 导入 */}
          {TAB_CONFIGS.map((config) => (
            <TabPane
              key={config.key}
              tab={
                <span>
                  {config.icon}
                  <span style={{ marginLeft: 6 }}>{config.label}</span>
                </span>
              }
            >
              <ImportPanel config={config} />
            </TabPane>
          ))}
        </Tabs>
      </Card>
    </Layout>
  );
};

export default DataImport;
