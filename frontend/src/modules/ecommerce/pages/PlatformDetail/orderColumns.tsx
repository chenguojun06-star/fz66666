import React from 'react';
import { Button, Space, Tag, Typography, Popover } from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, LinkOutlined, CarOutlined, SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import StyleImageCell from '@/components/common/StyleImageCell';
import ProductionProgressHoverCard from '@/components/common/ProductionProgressHoverCard';
import type { StyleImageMap } from '@/hooks/useStyleCoverImages';
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

export interface OrderColumnsArgs extends OrderColumnsHandlers {
  imageMap: StyleImageMap;
}

export function buildOrderColumns(args: OrderColumnsArgs): ColumnsType<EcOrder> {
  const { imageMap, setDetail, setLinkTarget, setOutboundTarget, setExpressOrderTarget, setExpressModalOpen } = args;
  return [
    {
      title: '订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div className="u-fw-600">{v || r.orderNo}</div>
          {v && <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>内部 {r.orderNo}</div>}
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
      title: '款式图', width: 68, align: 'center' as const,
      render: (_: unknown, r: EcOrder) => {
        const styleNo = (r.skuCode || '').split('-')[0];
        return <StyleImageCell styleNo={styleNo} imageMap={imageMap} />;
      },
    },
    {
      title: '商品 / 买家', width: 200,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div>{r.productName || '-'} <Text type="secondary">×{r.quantity}</Text></div>
          {r.skuCode && <div className="u-fs-14" style={{ color: 'var(--color-success)' }}>SKU {r.skuCode}</div>}
          <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div className="u-fw-600" style={{ color: 'var(--color-warning)' }}>¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div className="u-fs-14" style={{ color: 'var(--color-text-quaternary)' }}>运费 ¥{r.freight}</div> : null}
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
      render: v => v
        ? (
          <Popover
            placement="right"
            mouseEnterDelay={0.3}
            content={
              <div style={{ width: 260 }}>
                <ProductionProgressHoverCard productionOrderNo={v} />
              </div>
            }
          >
            <Tag color="blue" icon={<CheckCircleOutlined />} style={{ cursor: 'help' }}>{v}</Tag>
          </Popover>
        )
        : <Text type="secondary">未关联</Text>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v ? <div><div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>{r.expressCompany}</div><div>{v}</div></div> : <Text type="secondary">-</Text>,
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
