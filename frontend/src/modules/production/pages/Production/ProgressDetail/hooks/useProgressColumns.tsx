import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { Badge, Popover, Space, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import RowActions from '@/components/common/RowActions';
import SmartOrderHoverCard from '../components/SmartOrderHoverCard';
import DefectTracePopover from '../components/DefectTracePopover';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
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
  formatTime,
  getOrderShipTime,
  getQuotationUnitPriceForOrder,
  resolveNodesForListOrder,
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
  setQuickEditRecord,
  setQuickEditVisible,
  setRemarkPopoverId,
  setRemarkText,
  stagnantOrderIds,
  deliveryRiskMap,
  onShareOrder,
}: UseProgressColumnsParams) => {
  const navigate = useNavigate();
  const { getPredictHint, triggerPredict } = usePredictFinishHint(formatCompletionTime);

  const columns = useMemo<any[]>(() => [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ProductionOrder) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={(record as any).styleCover || null}
          size={48}
          borderRadius={6}
        />
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      render: (v: any, record: ProductionOrder) => (
        <Popover
          content={<SmartOrderHoverCard order={record} />}
          trigger="hover"
          placement="rightTop"
          mouseEnterDelay={0.3}
          overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', cursor: 'default' }}>
            <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
            {record.urgencyLevel === 'urgent' && (
              <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>
            )}
            {String(record.plateType || '').toUpperCase() === 'FIRST' && (
              <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首</Tag>
            )}
            {String(record.plateType || '').toUpperCase() === 'REORDER' && (
              <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻</Tag>
            )}
            {(() => {
              const { score, level } = calcHealthScore(record);
              if (level === 'good') return null;
              return (
                <Tooltip title={`健康度 ${score}分`} placement="top">
                  <Tag
                    color={level === 'warn' ? 'orange' : 'red'}
                    style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}
                  >
                    {level === 'warn' ? '注' : '危'}
                  </Tag>
                </Tooltip>
              );
            })()}
          </div>
        </Popover>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (v: any) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: 'SKC',
      dataIndex: 'skc',
      key: 'skc',
      width: 160,
      render: (v: any) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const name = String(v || '').trim();
        const remark = String((record as Record<string, unknown>).remarks || '').trim();
        const orderId = String(record.id || '');
        const tsMatch = remark.match(/^\[(\d{2}-\d{2} \d{2}:\d{2})\]\s*/);
        const remarkTime = tsMatch ? tsMatch[1] : '';
        const remarkBody = tsMatch ? remark.slice(tsMatch[0].length) : remark;

        return (
          <div
            style={{ position: 'relative', lineHeight: 1.3, cursor: 'pointer' }}
            onClick={() => { setRemarkPopoverId(orderId); setRemarkText(remarkBody); }}
          >
            {remarkTime && (
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                {remarkTime}
              </div>
            )}
            <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 500, color: '#1f2937' }}>{name || '-'}</span>
                {remark && (
                  <Badge dot color="#ef4444" offset={[0, -2]}>
                    <ExclamationCircleOutlined style={{ fontSize: 12, color: '#ef4444' }} />
                  </Badge>
                )}
              </div>
            </Tooltip>
            {remarkBody && (
              <Tooltip title={remarkBody} placement="bottom">
                <div style={{
                  fontSize: 10, color: '#ef4444', fontWeight: 500, lineHeight: 1.2, marginTop: 2,
                  maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {remarkBody.length > 6 ? remarkBody.substring(0, 6) + '...' : remarkBody}
                </div>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '下单人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 100,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 220,
      ellipsis: true,
      render: (v: any, record: ProductionOrder) => (
        <div style={{ lineHeight: 1.3 }}>
          <Space size={4} style={{ flexWrap: 'nowrap' }}>
            {record.factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <span>{v || '-'}</span>
          </Space>
          {record.orgPath ? (
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>{record.orgPath}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: (
        <Tooltip title="款式报价单单价（BOM+工序成本合计含利润）">
          <span>单价</span>
        </Tooltip>
      ),
      key: 'quotationUnitPrice',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => {
        const v = getQuotationUnitPriceForOrder(record);
        return v > 0 ? (
          <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{v.toFixed(2)}</span>
        ) : (
          <span style={{ color: 'var(--neutral-text-secondary)' }}>未报价</span>
        );
      },
    },
    {
      title: '入库数量',
      key: 'warehousingQualifiedQuantity',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => Number((record as Record<string, unknown>).warehousingQualifiedQuantity) || 0,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '下单时间',
      key: 'createTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => formatTime(record.createTime),
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="预计出货"
          fieldName="expectedShipDate"
          onSort={handleOrderSort}
          sortField={orderSortField}
          sortOrder={orderSortOrder}
        />
      ),
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="订单交期"
          fieldName="plannedEndDate"
          onSort={handleOrderSort}
          sortField={orderSortField}
          sortOrder={orderSortOrder}
        />
      ),
      key: 'shipTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => {
        const dateStr = formatTime(getOrderShipTime(record));
        const { text, color } = getRemainingDaysDisplay(record.plannedEndDate, record.createTime, record.actualEndDate);
        // 进度风险标签：综合 daysLeft + productionProgress 给出预警
        const s = record.status;
        const prog = Number(record.productionProgress) || 0;
        const planEnd = record.plannedEndDate ? dayjs(record.plannedEndDate) : null;
        const dLeft = planEnd ? planEnd.diff(dayjs(), 'day') : null;
        let riskTag: { text: string; color: string } | null = null;
        if (s !== 'completed' && dLeft !== null && prog < 100) {
          if (dLeft < 0)                     riskTag = { text: '🔴 已逾期',    color: '#ff4d4f' };
          else if (dLeft <= 3  && prog < 80) riskTag = { text: '🔴 严重偏慢', color: '#ff4d4f' };
          else if (dLeft <= 7  && prog < 50) riskTag = { text: '🟡 进度偏慢', color: '#fa8c16' };
          else if (dLeft <= 14 && prog < 30) riskTag = { text: '🟡 需关注',  color: '#faad14' };
          else if (prog >= 80 && dLeft >= 3) riskTag = { text: '🟢 顺利',    color: '#52c41a' };
        }
        // AI 交期风险 badge
        const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
        let aiRiskTag: { text: string; color: string; tip: string } | null = null;
        if (aiRisk && record.status !== 'completed') {
          const tip = [aiRisk.riskDescription, aiRisk.predictedEndDate ? `预测完成：${aiRisk.predictedEndDate}` : ''].filter(Boolean).join(' · ');
          if (aiRisk.riskLevel === 'overdue')        aiRiskTag = { text: '🤖 AI预测逾期', color: '#cf1322', tip };
          else if (aiRisk.riskLevel === 'danger')    aiRiskTag = { text: '🤖 AI预测偏慢', color: '#d46b08', tip };
          else if (aiRisk.riskLevel === 'warning')   aiRiskTag = { text: '🤖 需关注',     color: '#d48806', tip };
          else if (aiRisk.riskLevel === 'safe')      aiRiskTag = { text: '🤖 AI按时',      color: '#389e0d', tip };
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12 }}>{dateStr}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{text}</span>
            {riskTag && (
              <span style={{ fontSize: 10, fontWeight: 700, color: riskTag.color }}>
                {riskTag.text}
              </span>
            )}
            {aiRiskTag && (
              <Tooltip title={aiRiskTag.tip}>
                <span style={{ fontSize: 10, fontWeight: 700, color: aiRiskTag.color, cursor: 'help' }}>
                  {aiRiskTag.text}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: ProductionOrder['status'], record: ProductionOrder) => {
        const map: any = {
          pending: { color: 'default', label: '待开始' },
          production: { color: 'success', label: '生产中' },
          completed: { color: 'default', label: '已完成' },
          delayed: { color: 'warning', label: '延期' },
        };
        const t = map[value] || { color: 'default', label: value };
        const stagnantDays = stagnantOrderIds?.get(String(record.id));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>
            {stagnantDays !== undefined && (
              <div className="stagnant-pulse-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="stagnant-pulse-dot" />
                <span>停滞 {stagnantDays} 天</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    const q = encodeURIComponent(`订单${record.orderNo}已停滞${stagnantDays}天无扫码，工厂可能出现问题，请分析原因并给出催单建议`);
                    navigate(`/intelligence/center?q=${q}`);
                  }}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.click()}
                  style={{
                    color: '#fa8c16', fontSize: 10, cursor: 'pointer',
                    textDecoration: 'underline', lineHeight: 1,
                  }}
                >
                  催→AI
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '关单时间',
      key: 'actualEndDate',
      width: 130,
      render: (_: any, record: ProductionOrder) =>
        record.actualEndDate ? (
          <span style={{ color: '#52c41a', fontSize: 12 }}>
            {formatTime(record.actualEndDate)}
          </span>
        ) : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '生产进度',
      key: 'progressNodes',
      width: 900,
      align: 'center' as const,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));
        const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
        const nodeTimeMap = boardTimesByOrder[String(record.id || '')];

        if (!ns || ns.length === 0) {
          return (
            <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-base)', padding: '20px 0' }}>
              暂无工序进度数据
            </div>
          );
        }

        // ★ 模板无采购节点但有采购到货时间 → 在进度球上方显示到货 Badge
        const procurementTime = nodeTimeMap?.['__procurement__'] || '';
        const hasProcureNodeInTemplate = ns.some((n: ProgressNode) =>
          /采购|物料|备料|辅料|面料/.test(n.name || '')
        );

        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignItems: 'flex-start',
            width: '100%',
          }}>
            {procurementTime && !hasProcureNodeInTemplate && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: 11,
                color: '#10b981',
                background: 'rgba(16,185,129,0.08)',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}>
                <span>📦</span>
                <span>采购到货 {formatCompletionTime(procurementTime)}</span>
              </div>
            )}
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'flex-start',
            justifyContent: 'space-evenly',
            padding: '12px 8px',
            width: '100%',
          }}>
            {ns.map((node: ProgressNode, index: number) => {
              const nodeName = node.name || '-';
              const completedQty = nodeDoneMap?.[nodeName] || 0;
              const percent = totalQty > 0
                ? Math.min(100, Math.round((completedQty / totalQty) * 100))
                : 0;
              const remaining = totalQty - completedQty;
              const completionTime = nodeTimeMap?.[nodeName] || '';
              // ★ nodeType 优先用模板返回的 progressStage（父分类），避免硬编码 NODE_TYPE_MAP 漏掉自定义工序名
              const nodeType = (node.progressStage && node.progressStage.trim())
                || NODE_TYPE_MAP[nodeName]
                || nodeName.toLowerCase();
              const predictHint = getPredictHint(String(record.id || ''), nodeName, percent);

              return (
                <div
                  key={node.id || index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    flex: 1,
                    cursor: frozen ? 'default' : 'pointer',
                    padding: 4,
                    transition: 'background 0.2s',
                    opacity: frozen ? 0.6 : 1,
                  }}
                  onClick={() => !frozen && openNodeDetail(
                    record,
                    nodeType,
                    nodeName,
                    { done: completedQty, total: totalQty, percent, remaining },
                    node.unitPrice,
                    ns.map(n => ({
                      id: String(n.id || '').trim() || undefined,
                      processCode: String(n.id || '').trim() || undefined,
                      name: n.name,
                      unitPrice: n.unitPrice,
                    }))
                  )}
                  onMouseEnter={(e) => {
                    if (frozen) return;
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                    void triggerPredict({
                      orderId: String(record.id || '').trim(),
                      orderNo: String(record.orderNo || '').trim() || undefined,
                      stageName: nodeName,
                      currentProgress: percent,
                    });
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
                  title={completionTime
                    ? `${nodeName} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
                    : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeName} 详情`}
                >
                  {completionTime ? (
                    <div style={{
                      fontSize: 10,
                      color: percent >= 100 ? '#10b981' : '#6b7280',
                      fontWeight: percent >= 100 ? 600 : 400,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      marginBottom: 2,
                    }}>
                      {formatCompletionTime(completionTime)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.2, marginBottom: 2 }}>--</div>
                  )}
                  {(nodeType === 'quality' || nodeType === 'warehousing') ? (
                    <DefectTracePopover
                      orderId={String(record.id || '')}
                      hasDefects={Number(record.unqualifiedQuantity) > 0}
                    >
                      <LiquidProgressLottie
                        progress={percent}
                        size={60}
                        nodeName={nodeName}
                        text={`${completedQty}/${totalQty}`}
                        paused={frozen}
                        color1={frozen ? '#9ca3af' : percent >= 100 ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate)}
                        color2={frozen ? '#d1d5db' : percent >= 100 ? '#e5e7eb' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true)}
                      />
                    </DefectTracePopover>
                  ) : (
                    <LiquidProgressLottie
                      progress={percent}
                      size={60}
                      nodeName={nodeName}
                      text={`${completedQty}/${totalQty}`}
                      paused={frozen}
                      color1={frozen ? '#9ca3af' : percent >= 100 ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate)}
                      color2={frozen ? '#d1d5db' : percent >= 100 ? '#e5e7eb' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 140,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        return (
          <RowActions
            actions={[
              {
                key: 'print',
                label: '打印',
                primary: true,
                title: frozen ? '打印（订单已关单）' : '打印',
                disabled: frozen,
                onClick: () => setPrintingRecord(record),
              },
              {
                key: 'edit',
                label: '编辑',
                title: frozen ? '编辑（订单已关单）' : '编辑',
                disabled: frozen,
                onClick: () => { setQuickEditRecord(record); setQuickEditVisible(true); },
              },
              ...(isSupervisorOrAbove
                ? [{ key: 'close', label: '关单', disabled: frozen, onClick: () => handleCloseOrder(record) }]
                : []),
              {
                key: 'share',
                label: (
                  <span><ShareAltOutlined style={{ marginRight: 4 }} />分享</span>
                ),
                onClick: () => onShareOrder?.(record),
              },
            ]}
          />
        );
      },
    },

  ], [
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, setQuickEditRecord, setQuickEditVisible,
    setRemarkPopoverId, setRemarkText,
    getPredictHint, triggerPredict,
    deliveryRiskMap, onShareOrder,
  ]);

  return { columns };
};
