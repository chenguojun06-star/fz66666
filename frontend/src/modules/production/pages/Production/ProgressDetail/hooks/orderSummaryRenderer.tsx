import type { CSSProperties } from 'react';
import React from 'react';
import { Badge, Popover, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import CardCoverSwitcher from '@/components/common/CardCoverSwitcher';
import SmartOrderHoverCard from '../components/SmartOrderHoverCard';
import { displayOrderStatus, displayDate } from '@/utils/display';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { ProductionOrder } from '@/types/production';
import { getOrderShipTime } from '../utils';
import { calcHealthScore } from './cellRendererHelpers';

export interface OrderSummaryContext {
  stagnantOrderIds?: Map<string, number>;
  openRemarkModal: (orderNo: string, merchandiser?: string) => void;
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
}

export function createOrderSummaryRender(ctx: OrderSummaryContext) {
  const { stagnantOrderIds, openRemarkModal, deliveryRiskMap } = ctx;
  return (_: any, record: ProductionOrder) => {
    const status = displayOrderStatus(record.status);
    const stagnantDays = stagnantOrderIds?.get(String(record.id));
    const shipTimeValue = getOrderShipTime(record);
    const shipDate = displayDate(shipTimeValue, 'date');
    const quantity = Number(record.orderQuantity || 0);
    const { text, color } = getRemainingDaysDisplay(record.plannedEndDate, record.createTime, record.actualEndDate, record.status);
    const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
    const merchandiserName = String((record as Record<string, unknown>).merchandiser || '').trim();
    const customerName = String((record as Record<string, unknown>).company || '').trim();
    const remark = String((record as Record<string, unknown>).remarks || '').trim();
    const softTagBaseStyle: CSSProperties = {
      margin: 0,
      fontSize: 12,
      border: 'none',
    };
    const softTagStyle = (background: string, foreground: string): CSSProperties => ({
      ...softTagBaseStyle,
      background,
      color: foreground,
    });
    const metaLabelStyle: CSSProperties = {
      color: 'var(--neutral-text-light, var(--color-slate-400))',
      whiteSpace: 'nowrap',
    };
    const metaValueStyle: CSSProperties = {
      color: 'var(--neutral-text, var(--color-slate-900))',
      fontWeight: 600,
      textAlign: 'left',
      whiteSpace: 'nowrap',
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 168, paddingRight: 6, paddingTop: 6, paddingBottom: 6, textAlign: 'left' }}>
          <div style={{ width: 162, minWidth: 162, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ position: 'relative', width: 148, height: 148, borderRadius: 14, overflow: 'hidden' }}>
              <CardCoverSwitcher
                styleId={record.styleId}
                styleNo={record.styleNo}
                src={(record as any).styleCover || null}
                fit="contain"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 24 }}>
              <Tag color={status.color} style={{ margin: 0, fontSize: 12 }}>{status.text}</Tag>
              {record.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 12 }}>急单</Tag>}
              {String(record.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 12 }}>首单</Tag>}
              {String(record.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 12 }}>翻单</Tag>}
              {(() => {
                const { score, level } = calcHealthScore(record);
                if (level === 'good') return null;
                return <Tag color={level === 'warn' ? 'orange' : 'red'} style={{ margin: 0, fontSize: 12 }}>{level === 'warn' ? `关注 ${score}` : `风险 ${score}`}</Tag>;
              })()}
              {stagnantDays !== undefined ? <Tag color="orange" style={{ margin: 0, fontSize: 12 }}>停滞 {stagnantDays} 天</Tag> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, paddingTop: 2, textAlign: 'left' }}>
            <OrderInfoGrid
              fontSize={12}
              column={1}
              items={[
                {
                  label: '订单号',
                  value: (
                    <Popover
                      content={<SmartOrderHoverCard order={record} />}
                      trigger="hover"
                      placement="rightTop"
                      mouseEnterDelay={0.3}
                      styles={{ root: { width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH } }}
                    >
                      <span style={{ ...metaValueStyle, cursor: 'pointer' }}>{String(record.orderNo || '').trim() || '-'}</span>
                    </Popover>
                  ),
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                },
                ...(merchandiserName ? [{
                  label: '跟单员',
                  value: (
                    <div
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRemarkModal(String(record.orderNo || ''), record.merchandiser);
                      }}
                    >
                      <span style={metaValueStyle}>{merchandiserName}</span>
                      {remark ? (
                        <Badge dot color="var(--color-danger)" offset={[-2, 2]}>
                          <ExclamationCircleOutlined style={{ fontSize: 12, color: 'var(--color-danger)' }} />
                        </Badge>
                      ) : null}
                    </div>
                  ),
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                }] : []),
                ...(customerName ? [{
                  label: '客户',
                  value: customerName,
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                }] : []),
                {
                  label: '总数',
                  value: `${quantity}件`,
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                },
                {
                  label: '交期',
                  value: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={metaValueStyle}>{shipDate}</span>
                      {text && text !== '已完成' && text !== '已报废' && text !== '已关单' && text !== '已取消' ? <span style={{ color, fontWeight: 600, fontSize: 12 }}>{text}</span> : null}
                    </span>
                  ),
                  labelStyle: { ...metaLabelStyle, fontWeight: 500 },
                },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {aiRisk ? (
                <Tooltip title={[aiRisk.riskDescription, aiRisk.predictedEndDate ? `预测完成：${aiRisk.predictedEndDate}` : ''].filter(Boolean).join(' · ')}>
                  <Tag color={aiRisk.riskLevel === 'overdue' ? 'error' : aiRisk.riskLevel === 'danger' ? 'volcano' : aiRisk.riskLevel === 'warning' ? 'warning' : 'success'} style={aiRisk.riskLevel === 'overdue' ? softTagStyle('var(--color-rose-50)', 'var(--color-rose-300)') : aiRisk.riskLevel === 'danger' ? softTagStyle('var(--color-orange-50)', 'var(--color-amber-300)') : aiRisk.riskLevel === 'warning' ? softTagStyle('var(--color-amber-50)', 'var(--color-amber-300)') : softTagStyle('var(--color-emerald-50)', 'var(--color-emerald-600)')}>
                    {aiRisk.riskLevel === 'overdue' ? 'AI预测逾期' : aiRisk.riskLevel === 'danger' ? 'AI预测偏慢' : aiRisk.riskLevel === 'warning' ? 'AI需关注' : 'AI按时'}
                  </Tag>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
    );
  };
}
