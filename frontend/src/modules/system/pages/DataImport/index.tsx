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

// ==================== 导入面板组件 ====================

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
                if (file.size > 10 * 1024 * 1024) {
                  message.error('文件大小不能超过10MB');
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
        <Tabs defaultActiveKey="style" size="large">
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
