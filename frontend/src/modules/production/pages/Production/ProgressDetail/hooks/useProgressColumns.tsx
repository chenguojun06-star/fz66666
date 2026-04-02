import { Fragment, useMemo, type CSSProperties } from 'react';
import dayjs from 'dayjs';
import { Badge, Button, Popover, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { buildOrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import SmartOrderHoverCard from '../components/SmartOrderHoverCard';
import DefectTracePopover from '../components/DefectTracePopover';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import { parseProductionOrderLines } from '@/utils/api/production';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { stageAliasMap } from '@/utils/productionStage';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { usePredictFinishHint } from './usePredictFinishHint';

// ── 订单健康度评分（客户端实时计算，无需额外API）─────────────────────────────
function calcHealthScore(record: ProductionOrder): { score: number; level: 'good'|'warn'|'danger' } {
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
import {
  stripWarehousingNode,
  getOrderShipTime,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
  defaultNodes,
} from '../utils';

// 节点名称 → 节点类型映射（从 stageAliasMap 自动派生，禁止手动维护关键词）
// 修改关键词请直接修改 frontend/src/utils/productionStage.ts
// stageAliasMap.warehousing 已含「质检入库」→ warehousing，无需重复处理
const NODE_TYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(stageAliasMap).flatMap(([nodeType, keywords]) =>
    keywords.map(kw => [kw, nodeType])
  )
);

/** 格式化完成时间为 MM-DD HH:mm */
const formatCompletionTime = (timeStr: string): string => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch { return ''; }
};

/** 根据交期计算水晶球颜色（与 LiquidProgressBar 卡片条颜色保持一致） */
const getNodeColor = (expectedShipDate: any, isColor2 = false): string => {
  if (!expectedShipDate) return isColor2 ? '#95de64' : '#52c41a';
  const now = new Date();
  const delivery = new Date(expectedShipDate as string);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return isColor2 ? '#ff7875' : '#ff4d4f';
  if (diffDays <= 3) return isColor2 ? '#ffc53d' : '#faad14';
  return isColor2 ? '#95de64' : '#52c41a';
};

const colorWithAlpha = (hex: string, alpha: number): string => {
  const matched = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!matched) return hex;
  const [, r, g, b] = matched;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
};

interface UseProgressColumnsParams {
  orderSortField: string;
  orderSortOrder: 'asc' | 'desc';
  handleOrderSort: (field: string, order: 'asc' | 'desc') => void;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  isSupervisorOrAbove: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setRemarkPopoverId: (id: string | null) => void;
  setRemarkText: (text: string) => void;
  /** 停滞订单 Map（orderId → 停滞天数） */
  stagnantOrderIds?: Map<string, number>;
  /** AI 交期风险 Map（orderNo → DeliveryRiskItem） */
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
  /** 分享订单给客户的回调 */
  onShareOrder?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
}

/**
 * 生产进度表格列定义
 */
export const useProgressColumns = ({
  orderSortField,
  orderSortOrder,
  handleOrderSort,
  boardStatsByOrder,
  boardTimesByOrder,
  progressNodesByStyleNo,
  openNodeDetail,
  isSupervisorOrAbove,
  handleCloseOrder,
  setPrintingRecord,
  handlePrintLabel,
  setQuickEditRecord,
  setQuickEditVisible,
  setRemarkPopoverId,
  setRemarkText,
  stagnantOrderIds,
  deliveryRiskMap,
  onShareOrder,
  canManageOrderLifecycle = false,
}: UseProgressColumnsParams) => {
  const { getPredictHint, triggerPredict } = usePredictFinishHint(formatCompletionTime);

  const columns = useMemo<any[]>(() => [
    {
      title: '',
      key: 'orderSummary',
      width: 340,
      align: 'left' as const,
      render: (_: any, record: ProductionOrder) => {
        const statusMap: Record<string, { color: string; label: string }> = {
          pending: { color: 'default', label: '未开始' },
          production: { color: 'processing', label: '生产中' },
          completed: { color: 'success', label: '已完成' },
          delayed: { color: 'warning', label: '已延期' },
          scrapped: { color: 'error', label: '已报废' },
          cancelled: { color: 'default', label: '已取消' },
        };
        const status = statusMap[String(record.status || '').trim()] || { color: 'default', label: String(record.status || '未知') };
        const stagnantDays = stagnantOrderIds?.get(String(record.id));
        const shipTimeValue = getOrderShipTime(record);
        const shipDate = shipTimeValue ? dayjs(shipTimeValue).format('YYYY-MM-DD') : '-';
        const quantity = Number(record.orderQuantity || 0);
        const { text, color } = getRemainingDaysDisplay(record.plannedEndDate, record.createTime, record.actualEndDate, record.status);
        const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
        const colorText = String(record.color || '').trim() || '-';
        const sizeText = String(record.size || '').trim() || '-';
        const factoryName = String(record.factoryName || '').trim() || '-';
        const factoryTypeText = record.factoryType === 'INTERNAL' ? '内部' : record.factoryType === 'EXTERNAL' ? '外发' : '';
        const merchandiserName = String((record as Record<string, unknown>).merchandiser || '').trim();
        const customerName = String((record as Record<string, unknown>).company || '').trim();
        const remark = String((record as Record<string, unknown>).remarks || '').trim();
        const orderId = String(record.id || '');
        const tsMatch = remark.match(/^\[(\d{2}-\d{2} \d{2}:\d{2})\]\s*/);
        const remarkBody = tsMatch ? remark.slice(tsMatch[0].length) : remark;
        const expectedShipDateRaw = (record as Record<string, unknown>).expectedShipDate;
        const expectedShipDate = expectedShipDateRaw ? dayjs(String(expectedShipDateRaw)).format('YYYY-MM-DD') : '-';
        const orderLines = parseProductionOrderLines(record);
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
                <StyleCoverThumb
                  styleId={record.styleId}
                  styleNo={record.styleNo}
                  src={(record as any).styleCover || null}
                  size={148}
                  borderRadius={14}
                />
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
                          <span style={{ ...metaValueStyle }}>{factoryName}</span>
                          {factoryTypeText ? <Tag color={record.factoryType === 'INTERNAL' ? 'blue' : 'purple'} style={record.factoryType === 'INTERNAL' ? softTagStyle('#edf3fb', '#6283a8') : softTagStyle('#f2edf9', '#8c78b1')}>{factoryTypeText}</Tag> : null}
                          {merchandiserName ? (
                            <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
                              <div
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRemarkPopoverId(orderId);
                                  setRemarkText(remarkBody);
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
                      value: shipDate,
                      labelStyle: { ...metaLabelStyle, fontWeight: 500 },
                      valueStyle: metaValueStyle,
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
                  <span style={{ color, fontWeight: 700 }}>{text}</span>
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
      },
    },
    {
      title: '',
      key: 'progressNodes',
      align: 'left' as const,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        // 仅关单/报废才显示灰色球；completed等其他状态保留正常颜色
        const isClosed = record.status === 'scrapped' || String(record.status || '') === 'closed';
        const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));
        const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
        const nodeTimeMap = boardTimesByOrder[String(record.id || '')];
        const progressPercent = Math.max(0, Math.min(100, Number(record.productionProgress || 0)));
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
            alignItems: 'center',
            justifyContent: 'flex-start',
            width: '100%',
          }}>
            <div style={{
              display: 'flex',
              gap: 0,
              alignItems: 'stretch',
              padding: '24px 12px 14px 12px',
              width: '100%',
              minWidth: progressTrackMinWidth,
            }}>
            {(() => {
              const orderLines = parseProductionOrderLines(record);
              let matrixItems = orderLines.map(item => ({
                color: String(item.color || '').trim(),
                size: String(item.size || '').trim(),
                quantity: Number(item.quantity || 0),
              }));
              // 展开合并颜色/码数字符串（如 "白色,黑色" 或 "M,L,XL,XXL" 拆为各自行）
              if (matrixItems.length === 1) {
                const single = matrixItems[0];
                const clrArr = single.color.split(/[,，\/]+/).map(s => s.trim()).filter(Boolean);
                const sizeArr = single.size.split(/[,，\/、\s]+/).map(s => s.trim()).filter(Boolean);
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
              const matrixPopoverContent = orderMatrix.hasData ? (
                <div style={{ minWidth: 100 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#333' }}>颜色码数</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `max-content repeat(${orderMatrix.sizes.length}, minmax(20px, max-content))`,
                    columnGap: 6,
                    rowGap: 2,
                    fontSize: 12,
                    textAlign: 'center',
                  }}>
                    <span style={{ color: '#98a2b3', fontWeight: 600 }}>码</span>
                    {orderMatrix.sizes.map(s => <span key={`h-${s}`} style={{ fontWeight: 600 }}>{s}</span>)}
                    {orderMatrix.rows.map(row => (
                      <Fragment key={row.label}>
                        <span style={{ color: '#98a2b3', textAlign: 'left' }}>{row.label}</span>
                        {orderMatrix.sizes.map(s => (
                          <span key={`${row.label}-${s}`} style={{ color: '#1677ff', fontWeight: 600 }}>
                            {row.quantityMap.get(s) || 0}
                          </span>
                        ))}
                      </Fragment>
                    ))}
                    <span style={{ color: '#98a2b3', fontWeight: 600 }}>总</span>
                    <span style={{ gridColumn: `2 / ${orderMatrix.sizes.length + 2}`, fontWeight: 700, textAlign: 'left' }}>
                      {orderMatrix.total}件
                    </span>
                  </div>
                </div>
              ) : null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', flex: '1 1 0' }}>
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
                      width: 76,
                      flex: '0 0 auto',
                      justifyContent: 'center',
                      padding: 4,
                      position: 'relative',
                      cursor: orderMatrix.hasData ? 'pointer' : 'default',
                    }}>
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 3px)',
                        left: 0,
                        right: 0,
                        fontSize: 12,
                        color: '#10b981',
                        fontWeight: 600,
                        lineHeight: 1.25,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}>
                        {record.createTime ? dayjs(record.createTime as string).format('MM-DD') : '--'}
                      </div>
                      <LiquidProgressLottie progress={100} size={68} nodeName="下单"
                        paused={false} color1="#52c41a" color2="#95de64" />
                    </div>
                  </Popover>
                  <div style={{ flex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2, minWidth: 16 }}>
                    <div style={{ flex: 1, position: 'relative', height: 2, borderRadius: 999,
                      background: colorWithAlpha('#52c41a', 0.28), overflow: 'hidden' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: 999,
                        background: '#52c41a', transition: 'width 0.25s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            {ns.map((node: ProgressNode, index: number) => {
              const nodeName = node.name || '-';
              const completedQty = nodeDoneMap?.[nodeName] || 0;
              //  采购/物料节点：到货即完成(100%)，显示 ；不按件数比率（避免裁剪>下单时卡死）
              const isProcureNode = /采购|物料|备料|辅料|面料/.test(nodeName);
              const percent = isProcureNode
                ? (completedQty > 0 ? 100 : 0)
                : totalQty > 0
                  ? Math.min(100, Math.round((completedQty / totalQty) * 100))
                  : 0;
              const remaining = totalQty - completedQty;
              const completionTime = nodeTimeMap?.[nodeName] || '';
              //  nodeType 优先用模板返回的 progressStage（父分类），避免硬编码 NODE_TYPE_MAP 漏掉自定义工序名
              const nodeType = (node.progressStage && node.progressStage.trim())
                || NODE_TYPE_MAP[nodeName]
                || nodeName.toLowerCase();
              const predictHint = getPredictHint(String(record.id || ''), nodeName, percent);
              const segmentProgress = Math.min(1, percent / 100);
              const nodePrimaryColor = isClosed ? '#9ca3af' : getNodeColor(record.expectedShipDate || record.plannedEndDate);
              const nodeSecondaryColor = isClosed ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true);

              return (
                <div
                  key={node.id || index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: '1 1 0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: 76,
                      flex: '0 0 auto',
                      justifyContent: 'center',
                      cursor: frozen ? 'default' : 'pointer',
                      padding: 4,
                      opacity: isClosed ? 0.6 : percent >= 100 ? 0.75 : 1,
                      position: 'relative',
                      zIndex: 1,
                    }}
                    onClick={() => {
                      if (frozen) return;
                      // 优先从 progressWorkflowJson 获取该父节点下的子工序列表
                      const sn = String((record as any)?.styleNo || '').trim();
                      const templateNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : undefined;
                      const byParent = getProcessesByNodeFromOrder(record, templateNodes);
                      const children = byParent[nodeName];
                      let processList: { id?: string; processCode?: string; name: string; unitPrice?: number }[];
                      if (children?.length) {
                        processList = children.map(c => ({
                          name: c.name,
                          unitPrice: c.unitPrice,
                          processCode: c.processCode,
                        }));
                      } else {
                        // fallback：从模板节点中按 progressStage 过滤出属于当前父节点的子工序
                        const stageChildren = ns.filter(n => {
                          const ps = String((n as any).progressStage || '').trim();
                          return ps === nodeName;
                        });
                        processList = stageChildren.map(n => ({
                          id: String(n.id || '').trim() || undefined,
                          processCode: String(n.id || '').trim() || undefined,
                          name: n.name,
                          unitPrice: n.unitPrice,
                        }));
                      }
                      openNodeDetail(
                        record,
                        nodeType,
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
                      ? `${nodeName} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
                      : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeName} 详情`}
                  >
                    {completionTime ? (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 3px)',
                        left: 0,
                        right: 0,
                        fontSize: 12,
                        color: percent >= 100 ? '#10b981' : '#6b7280',
                        fontWeight: percent >= 100 ? 600 : 400,
                        lineHeight: 1.25,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}>
                        {formatCompletionTime(completionTime)}
                      </div>
                    ) : (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 3px)', left: 0, right: 0, fontSize: 12, color: '#d1d5db', lineHeight: 1.25, textAlign: 'center' }}>--</div>
                    )}
                    {(nodeType === 'quality' || nodeType === 'warehousing') ? (
                      <DefectTracePopover
                        orderId={String(record.id || '')}
                        hasDefects={Number(record.unqualifiedQuantity) > 0}
                      >
                        <LiquidProgressLottie
                          progress={percent}
                          size={68}
                          nodeName={nodeName}
                          text={isProcureNode ? (completedQty > 0 ? '' : '') : `${completedQty}/${totalQty}`}
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
                        text={isProcureNode ? (completedQty > 0 ? '' : '') : `${completedQty}/${totalQty}`}
                        subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
                        paused={frozen}
                        color1={nodePrimaryColor}
                        color2={nodeSecondaryColor}
                      />
                    )}
                  </div>
                  {index < ns.length - 1 ? (
                    <div style={{ flex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
                      <div
                        style={{
                          flex: 1,
                          position: 'relative',
                          height: 2,
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
          </div>
        );
      },
    },
    {
      title: '',
      key: 'action',
      width: 72,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        const btnStyle: CSSProperties = {
          fontSize: 12,
          height: 28,
          padding: '0 12px',
          borderRadius: 14,
        };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Button size="small" style={btnStyle} onClick={() => { setQuickEditRecord(record); setQuickEditVisible(true); }}>
              编辑
            </Button>
            <Button size="small" style={btnStyle} disabled={frozen} onClick={() => setPrintingRecord(record)}>
              打印
            </Button>
            <Button size="small" style={btnStyle} disabled={frozen} onClick={() => { void handlePrintLabel(record); }}>
              标签
            </Button>
            {canManageOrderLifecycle ? (
              <Button size="small" style={btnStyle} danger disabled={frozen} onClick={() => handleCloseOrder(record)}>
                关单
              </Button>
            ) : null}
            <Button size="small" style={btnStyle} icon={<ShareAltOutlined />} onClick={() => onShareOrder?.(record)}>
              分享
            </Button>
          </div>
        );
      },
    },

  ], [
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, handlePrintLabel, setQuickEditRecord, setQuickEditVisible,
    setRemarkPopoverId, setRemarkText,
    getPredictHint, triggerPredict,
    deliveryRiskMap, onShareOrder,
  ]);

  return { columns };
};
