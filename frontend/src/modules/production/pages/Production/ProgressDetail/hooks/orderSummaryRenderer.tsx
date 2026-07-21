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
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
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
    const factoryName = String(record.factoryName || '').trim() || '-';
    const merchandiserName = String((record as Record<string, unknown>).merchandiser || '').trim();
    const customerName = String((record as Record<string, unknown>).company || '').trim();
    const remark = String((record as Record<string, unknown>).remarks || '').trim();
    const expectedShipDateRaw = (record as Record<string, unknown>).expectedShipDate;
    const expectedShipDate = displayDate(expectedShipDateRaw, 'datetime');
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
      color: 'var(--neutral-text-light, #98a2b3)',
      whiteSpace: 'nowrap',
    };
    const metaValueStyle: CSSProperties = {
      color: 'var(--neutral-text, #111827)',
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
                  label: '生产方',
                  labelStyle: metaLabelStyle,
                  value: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <SupplierNameTooltip
                        name={factoryName}
                        contactPerson={(record as Record<string, unknown>).factoryContactPerson}
                        contactPhone={(record as Record<string, unknown>).factoryContactPhone}
                        label="工厂"
                        style={metaValueStyle}
                      />
                      {record.factoryType ? <FactoryTypeTag factoryType={record.factoryType} softStyle /> : null}
                      {merchandiserName ? (
                          <div
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                            onClick={(event) => {
                              event.stopPropagation();
                              openRemarkModal(String(record.orderNo || ''), record.merchandiser);
                            }}
                          >
                            <span style={metaLabelStyle}>跟单员</span>
                            <span style={metaValueStyle}>{merchandiserName}</span>
                            {remark ? (
                              <Badge dot color="#ef4444" offset={[-2, 2]}>
                                <ExclamationCircleOutlined style={{ fontSize: 12, color: '#ef4444' }} />
                              </Badge>
                            ) : null}
                          </div>
                      ) : null}
                      {customerName ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={metaLabelStyle}>客户</span>
                          <span style={metaValueStyle}>{customerName}</span>
                        </div>
                      ) : null}
                    </div>
                  ),
                },
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
                {
                  label: '款号',
                  value: String(record.styleNo || '').trim() || '-',
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                },
                {
                  label: 'SKC',
                  value: String((record as any).skc || '').trim() || '-',
                  labelStyle: metaLabelStyle,
                  valueStyle: metaValueStyle,
                },
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
                {
                  label: '预计交期',
                  value: expectedShipDate,
                  labelStyle: { ...metaLabelStyle, fontWeight: 500 },
                  valueStyle: metaValueStyle,
                },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {aiRisk ? (
                <Tooltip title={[aiRisk.riskDescription, aiRisk.predictedEndDate ? `预测完成：${aiRisk.predictedEndDate}` : ''].filter(Boolean).join(' · ')}>
                  <Tag color={aiRisk.riskLevel === 'overdue' ? 'error' : aiRisk.riskLevel === 'danger' ? 'volcano' : aiRisk.riskLevel === 'warning' ? 'warning' : 'success'} style={aiRisk.riskLevel === 'overdue' ? softTagStyle('#f8ecec', '#b17a7a') : aiRisk.riskLevel === 'danger' ? softTagStyle('#f8efea', '#b08773') : aiRisk.riskLevel === 'warning' ? softTagStyle('#f7f1e8', '#a88a66') : softTagStyle('#edf6f0', '#66907b')}>
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
