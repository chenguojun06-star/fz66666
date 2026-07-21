import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, LinkOutlined, CarOutlined, SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { STATUS_MAP, WH_MAP } from './helpers';
import type { EcOrder } from './types';

const { Text } = Typography;

export interface OrderColumnsHandlers {
  setDetail: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setLinkTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setOutboundTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setExpressOrderTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setExpressModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function buildOrderColumns(handlers: OrderColumnsHandlers): ColumnsType<EcOrder> {
  const { setDetail, setLinkTarget, setOutboundTarget, setExpressOrderTarget, setExpressModalOpen } = handlers;
  return [
    {
      title: '订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v || r.orderNo}</div>
          {v && <div style={{ fontSize: 14, color: '#888' }}>内部 {r.orderNo}</div>}
        </div>
      ),
    },
    {
      title: '款号', width: 110,
      render: (_: unknown, r: EcOrder) => {
        const styleNo = (r.skuCode || '').split('-')[0];
        return styleNo ? <Text strong style={{ fontFamily: 'monospace' }}>{styleNo}</Text> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: '商品 / 买家', width: 200,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div>{r.productName || '-'} <Text type="secondary">×{r.quantity}</Text></div>
          {r.skuCode && <div style={{ fontSize: 14, color: 'var(--color-success)' }}>SKU {r.skuCode}</div>}
          <div style={{ fontSize: 14, color: '#888' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div style={{ fontSize: 14, color: '#aaa' }}>运费 ¥{r.freight}</div> : null}
        </div>
      ),
    },
    {
      title: '订单状态', dataIndex: 'status', width: 90,
      render: v => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '仓库状态', dataIndex: 'warehouseStatus', width: 90,
      render: v => <Tag color={WH_MAP[v]?.color}>{WH_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '关联生产单', dataIndex: 'productionOrderNo', width: 140,
      render: v => v ? <Tag color="blue" icon={<CheckCircleOutlined />}>{v}</Tag> : <Text type="secondary">未关联</Text>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v ? <div><div style={{ fontSize: 14, color: '#888' }}>{r.expressCompany}</div><div>{v}</div></div> : <Text type="secondary">-</Text>,
    },
    {
      title: '下单时间', dataIndex: 'createTime', width: 110,
      render: v => <span>{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 120, fixed: 'right',
      render: (_: unknown, r: EcOrder) => (
        <Space size={4}>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} />
          <Button type="text" icon={<LinkOutlined />} disabled={!!r.productionOrderNo} onClick={() => setLinkTarget(r)} />
          {(r.warehouseStatus ?? 0) < 2 && <Button type="text" icon={<CarOutlined />} onClick={() => setOutboundTarget(r)} />}
          <Button type="text" icon={<SendOutlined />} disabled={!!r.trackingNo} onClick={() => { setExpressOrderTarget(r); setExpressModalOpen(true); }} />
        </Space>
      ),
    },
  ];
}
