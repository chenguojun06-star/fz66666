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
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircleFilled style={{ color: 'var(--color-success)' }} />
          实时预览
        </div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 8 }}>
          以下为根据当前跳码配置自动计算的放码结果，蓝色加粗为基准码
        </div>
        <Table
          dataSource={previewData}
          columns={columns}
          pagination={false}
          size="small"
          bordered
          scroll={{ x: 'max-content' }}
          style={{ fontSize: 13 }}
        />
      </div>
    </>
  );
};

export default PreviewSection;
