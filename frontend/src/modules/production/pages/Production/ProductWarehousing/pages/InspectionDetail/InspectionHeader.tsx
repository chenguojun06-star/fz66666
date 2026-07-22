import React from 'react';
import { Button, Tag } from 'antd';
import { ArrowLeftOutlined, InboxOutlined } from '@ant-design/icons';
import type { QualityBriefingData } from './types';

interface InspectionHeaderProps {
  order: QualityBriefingData['order'];
  plateTypeKey: string;
  urgencyKey: string;
  qcStatsCount: number;
  pendingWarehouse: number;
  onBack: () => void;
  onWarehouse: () => void;
}

const InspectionHeader: React.FC<InspectionHeaderProps> = ({
  order,
  plateTypeKey,
  urgencyKey,
  qcStatsCount,
  pendingWarehouse,
  onBack,
  onWarehouse,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
      <span style={{ fontWeight: 600, fontSize: 16 }}>质检入库 - {order.orderNo}</span>
      {(plateTypeKey === 'FIRST') && <Tag color="blue">首</Tag>}
      {(plateTypeKey === 'REORDER' || plateTypeKey === 'REPLATE') && <Tag color="purple">翻</Tag>}
      {(urgencyKey === 'urgent') && <Tag color="red">急</Tag>}
      {(urgencyKey === 'normal') && <Tag>普</Tag>}
      <Tag color="blue">{order.styleNo}</Tag>
      <Tag color="green">{order.styleName}</Tag>
      {qcStatsCount > 0 && <Tag color="cyan">已质检 {qcStatsCount} 次</Tag>}
      <div style={{ flex: 1 }} />
      <Button
        type="primary"
        icon={<InboxOutlined />}
        disabled={pendingWarehouse === 0}
        onClick={onWarehouse}
      >
        入库{pendingWarehouse > 0 ? `（${pendingWarehouse}条待入库）` : ''}
      </Button>
    </div>
  );
};

export default InspectionHeader;
