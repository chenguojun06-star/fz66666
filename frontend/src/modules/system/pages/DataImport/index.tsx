import React from 'react';
import { Tabs, Card, Typography } from 'antd';
import { FileExcelOutlined, FileZipOutlined } from '@ant-design/icons';
import { TAB_CONFIGS } from './tabConfigs';
import ZipImportPanel from './ZipImportPanel';
import ImportPanel from './ImportPanel';

const { Title, Text } = Typography;

const DataImport: React.FC = () => {
  return (
    <>
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
        <Tabs
          defaultActiveKey="zip-style"
          size="large"
          items={[
            {
              key: 'zip-style',
              label: (
                <span>
                  <FileZipOutlined />
                  <span style={{ marginLeft: 6 }}>款式 + 图片批量导入</span>
                </span>
              ),
              children: <ZipImportPanel />,
            },
            ...TAB_CONFIGS.map((config) => ({
              key: config.key,
              label: (
                <span>
                  {config.icon}
                  <span style={{ marginLeft: 6 }}>{config.label}</span>
                </span>
              ),
              children: <ImportPanel config={config} />,
            })),
          ]}
        />
      </Card>
    </>
  );
};

export default DataImport;
