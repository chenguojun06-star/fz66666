/**
 * ProductionProgressHoverCard —— 销售端/电商端悬浮卡中的"生产进度"面板
 *
 * 让销售端直接看到：这单对应的生产单做到哪一步了、完成度多少、
 * 交期还剩几天有没有风险、成品库存够不够发。
 *
 * 数据来源：GET /production/orders/brief（只读真实落库数据）。
 * 未关联 / 查询失败时明确显示原因，不做任何数值兜底。
 */
import React from 'react';
import { Tag, Progress } from 'antd';

import { useProductionBrief } from '@/hooks/useEcProductionLink';
import {
  InfoRow,
  LinkEmpty,
  SectionTitle,
  num,
} from '@/components/common/LinkPanelParts';

interface Props {
  productionOrderNo?: string | null;
}

const RISK_COLOR: Record<string, string> = {
  done: 'var(--color-success)',
  normal: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  unknown: 'var(--color-text-muted)',
};

const ProductionProgressHoverCard: React.FC<Props> = ({ productionOrderNo }) => {
  const { data, loading, error } = useProductionBrief(productionOrderNo);

  if (!productionOrderNo) {
    return <LinkEmpty text="该订单尚未关联生产单" />;
  }

  if (loading) return <LinkEmpty text="读取中…" />;
  if (error) return <LinkEmpty text={`读取失败：${error}`} danger />;
  if (!data) return <LinkEmpty text="暂无数据" />;
  if (!data.linked) return <LinkEmpty text={data.reason || '未找到该生产订单'} />;

  const progress = data.productionProgress;
  const riskColor = RISK_COLOR[data.delivery?.riskLevel ?? 'unknown'] ?? 'var(--color-text-muted)';

  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <SectionTitle
        right={
          data.statusText ? (
            <Tag color="blue" style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '16px', borderRadius: 10 }}>
              {data.statusText}
            </Tag>
          ) : null
        }
      >
        生产进度
      </SectionTitle>

      <InfoRow label="生产单号" value={data.orderNo} strong />
      <InfoRow label="当前工序" value={data.currentProcess} />

      {/* 完成度：只有后端给出真实 progress 时才画进度条 */}
      {progress === null || progress === undefined ? (
        <InfoRow label="完成度" value={null} />
      ) : (
        <div style={{ margin: '6px 0 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)' }}>
            <span>完成度</span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{progress}%</span>
          </div>
          <Progress
            percent={progress}
            showInfo={false}
            strokeWidth={6}
            strokeColor="var(--color-primary)"
            trailColor="var(--color-bg-subtle)"
            style={{ marginBottom: 0 }}
          />
        </div>
      )}

      <InfoRow
        label="完成 / 订单"
        value={
          data.completedQuantity === null || data.completedQuantity === undefined
            ? null
            : `${data.completedQuantity} / ${num(data.orderQuantity, '')} 件`
        }
      />
      <InfoRow label="工厂" value={data.factoryName} />
      <InfoRow label="物料到位" value={data.materialArrivalRate === null || data.materialArrivalRate === undefined ? null : `${data.materialArrivalRate}%`} />
      <InfoRow label="计划交期" value={data.plannedEndDate} />

      {data.delivery && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: 1.7 }}>
          <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>交期状态</span>
          <span style={{ color: riskColor, fontWeight: 600, textAlign: 'right' }}>
            {data.delivery.riskText}
          </span>
        </div>
      )}

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
        </>
      )}
    </div>
  );
};

export default React.memo(ProductionProgressHoverCard);
