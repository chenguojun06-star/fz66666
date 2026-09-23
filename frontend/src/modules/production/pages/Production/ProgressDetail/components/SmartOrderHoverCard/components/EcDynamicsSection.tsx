/**
 * EcDynamicsSection —— 生产端悬浮卡中的"电商动态"区块
 *
 * 让生产端直接看到：这单对应的电商订单现在什么状态、发没发货、
 * 这款近 7 天卖了多少、库存联动数字（可用/在途/待发货占用）。
 *
 * 数据来源：GET /ecommerce/orders/brief-by-production（只读真实落库数据）。
 * 未关联 / 查询失败时明确显示原因，不做任何数值兜底。
 */
import React from 'react';
import { Tag } from 'antd';

import type { ProductionOrder } from '@/types/production';
import { getPlatformTag } from '@/utils/platform';
import { useEcBrief } from '@/hooks/useEcProductionLink';
import {
  InfoRow,
  LinkEmpty,
  MiniTrendBars,
  SectionTitle,
  num,
  type MiniTrendPoint,
} from '@/components/common/LinkPanelParts';

interface Props {
  order: ProductionOrder;
}

const statusColor = (status?: number | null): string => {
  switch (status) {
    case 1: return 'orange';
    case 2: return 'blue';
    case 3: return 'green';
    case 4: return 'default';
    case 5: return 'red';
    default: return 'default';
  }
};

const EcDynamicsSection: React.FC<Props> = ({ order }) => {
  // 仅在"这单与电商有关"时才请求：后端回填的 ecOrderNo，或已持久化的 platformCode。
  // 纯工厂单不渲染该区块，避免给生产端增加无关噪音与多余请求。
  const enabled = !!order.ecOrderNo || !!order.platformCode;
  const { data, loading, error } = useEcBrief(enabled ? order.orderNo : null);

  if (!enabled) return null;

  return (
    <div>
      <SectionTitle
        right={
          (order.ecPlatform || order.platformCode) ? (
            <Tag
              color={getPlatformTag(String(order.ecPlatform || order.platformCode)).color}
              style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '16px', borderRadius: 10 }}
            >
              {getPlatformTag(String(order.ecPlatform || order.platformCode)).label}
            </Tag>
          ) : null
        }
      >
        电商动态
      </SectionTitle>

      {loading && <LinkEmpty text="读取中…" />}

      {!loading && error && <LinkEmpty text={`读取失败：${error}`} danger />}

      {!loading && !error && data && !data.linked && (
        <LinkEmpty text={data.reason || '该生产单尚未关联电商订单'} />
      )}

      {!loading && !error && data?.linked && (
        <>
          <InfoRow label="电商单号" value={data.ecOrderNo} strong />
          {data.platformOrderNo && <InfoRow label="平台单号" value={data.platformOrderNo} />}
          {data.shopName && <InfoRow label="店铺" value={data.shopName} />}
          <InfoRow
            label="订单状态"
            value={data.statusText ? <Tag color={statusColor(data.status)} style={{ margin: 0 }}>{data.statusText}</Tag> : null}
          />
          <InfoRow label="仓库状态" value={data.warehouseStatusText} />
          <InfoRow label="下单数量" value={num(data.quantity, ' 件')} />
          <InfoRow
            label="实付金额"
            value={data.payAmount === null || data.payAmount === undefined ? null : `¥${data.payAmount}`}
          />
          <InfoRow label="发货时间" value={data.shipTime} />
          <InfoRow
            label="快递"
            value={
              data.trackingNo || data.expressCompany
                ? `${data.expressCompany || ''} ${data.trackingNo || ''}`.trim()
                : null
            }
          />
          {data.buyerRemark && <InfoRow label="买家备注" value={data.buyerRemark} />}

          {/* 近 7 天销量：来自真实出库流水逐日聚合 */}
          {data.salesTrend && data.salesTrend.length > 0 && (
            <>
              <SectionTitle
                right={
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                    合计 {data.salesTrend.reduce((s, p) => s + (p.quantity || 0), 0)} 件
                  </span>
                }
              >
                近 7 天销量
              </SectionTitle>
              <MiniTrendBars
                points={data.salesTrend.map<MiniTrendPoint>(p => ({
                  label: p.date,
                  value: p.quantity || 0,
                  tip: `${p.quantity || 0} 件 / ¥${p.amount ?? 0}`,
                }))}
              />
            </>
          )}

          {/* 库存联动：仓库 ↔ 电商的真实汇总 */}
          {data.stock && (
            <>
              <SectionTitle
                right={
                  data.stock.belowSafeStock ? (
                    <Tag color="red" style={{ margin: 0, fontSize: 11 }}>低于安全库存</Tag>
                  ) : null
                }
              >
                库存联动
              </SectionTitle>
              <InfoRow label="可用库存" value={num(data.stock.availableStock, ' 件')} strong />
              <InfoRow label="在途生产" value={num(data.stock.onWayProduction, ' 件')} />
              <InfoRow label="待发货占用" value={num(data.stock.pendingOrders, ' 件')} />
              <InfoRow label="累计入库" value={num(data.stock.totalWarehoused, ' 件')} />
              <InfoRow label="累计出库" value={num(data.stock.totalOutstock, ' 件')} />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(EcDynamicsSection);
