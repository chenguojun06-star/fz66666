import React, { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import dayjs from 'dayjs';
import { Badge, Button, Popover, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined, ShareAltOutlined, SendOutlined } from '@ant-design/icons';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { buildOrderColorSizeMatrixModel, ColorSizeMatrixPopoverContent } from '@/components/common/OrderColorSizeMatrix';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import SmartOrderHoverCard from '../components/SmartOrderHoverCard';
import DefectTracePopover from '../components/DefectTracePopover';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { getOrderStatusConfig } from '@/components/common/OrderStatusTag';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import { factoryShipmentApi } from '@/services/production/factoryShipmentApi';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { parseProductionOrderLines } from '@/utils/api/production';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { stageAliasMap } from '@/utils/productionStage';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import {
  stripWarehousingNode,
  getOrderShipTime,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
  getOrderStageCompletionTimeFallback,
  defaultNodes,
} from '../utils';

export function calcHealthScore(record: ProductionOrder): { score: number; level: 'good'|'warn'|'danger' } {
  const prog = record.productionProgress ?? 0;
  let score = Math.round(prog * 0.40);
  if (record.expectedShipDate) {
    const days = dayjs(record.expectedShipDate as string).diff(dayjs(), 'day');
    if (days > 14)     score += 35;
    else if (days > 7) score += 26;
    else if (days > 3) score += 16;
    else if (days > 0) score += 8;
  } else {
    score += 20;
  }
  const proc = isDirectCuttingOrder(record as any)
    ? 100
    : ((record as any).procurementCompletionRate ?? null);
  score += proc != null ? Math.round(proc * 0.25) : 18;
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 75 ? 'good' : score >= 50 ? 'warn' : 'danger' };
}

export const NODE_TYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(stageAliasMap).flatMap(([nodeType, keywords]) =>
    keywords.map(kw => [kw, nodeType])
  )
);

export const formatCompletionTime = (timeStr: string): string => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  } catch { return ''; }
};

export const getNodeColor = (expectedShipDate: any, isColor2 = false): string => {
  if (!expectedShipDate) return isColor2 ? '#95de64' : '#52c41a';
  const now = new Date();
  const delivery = new Date(expectedShipDate as string);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return isColor2 ? '#ff7875' : '#ff4d4f';
  if (diffDays <= 3) return isColor2 ? '#ffc53d' : '#faad14';
  return isColor2 ? '#95de64' : '#52c41a';
};

export const colorWithAlpha = (hex: string, alpha: number): string => {
  const matched = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!matched) return hex;
  const [, r, g, b] = matched;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
};

export const ShipmentSumCell: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [data, setData] = useState<Array<{
    color: string;
    sizes: Array<{ sizeName: string; quantity: number }>;
    total: number;
  }> | null>(null);
  useEffect(() => {
    factoryShipmentApi.getOrderDetailSum(orderId)
      .then(res => { if (res?.data?.length) setData(res.data); })
      .catch((err) => { console.warn('[Progress] 发货汇总加载失败:', err?.message || err); });
  }, [orderId]);
  if (!data) return <span style={{ color: '#d9d9d9', fontSize: 11 }}>-</span>;
  return (
    <div style={{ fontSize: 11, lineHeight: '18px' }}>
      {data.map(row => (
        <div key={row.color} style={{ marginBottom: 1 }}>
          <span style={{ color: '#595959' }}>{row.color}: </span>
          {row.sizes.map(s => `${s.sizeName}:${s.quantity}`).join(' ')}
          <span style={{ color: '#bfbfbf', marginLeft: 4 }}>共{row.total}</span>
        </div>
      ))}
    </div>
  );
};

export interface OrderSummaryContext {
  stagnantOrderIds?: Map<string, number>;
  openRemarkModal: (orderNo: string, merchandiser?: string) => void;
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
}

export function createOrderSummaryRender(ctx: OrderSummaryContext) {
  const { stagnantOrderIds, openRemarkModal, deliveryRiskMap } = ctx;
  return (_: any, record: ProductionOrder) => {
    const status = getOrderStatusConfig(record.status);
    const stagnantDays = stagnantOrderIds?.get(String(record.id));
    const shipTimeValue = getOrderShipTime(record);
    const shipDate = shipTimeValue ? dayjs(shipTimeValue).format('YYYY-MM-DD') : '-';
    const quantity = Number(record.orderQuantity || 0);
    const { text, color } = getRemainingDaysDisplay(record.plannedEndDate, record.createTime, record.actualEndDate, record.status);
    const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
    const factoryName = String(record.factoryName || '').trim() || '-';
    const merchandiserName = String((record as Record<string, unknown>).merchandiser || '').trim();
    const customerName = String((record as Record<string, unknown>).company || '').trim();
    const remark = String((record as Record<string, unknown>).remarks || '').trim();
    const expectedShipDateRaw = (record as Record<string, unknown>).expectedShipDate;
    const expectedShipDate = expectedShipDateRaw ? dayjs(String(expectedShipDateRaw)).format('YYYY-MM-DD') : '-';
    const softTagBaseStyle: CSSProperties = {
      margin: 0,
      fontSize: 11,
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
      <Popover
        content={<SmartOrderHoverCard order={record} />}
        trigger="hover"
        placement="rightTop"
        mouseEnterDelay={0.3}
        styles={{ root: { width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 168, paddingRight: 6, paddingTop: 6, paddingBottom: 6, textAlign: 'left' }}>
          <div style={{ width: 162, minWidth: 162, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6 }}>
            <StyleCoverThumb
              styleId={record.styleId}
              styleNo={record.styleNo}
              src={(record as any).styleCover || null}
              size={148}
              borderRadius={14}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 24 }}>
              <Tag color={status.color} style={{ margin: 0, fontSize: 11 }}>{status.label}</Tag>
              {record.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 11 }}>急单</Tag>}
              {String(record.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>首单</Tag>}
              {String(record.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>翻单</Tag>}
              {(() => {
                const { score, level } = calcHealthScore(record);
                if (level === 'good') return null;
                return <Tag color={level === 'warn' ? 'orange' : 'red'} style={{ margin: 0, fontSize: 11 }}>{level === 'warn' ? `关注 ${score}` : `风险 ${score}`}</Tag>;
              })()}
              {stagnantDays !== undefined ? <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>停滞 {stagnantDays} 天</Tag> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, paddingTop: 2, textAlign: 'left' }}>
            <OrderInfoGrid
              fontSize={12}
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
                        <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
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
                        </Tooltip>
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
                  value: String(record.orderNo || '').trim() || '-',
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
                  label: '交货日期',
                  value: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={metaValueStyle}>{shipDate}</span>
                      {text && text !== '已完成' && text !== '已报废' && text !== '已关单' ? <span style={{ color, fontWeight: 700, fontSize: 12 }}>{text}</span> : null}
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
      </Popover>
    );
  };
}

export interface ProgressNodesContext {
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  isFactoryAccount?: boolean;
  onFactoryShip?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  onShareOrder?: (order: ProductionOrder) => void;
  getPredictHint: (orderId: string, stageName: string, percent: number) => string;
  triggerPredict: (params: { orderId: string; orderNo?: string; stageName: string; currentProgress: number }) => void;
}

export function createProgressNodesRender(ctx: ProgressNodesContext) {
  const {
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardTimesByOrder,
    openNodeDetail,
    setQuickEditRecord,
    setQuickEditVisible,
    setPrintingRecord,
    handlePrintLabel,
    isFactoryAccount,
    onFactoryShip,
    canManageOrderLifecycle,
    handleCloseOrder,
    onShareOrder,
    getPredictHint,
    triggerPredict,
  } = ctx;
  return (_: any, record: ProductionOrder) => {
    const frozen = isOrderFrozenByStatus(record);
    const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
    const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes))
      .filter(n => !isDirectCuttingOrder(record) || !/采购|物料|备料|辅料|面料/.test(n.name || ''));
    const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
    const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
    const nodeTimeMap = boardTimesByOrder[String(record.id || '')];
    const progressTrackMinWidth = Math.max((ns.length + 1) * 92, 420);

    if (!ns || ns.length === 0) {
      return (
        <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-base)', padding: '20px 0' }}>
          暂无工序进度数据
        </div>
      );
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        width: '100%',
        alignSelf: 'stretch',
      }}>
        <div style={{
          display: 'flex',
          flex: 1,
          gap: 0,
          alignItems: 'stretch',
          padding: '0 12px',
          minWidth: progressTrackMinWidth,
          overflow: 'visible',
        }}>
        {(() => {
          const orderLines = parseProductionOrderLines(record);
          let matrixItems = orderLines.map(item => ({
            color: String(item.color || '').trim(),
            size: String(item.size || '').trim(),
            quantity: Number(item.quantity || 0),
          }));
          if (matrixItems.length === 1) {
            const single = matrixItems[0];
            const clrArr = single.color.split(/[,，/]+/).map(s => s.trim()).filter(Boolean);
            const sizeArr = single.size.split(/[,，/、\s]+/).map(s => s.trim()).filter(Boolean);
            if (clrArr.length > 1 || sizeArr.length > 1) {
              const clrs = clrArr.length > 0 ? clrArr : [single.color];
              const sizes = sizeArr.length > 0 ? sizeArr : [single.size];
              const qtyEach = Math.round(single.quantity / (clrs.length * sizes.length));
              matrixItems = clrs.flatMap(c => sizes.map(s => ({ color: c, size: s, quantity: qtyEach })));
            }
          }
          const orderMatrix = buildOrderColorSizeMatrixModel({
            items: matrixItems,
            fallbackColor: String(record.color || '').trim(),
            fallbackSize: String(record.size || '').trim(),
            fallbackQuantity: totalQty,
          });
          const matrixPopoverContent = <ColorSizeMatrixPopoverContent model={orderMatrix} />;
          return (
            <div style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 0' }}>
              <Popover
                content={matrixPopoverContent}
                trigger="hover"
                placement="top"
                mouseEnterDelay={0.1}
                overlayStyle={{ maxWidth: 320 }}
                open={orderMatrix.hasData ? undefined : false}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 78,
                  flex: '0 0 auto',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: orderMatrix.hasData ? 'pointer' : 'default',
                }}>
                  <LiquidProgressLottie progress={100} size={68} nodeName="下单"
                    paused={frozen} color1={isCompletedOrClosed ? '#52c41a' : (frozen ? '#9ca3af' : '#52c41a')} color2={isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : '#95de64')} />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(50% + 39px)',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}>
                    <div style={{
                      fontSize: 14,
                      color: '#333',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}>
                      下单
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: '#6b7280',
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}>
                      {record.createTime ? dayjs(record.createTime as string).format('MM-DD') : '--'}
                    </div>
                  </div>
                </div>
              </Popover>
              <div style={{ flex: 1, alignSelf: 'center', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2, minWidth: 16 }}>
                <div style={{ flex: 1, position: 'relative', height: 1, borderRadius: 999,
                  background: colorWithAlpha(isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : '#52c41a'), 0.28), overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 999,
                    background: isCompletedOrClosed ? '#52c41a' : (frozen ? '#9ca3af' : '#52c41a'), transition: 'width 0.25s ease' }} />
                </div>
              </div>
            </div>
          );
        })()}
        {ns.map((node: ProgressNode, index: number) => {
          const nodeName = node.name || '-';
          const nodeType = (node.progressStage && node.progressStage.trim())
            || NODE_TYPE_MAP[nodeName]
            || nodeName.toLowerCase();
          const rawNodeId = String(node.id || '').trim();
          // After upstream fix, node.id stores processCode ('01','FIN','06').
          // Filter UUIDs (contain '-') and default semantic node IDs.
          const processCode = (rawNodeId && !rawNodeId.includes('-')
            && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(rawNodeId))
            ? rawNodeId : '';
          const nodeLabel = processCode ? `${processCode} ${nodeName}` : nodeName;
          const isWarehousingNode = nodeType === 'warehousing'
            || /入库|仓库|成品仓/.test(nodeName);
          const completedQty = isWarehousingNode
            ? (Number((record as any)?.warehousingQualifiedQuantity) || 0)
            : (nodeDoneMap?.[nodeName] || 0);
          const isProcureNode = /采购|物料|备料|辅料|面料/.test(nodeName);
          const rawPercent = isProcureNode
            ? (completedQty > 0 ? 100 : 0)
            : totalQty > 0
              ? Math.min(100, Math.round((completedQty / totalQty) * 100))
              : 0;
          const percent = isCompletedOrClosed ? 100 : rawPercent;
          const remaining = totalQty - completedQty;
          const completionTime = isProcureNode
            ? ((record as any).procurementConfirmedAt
               || (record as any).procurementEndTime
               || nodeTimeMap?.[nodeName]
               || '')
             : (nodeTimeMap?.[nodeName]
               || (percent >= 100
                ? getOrderStageCompletionTimeFallback(record, nodeName, String(node.progressStage || '').trim())
                : (() => {
                    const stageKey = String(node.progressStage || '').trim().toLowerCase();
                    const nameKey = nodeName.toLowerCase();
                    if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) {
                      return (record as any).packagingEndTime || (record as any).ironingEndTime || '';
                    }
                    return '';
                  })())
              );
          const startTime = isProcureNode
            ? ((record as any).procurementStartTime || '')
            : (() => {
                const stageKey = String(node.progressStage || '').trim().toLowerCase();
                const nameKey = nodeName.toLowerCase();
                if (stageKey === 'cutting' || nameKey.includes('裁剪')) return (record as any).cuttingStartTime || '';
                if (stageKey === 'sewing' || stageKey === 'carsewing' || nameKey.includes('车缝')) return (record as any).sewingStartTime || (record as any).carSewingStartTime || '';
                if (stageKey === 'secondaryprocess' || stageKey === 'secondary' || nameKey.includes('二次工艺')) return (record as any).secondaryProcessStartTime || '';
                if (stageKey === 'warehousing' || nameKey.includes('入库')) return (record as any).warehousingStartTime || '';
                if (stageKey === 'quality' || nameKey.includes('质检')) return (record as any).qualityStartTime || '';
                if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) return (record as any).packagingStartTime || (record as any).ironingStartTime || '';
                return '';
              })();
          const predictHint = getPredictHint(String(record.id || ''), nodeName, percent);
          const segmentProgress = Math.min(1, percent / 100);
          const nodePrimaryColor = isCompletedOrClosed ? '#52c41a' : (frozen ? '#9ca3af' : getNodeColor(record.expectedShipDate || record.plannedEndDate));
          const nodeSecondaryColor = isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true));

          return (
            <div
              key={node.id || index}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                flex: '1 1 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 78,
                  flex: '0 0 auto',
                  justifyContent: 'center',
                  cursor: frozen ? 'default' : 'pointer',
                  opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : percent >= 100 ? 0.75 : 1),
                  position: 'relative',
                  zIndex: 1,
                }}
                onClick={() => {
                  if (frozen) return;
                  const sn = String((record as any)?.styleNo || '').trim();
                  const templateNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : undefined;
                  const byParent = getProcessesByNodeFromOrder(record, templateNodes);
                  const nodeProgressStage = String(node.progressStage || '').trim();
                  const isSubProcessNode = nodeProgressStage && nodeProgressStage !== nodeName
                    && byParent[nodeProgressStage]?.some(c => c.name === nodeName);
                  let processList: { id?: string; processCode?: string; name: string; unitPrice?: number }[];
                  let effectiveNodeType = nodeType;
                  if (isSubProcessNode) {
                    processList = [{
                      name: nodeName,
                      unitPrice: node.unitPrice,
                      processCode: processCode || undefined,
                    }];
                    effectiveNodeType = nodeName;
                  } else {
                    let children = byParent[nodeName];
                    if (!children?.length && nodeProgressStage && nodeProgressStage !== nodeName) {
                      children = byParent[nodeProgressStage];
                    }
                    if (children?.length) {
                      processList = children.map(c => ({
                        name: c.name,
                        unitPrice: c.unitPrice,
                        processCode: c.processCode,
                      }));
                    } else {
                      const stageChildren = ns.filter(n => {
                        const ps = String((n as any).progressStage || '').trim();
                        return ps === nodeName || (nodeProgressStage && ps === nodeProgressStage);
                      });
                      processList = stageChildren.map(n => ({
                        id: String(n.id || '').trim() || undefined,
                        processCode: (() => {
                          const r = String(n.id || '').trim();
                          return (r && !r.includes('-')
                            && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(r))
                            ? r : undefined;
                        })(),
                        name: n.name,
                        unitPrice: n.unitPrice,
                      }));
                    }
                  }
                  openNodeDetail(
                    record,
                    effectiveNodeType,
                    nodeName,
                    { done: completedQty, total: totalQty, percent, remaining },
                    node.unitPrice,
                    processList,
                  );
                }}
                onMouseEnter={() => {
                  if (frozen) return;
                  void triggerPredict({
                    orderId: String(record.id || '').trim(),
                    orderNo: String(record.orderNo || '').trim() || undefined,
                    stageName: nodeName,
                    currentProgress: percent,
                  });
                }}
                title={completionTime
                  ? `${nodeLabel} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
                  : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeLabel} 详情`}
              >
                {(nodeType === 'quality' || nodeType === 'warehousing') ? (
                  <DefectTracePopover
                    orderId={String(record.id || '')}
                    hasDefects={Number(record.unqualifiedQuantity) > 0}
                  >
                    <LiquidProgressLottie
                      progress={percent}
                      size={nodeType === 'quality' ? 78 : 68}
                      nodeName={nodeName}
                      text={isProcureNode ? (completedQty > 0 ? '✓' : '') : `${completedQty}/${totalQty}`}
                      subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
                      paused={frozen}
                      color1={nodePrimaryColor}
                      color2={nodeSecondaryColor}
                    />
                  </DefectTracePopover>
                ) : (
                  <LiquidProgressLottie
                    progress={percent}
                    size={68}
                    nodeName={nodeName}
                    text={isProcureNode ? (completedQty > 0 ? '✓' : '') : `${completedQty}/${totalQty}`}
                    subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
                    paused={frozen}
                    color1={nodePrimaryColor}
                    color2={nodeSecondaryColor}
                  />
                )}
                <div style={{
                  position: 'absolute',
                  top: nodeType === 'quality' ? 'calc(50% + 44px)' : 'calc(50% + 39px)',
                  left: 0,
                  right: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}>
                  <div style={{
                    fontSize: 14,
                    color: '#333',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {nodeLabel}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#6b7280',
                    lineHeight: 1.2,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {startTime ? formatCompletionTime(startTime) : '--'} ~ {completionTime ? formatCompletionTime(completionTime) : '--'}
                  </div>
                </div>
              </div>
              {index < ns.length - 1 ? (
                <div style={{ flex: 1, alignSelf: 'center', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
                  <div
                    style={{
                      flex: 1,
                      position: 'relative',
                      height: 1,
                      borderRadius: 999,
                      background: colorWithAlpha(nodeSecondaryColor, 0.28),
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${segmentProgress * 100}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: nodePrimaryColor,
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        </div>
        <div className="progress-row-actions">
          <Button size="small" onClick={() => { setQuickEditRecord(record); setQuickEditVisible(true); }}>编辑</Button>
          <Button size="small" disabled={frozen} onClick={() => setPrintingRecord(record)}>打印</Button>
          <Button size="small" disabled={frozen} onClick={() => { void handlePrintLabel(record); }}>标签</Button>
          {isFactoryAccount ? <Button size="small" type="primary" disabled={frozen} icon={<SendOutlined />} onClick={() => onFactoryShip?.(record)}>发货</Button> : null}
          {canManageOrderLifecycle ? <Button size="small" danger disabled={frozen} onClick={() => handleCloseOrder(record)}>关单</Button> : null}
          <Button size="small" icon={<ShareAltOutlined />} onClick={() => onShareOrder?.(record)}>分享</Button>
        </div>
      </div>
    );
  };
}
