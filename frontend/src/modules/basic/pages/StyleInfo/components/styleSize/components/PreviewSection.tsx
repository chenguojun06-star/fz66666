import React from 'react';
import { Table, Divider } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';

interface Props {
  previewData: Record<string, any>[];
  columns: any[];
}

const PreviewSection: React.FC<Props> = ({ previewData, columns }) => {
  if (previewData.length === 0) return null;
  return (
    <>
      <Divider style={{ margin: '12px 0' }} />
      <div className="u-mb-16">
        <div className="u-fw-600 u-mb-8 u-fs-15 u-d-flex u-ai-center u-gap-6">
          <CheckCircleFilled style={{ color: 'var(--color-success)' }} />
          实时预览
        </div>
        <div className="u-fs-13 u-mb-8" style={{ color: 'var(--color-text-tertiary)' }}>
          以下为根据当前跳码配置自动计算的放码结果，蓝色加粗为基准码
        </div>
        <Table
          dataSource={previewData}
          columns={columns}
          pagination={false}
          size="small"
          bordered
          style={{ fontSize: 13 }}
        />
      </div>
    </>
  );
};

export default PreviewSection;
