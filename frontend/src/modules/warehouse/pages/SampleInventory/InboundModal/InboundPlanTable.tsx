import React from 'react';
import { Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { InboundPlanRow } from './types';

interface InboundPlanTableProps {
  prefillLoading: boolean;
  planRows?: InboundPlanRow[];
}

const InboundPlanTable: React.FC<InboundPlanTableProps> = ({ prefillLoading, planRows }) => {
  if (prefillLoading) {
    return <Alert type="info" showIcon title="正在从样衣开发与码数配置中匹配颜色、尺码、数量…" />;
  }
  if (planRows?.length) {
    return (
      <ResizableTable<InboundPlanRow>
        rowKey="key"
        pagination={false}
        emptyDescription="暂无入库数据"
        dataSource={planRows}
        columns={[
          { title: '颜色', dataIndex: 'color', key: 'color', width: 160 },
          { title: '尺码', dataIndex: 'size', key: 'size', width: 160 },
          { title: '系统入库数量', dataIndex: 'quantity', key: 'quantity', width: 160 },
        ]}
      />
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      title="未识别到样衣生产的颜色、尺码、数量配置，当前不允许手工填写入库明细。请先回样衣开发补齐码数配置后再入库。"
    />
  );
};

export default InboundPlanTable;
