import React from 'react';
import { Button, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

interface Props {
  orderNo: string;
}

/**
 * 采购快速面板 — NodeDetailModal 采购节点专用 Tab
 * 功能：跳转到物料采购页（自动带入订单号过滤）
 * 领取/智能领取等复杂操作在物料采购页完成，无需在弹窗内重复实现
 */
const ProcurementQuickPanel: React.FC<Props> = ({ orderNo }) => {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(`/production/material?orderNo=${encodeURIComponent(orderNo)}`);
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ color: '#555', marginBottom: 16, fontSize: 13 }}>
        物料采购详情（领取、出库、采购进度）请在物料采购页操作，系统已按订单号自动过滤。
      </div>
      <Space>
        <Button type="primary" onClick={handleNavigate}>
          前往物料采购 →
        </Button>
      </Space>
    </div>
  );
};

export default ProcurementQuickPanel;
