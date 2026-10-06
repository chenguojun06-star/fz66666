import React from 'react';
import { Card, Typography } from 'antd';
import { FileExcelOutlined, FileZipOutlined } from '@ant-design/icons';
import { TAB_CONFIGS } from './tabConfigs';
import PersistentTabs from '@/components/common/PersistentTabs';
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
          通过 Excel 批量导入，快速搬家到系统。推荐顺序：款式 → 供应商 → 客户 → 物料主档 → 期初库存（物料/成品） → 员工 → 工序；老系统导出的表格可不打乱原格式，直接用「智能识别」导入
        </Text>
      </div>

      <Card>
        <PersistentTabs
          paramName="tab"
          defaultKey="zip-style"
          size="large"
          items={[
            {
              key: 'zip-style',
              label: (
                <span>
                  <FileZipOutlined />
                  <span className="u-ml-6">款式 + 图片批量导入</span>
                </span>
              ),
              children: <ZipImportPanel />,
            },
            ...TAB_CONFIGS.map((config) => ({
              key: config.key,
              label: (
                <span>
                  {config.icon}
                  <span className="u-ml-6">{config.label}</span>
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
