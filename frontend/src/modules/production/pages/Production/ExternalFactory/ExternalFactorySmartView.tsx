import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Empty, Popover, Progress, Skeleton, Spin, Tag } from 'antd';
import { productionScanApi } from '@/services/production/productionApi';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import StandardPagination from '@/components/common/StandardPagination';
import { ProductionOrder } from '@/types/production';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { buildOrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { isDirectCuttingOrder, isOrderFrozenByStatus, isOrderFrozenByStatusOrStock } from '@/utils/api';
import '../../../../basic/pages/StyleInfo/styles.css';
import './externalFactory.css';

/* ─── 扫码数据懒加载缓存 ─── */
const _scanCache = new Map<string, { records: Record<string, unknown>[]; ts: number }>();
const _inflight = new Map<string, Promise<Record<string, unknown>[]>>();
const SCAN_CACHE_TTL = 2 * 60 * 1000; // 2min

async function loadOrderScans(orderId: string): Promise<Record<string, unknown>[]> {
  const hit = _scanCache.get(orderId);
  if (hit && Date.now() - hit.ts < SCAN_CACHE_TTL) return hit.records;
  if (_inflight.has(orderId)) return _inflight.get(orderId)!;
  const p = (async () => {
    try {
      const res = await productionScanApi.listByOrderId(orderId, { page: 1, pageSize: 500 });
      const raw = (res as any)?.data?.records ?? (res as any)?.data ?? [];
      const records: Record<string, unknown>[] = Array.isArray(raw)
        ? raw.filter((r: any) => String(r?.scanResult ?? '') === 'success' && Number(r?.quantity ?? 0) > 0)
        : [];
      _scanCache.set(orderId, { records, ts: Date.now() });
      return records;
    } finally {
      _inflight.delete(orderId);
    }
  })();
  _inflight.set(orderId, p);
  return p;
}

/** 阶段 key → 匹配的 progressStage 中文别名 */
const STAGE_ALIASES: Record<string, string[]> = {
  procurement: ['采购', '备料'],
  cutting:     ['裁剪', '裁断'],
  secondary:   ['二次工艺', '二次', '特种', '印花', '绣花', '洗水'],
  sewing:      ['车缝', '缝制', '制衣'],
  tail:        ['尾部', '尾工', '后整', '套结', '剪线', '锁边'],
  warehousing: ['入库', '仓库', '验收', '质检'],
};

function stageMatch(progressStage: string, stageKey: string): boolean {
  const s = progressStage.trim();
  return (STAGE_ALIASES[stageKey] ?? []).some(a => s === a || s.includes(a) || a.includes(s));
}

interface SubProcess { name: string; qty: number }
interface ScanStageData {
  loading: boolean;
  subProcesses: SubProcess[];
  totalScanned: number;   // 该阶段全部已扫
  dailyRate7d: number;    // 近7天平均日产（件/天）
  lastScanAt: string;     // 最后扫码时间
  workerCount: number;    // 参与该阶段的工人数（近7天有效操作人去重）
}

function useStageScanData(orderId: string, stageKey: string): ScanStageData {
  const [state, setState] = useState<ScanStageData>({
    loading: false, subProcesses: [], totalScanned: 0, dailyRate7d: 0, lastScanAt: '', workerCount: 0,
  });
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${orderId}__${stageKey}`;
    if (!orderId || prevKey.current === key) return;
    prevKey.current = key;
    setState(s => ({ ...s, loading: true }));
    let cancelled = false;
    loadOrderScans(orderId).then(all => {
      if (cancelled) return;
      const stage = all.filter(r => stageMatch(String(r.progressStage ?? ''), stageKey));
      const byProcess: Record<string, number> = {};
      let lastAt = '';
      const sevenAgo = dayjs().subtract(7, 'day');
      let recent7Qty = 0;
      const recentWorkerSet = new Set<string>();   // 近7天有扫码的操作人
      stage.forEach(r => {
        const pname = String(r.processName ?? '').trim() || '（本工序）';
        byProcess[pname] = (byProcess[pname] ?? 0) + Number(r.quantity ?? 0);
        const t = String(r.scanTime ?? r.createTime ?? '');
        if (t > lastAt) lastAt = t;
        if (t && dayjs(t).isAfter(sevenAgo)) {
          recent7Qty += Number(r.quantity ?? 0);
          // 统计近7天有效操作人（优先用 operatorId 去重，回退到 operatorName）
          const opKey = String(r.operatorId ?? r.operatorName ?? '').trim();
          if (opKey) recentWorkerSet.add(opKey);
        }
      });
      const subProcesses = Object.entries(byProcess)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);
      const totalScanned = subProcesses.reduce((s, p) => s + p.qty, 0);
      setState({ loading: false, subProcesses, totalScanned, dailyRate7d: recent7Qty / 7, lastScanAt: lastAt, workerCount: recentWorkerSet.size });
    }).catch(() => {
      if (!cancelled) setState(s => ({ ...s, loading: false }));
    });
    return () => { cancelled = true; };
  }, [orderId, stageKey]);

  return state;
}

/* ─── 类型 ─── */
type StageStatus = 'done' | 'active' | 'waiting' | 'risk' | 'scrapped';
type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success' | 'scrapped';

interface SmartStage {
  key: string;
  label: string;
  helper: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
}

interface Props {
  data: ProductionOrder[];
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  // ─── 操作列 handlers（均为可选，不传则不渲染） ───
  handleCloseOrder?: (record: ProductionOrder) => void;
  handleScrapOrder?: (record: ProductionOrder) => void;
  handleTransferOrder?: (record: ProductionOrder) => void;
  openProcessDetail?: (record: ProductionOrder, type: string) => void;
  syncProcessFromTemplate?: (record: ProductionOrder) => void;
  setPrintModalVisible?: (v: boolean) => void;
  setPrintingRecord?: (r: ProductionOrder | null) => void;
  quickEditModal?: { open: (r: ProductionOrder) => void };
  handleShareOrder?: (record: ProductionOrder) => void;
  handlePrintLabel?: (record: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  isSupervisorOrAbove?: boolean;
  openSubProcessRemap?: (record: ProductionOrder) => void;
  isFactoryAccount?: boolean;
}

/* ─── 常量 ─── */
const STAGE_MIN_SLOT_WIDTH = 128;

const PRODUCTION_STAGES: readonly {
  key: string; label: string; rateField: string; startField: string; endField: string;
}[] = [
  { key: 'procurement', label: '采购', rateField: 'procurementCompletionRate', startField: 'procurementStartTime', endField: 'procurementEndTime' },
  { key: 'cutting', label: '裁剪', rateField: 'cuttingCompletionRate', startField: 'cuttingStartTime', endField: 'cuttingEndTime' },
  { key: 'secondary', label: '二次工艺', rateField: 'secondaryProcessCompletionRate', startField: 'secondaryProcessStartTime', endField: 'secondaryProcessEndTime' },
  { key: 'sewing', label: '车缝', rateField: 'carSewingCompletionRate', startField: 'sewingStartTime', endField: 'sewingEndTime' },
  { key: 'tail', label: '尾部', rateField: 'tailProcessRate', startField: '', endField: '' },
  { key: 'warehousing', label: '入库', rateField: 'warehousingCompletionRate', startField: 'warehousingStartTime', endField: 'warehousingEndTime' },
];

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待生产', color: 'default' },
  production: { text: '生产中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  delayed: { text: '已延期', color: 'error' },
  scrapped: { text: '已废弃', color: 'default' },
  cancelled: { text: '已取消', color: 'default' },
  paused: { text: '暂停', color: 'warning' },
  returned: { text: '已退回', color: 'error' },
};

/* ─── 工具函数 ─── */
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function getDeliveryMeta(r: ProductionOrder): { tone: DeliveryTone; label: string } {
  if (r.status === 'scrapped' || r.status === 'cancelled') return { tone: 'scrapped', label: '已废弃' };
  if (r.status === 'completed') return { tone: 'success', label: '已完成' };
  const target = (r as any).expectedShipDate || r.plannedEndDate;
  if (!target) return { tone: 'normal', label: '未定' };
  const diff = dayjs(target).diff(dayjs(), 'day');
  if (diff < 0) return { tone: 'danger', label: `逾期${Math.abs(diff)}天` };
  if (diff <= 7) return { tone: 'warning', label: `剩${diff}天` };
  return { tone: 'normal', label: `剩${diff}天` };
}

function fmtTime(t?: string): string {
  return t ? dayjs(t).format('MM-DD HH:mm') : '';
}

/* ─── 节点 Popover 内容（懒加载真实扫码数据） ─── */
interface StagePopoverInfo {
  orderId: string;
  stageKey: string;
  label: string;
  progress: number;
  status: StageStatus;
  totalQty: number;
  expectedShipDate?: string;
  plannedEndDate?: string;
}

function StagePopoverContent({
  orderId, stageKey, label, progress, status, totalQty,
  open = false, expectedShipDate, plannedEndDate,
}: StagePopoverInfo & { open?: boolean }) {
  const scanData = useStageScanData(orderId, stageKey);

  // 总量优先用扫码实际数，没有则用 progress 比例推算
  const doneQty = scanData.totalScanned > 0 ? scanData.totalScanned : Math.round(progress / 100 * totalQty);
  const leftQty = Math.max(0, totalQty - doneQty);

  // AI 预测文案
  let aiLabel = '';
  let aiColor = '#595959';
  if (status === 'done' || progress >= 100) {
    aiLabel = '已完成'; aiColor = '#52c41a';
  } else if (status === 'scrapped') {
    aiLabel = '已废弃'; aiColor = '#8c8c8c';
  } else if (status === 'waiting') {
    aiLabel = '未开始'; aiColor = '#8c8c8c';
  } else {
    const target = expectedShipDate || plannedEndDate;
    const deliveryLeft = target ? dayjs(target).diff(dayjs(), 'day') : null;
    if (deliveryLeft !== null && deliveryLeft < 0) {
      aiLabel = '⚠ 已逾期'; aiColor = '#f5222d';
    } else if (scanData.dailyRate7d > 0 && leftQty > 0) {
      const daysNeeded = Math.ceil(leftQty / scanData.dailyRate7d);
      if (deliveryLeft !== null) {
        if (daysNeeded <= deliveryLeft) { aiLabel = `约 ${daysNeeded} 天 · 可按期`; aiColor = '#52c41a'; }
        else { aiLabel = `预计偏晚 ${daysNeeded - deliveryLeft} 天`; aiColor = '#fa8c16'; }
      } else {
        aiLabel = `约 ${daysNeeded} 天完成`; aiColor = '#1677ff';
      }
    } else if (scanData.loading) {
      aiLabel = '加载中…'; aiColor = '#bfbfbf';
    } else if (scanData.workerCount > 0 && scanData.dailyRate7d === 0) {
      // 有工人在做但扫码量不足7天，速率数据少
      aiLabel = '数据积累中'; aiColor = '#1677ff';
    } else if (status === 'risk') {
      aiLabel = '⚠ 进度滞后'; aiColor = '#fa8c16';
    } else if (scanData.totalScanned > 0) {
      // 有历史扫码，但近7天无记录（可能已暂停）
      aiLabel = '近7天无扫码'; aiColor = '#fa8c16';
    } else {
      aiLabel = '暂无扫码数据'; aiColor = '#8c8c8c';
    }
  }

  return (
    <div style={{ minWidth: 168, maxWidth: 230, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626', fontSize: 13 }}>{label}</div>

      {/* 已完成 / 剩余 / 作业人数 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: '#8c8c8c' }}>已生产</span>
        <span style={{ color: '#262626', fontWeight: 600 }}>{doneQty} 件</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: '#8c8c8c' }}>还剩</span>
        <span style={{ color: leftQty > 0 ? '#595959' : '#52c41a', fontWeight: 600 }}>{leftQty} 件</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <span style={{ color: '#8c8c8c' }}>近7天工人</span>
        <span style={{ color: scanData.workerCount > 0 ? '#262626' : '#bfbfbf', fontWeight: 600 }}>
          {scanData.loading ? '…' : scanData.workerCount > 0 ? `${scanData.workerCount} 人` : '-'}
        </span>
      </div>

      {/* 子工序明细 */}
      {scanData.loading ? (
        <div style={{ textAlign: 'center', padding: '4px 0', borderTop: '1px solid #f0f0f0', paddingTop: 6, marginBottom: 6 }}>
          <Spin size="small" /><span style={{ color: '#bfbfbf', marginLeft: 6, fontSize: 11 }}>加载子工序…</span>
        </div>
      ) : scanData.subProcesses.length > 0 ? (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ color: '#8c8c8c', marginBottom: 4 }}>子工序明细</div>
          {scanData.subProcesses.map(sp => (
            <div key={sp.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
              <span style={{ color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{sp.name}</span>
              <span style={{ color: '#1677ff', fontWeight: 600, flexShrink: 0 }}>{sp.qty}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* AI 预测 */}
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#8c8c8c' }}>AI预计</span>
          <span style={{ color: aiColor, fontWeight: 600 }}>{aiLabel}</span>
        </div>
        {scanData.dailyRate7d > 0 && (
          <div style={{ color: '#bfbfbf', fontSize: 11, textAlign: 'right', marginTop: 2 }}>
            近7日 {Math.round(scanData.dailyRate7d)} 件/天
          </div>
        )}
      </div>
    </div>
  );
}

/** 封装单个节点的 Popover + 懒加载，每个实例独立管理 open 状态 */
interface StageNodeProps {
  stage: SmartStage;
  record: ProductionOrder;
  totalQty: number;
}
const StageNode: React.FC<StageNodeProps> = ({ stage, record, totalQty }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={
        <StagePopoverContent
          orderId={String(record.id)}
          stageKey={stage.key}
          label={stage.label}
          progress={stage.progress}
          status={stage.status}
          totalQty={totalQty}
          open={open}
          expectedShipDate={(record as any).expectedShipDate}
          plannedEndDate={record.plannedEndDate}
        />
      }
      trigger="hover"
      mouseEnterDelay={0.15}
      placement="top"
      overlayStyle={{ maxWidth: 240, zIndex: 1100 }}
      getPopupContainer={() => document.body}
    >
      <div className={`style-smart-stage style-smart-stage--${stage.status}`} style={{ cursor: 'default' }}>
        <div className="style-smart-stage__time">{stage.timeLabel}</div>
        <div className="style-smart-stage__node">
          <span className="style-smart-stage__ring" />
          <span className="style-smart-stage__orbit" />
          <span className="style-smart-stage__core" />
          <span className="style-smart-stage__check" />
        </div>
        <div className="style-smart-stage__label">{stage.label}</div>
        {stage.helper && <div className="style-smart-stage__helper">{stage.helper}</div>}
      </div>
    </Popover>
  );
};

function buildStages(r: ProductionOrder, isOverdue: boolean): SmartStage[] {
  const isScrapped = r.status === 'scrapped' || r.status === 'cancelled';
  const stages: SmartStage[] = [];
  for (const def of PRODUCTION_STAGES) {
    if (def.key === 'secondary' && r.hasSecondaryProcess === false) continue;
    const rate = clamp(Number((r as any)[def.rateField]) || 0);
    const start: string | undefined = def.startField ? (r as any)[def.startField] : undefined;
    const end: string | undefined = def.endField ? (r as any)[def.endField] : undefined;
    let status: StageStatus;
    if (isScrapped) status = 'scrapped';
    else if (rate >= 100) status = 'done';
    else if (rate > 0) status = isOverdue ? 'risk' : 'active';
    else status = 'waiting';
    stages.push({
      key: def.key,
      label: def.label,
      helper: rate > 0 && rate < 100 ? `${rate}%` : '',
      timeLabel: end ? fmtTime(end) : start ? fmtTime(start) : '',
      status,
      progress: rate,
    });
  }
  return stages;
}



/* ─── 组件 ─── */
const ExternalFactorySmartView: React.FC<Props> = ({
  data, loading, total, pageSize, currentPage, onPageChange,
  handleCloseOrder, handleScrapOrder, handleTransferOrder,
  openProcessDetail, syncProcessFromTemplate,
  setPrintModalVisible, setPrintingRecord,
  quickEditModal, handleShareOrder, handlePrintLabel,
  canManageOrderLifecycle, isSupervisorOrAbove,
  openSubProcessRemap, isFactoryAccount,
}) => {
  const rows = useMemo(() => data.map(record => {
    const deliveryMeta = getDeliveryMeta(record);
    const stages = buildStages(record, deliveryMeta.tone === 'danger');
    const overallProgress = clamp(record.productionProgress || 0);
    const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.pending;
    const sizeQtyItems = getOrderCardSizeQuantityItems(record);
    const sizeMatrix = buildOrderColorSizeMatrixModel({
      items: sizeQtyItems,
      fallbackColor: record.color,
      fallbackSize: record.size,
      fallbackQuantity: record.orderQuantity,
    });
    const totalQty = (record as any).cuttingQuantity || record.orderQuantity || 0;
    return { record, deliveryMeta, stages, overallProgress, statusInfo, sizeMatrix, totalQty };
  }), [data]);

  const renderRow = ({ record, deliveryMeta, stages, overallProgress, statusInfo, sizeMatrix, totalQty }: typeof rows[0]) => {
        const isScrapped = record.status === 'scrapped' || record.status === 'cancelled';
        const doneCount = stages.filter(s => s.status === 'done').length;
        const timelinePercent = stages.length > 0 ? (doneCount / stages.length) * 100 : 0;
        const shipDate = (record as any).expectedShipDate || record.plannedEndDate;
        const factoryTag = record.factoryType === 'INTERNAL'
          ? <Tag color="blue"   style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginLeft: 4 }}>内部</Tag>
          : record.factoryType === 'EXTERNAL'
          ? <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginLeft: 4 }}>外发</Tag>
          : null;
        return (
          <div key={record.id} className={`style-smart-row style-smart-row--${deliveryMeta.tone}`}>
            {/* 封面区：图片在上，标签+日期在下 */}
            <div className="style-smart-row__cover">
              {record.styleCover ? (
                <div className="style-smart-row__thumb">
                  <img
                    src={getFullAuthedFileUrl(record.styleCover)}
                    alt={record.styleName}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="style-smart-row__thumb ef-thumb-empty">
                  暂无图片
                </div>
              )}
              {/* 标签 + 日期 在图片下面 */}
              <div className="ef-cover-below">
                <div className="ef-cover-tags">
                  <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
                  {record.urgencyLevel === 'urgent' && <Tag color="red">急单</Tag>}
                  {record.plateType === 'REORDER' && <Tag color="blue">翻单</Tag>}
                  <span className={`ef-delivery-badge ef-delivery-badge--${deliveryMeta.tone}`}>
                    {deliveryMeta.label}
                  </span>
                </div>
                <div className="ef-date-stack">
                  <div className="ef-field-row">
                    <span className="ef-field-label">下单</span>
                    <span className="ef-field-value">{record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD') : '-'}</span>
                  </div>
                  <div className="ef-field-row">
                    <span className="ef-field-label">交期</span>
                    <span className="ef-field-value">{shipDate ? dayjs(shipDate).format('YYYY-MM-DD') : '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 正文 */}
            <div className="style-smart-row__body">
              <div className="style-smart-row__layout">
                {/* 身份区 */}
                <div className="style-smart-row__identity">
                  {/* 基本信息行 */}
                  <div className="ef-info-fields">
                    <div className="ef-field-row">
                      <span className="ef-field-label">订单号</span>
                      <Popover
                        content={<SmartOrderHoverCard order={record} />}
                        overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH }}
                        trigger="hover"
                        placement="rightTop"
                        mouseEnterDelay={0.3}
                      >
                        <span className="ef-field-value ef-order-no">{record.orderNo}</span>
                      </Popover>
                    </div>
                    <div className="ef-field-row">
                      <span className="ef-field-label">款号</span>
                      <span className="ef-field-value">{record.styleNo}{record.styleName && ` · ${record.styleName}`}</span>
                    </div>
                    <div className="ef-field-row">
                      <span className="ef-field-label">跟单员</span>
                      <span className="ef-field-value">{record.merchandiser || '-'}</span>
                    </div>
                    <div className="ef-field-row">
                      <span className="ef-field-label">加工厂</span>
                      <span className="ef-field-value">{record.factoryName || '-'}{factoryTag}</span>
                    </div>
                    <div className="ef-field-row">
                      <span className="ef-field-label">客户</span>
                      <span className="ef-field-value">{record.company || '-'}</span>
                    </div>
                  </div>

                  {/* 码数×颜色：单一 grid，所有行列宽一致 */}
                  {sizeMatrix.hasData && (
                    <div className="ef-size-matrix" style={{
                      display: 'grid',
                      gridTemplateColumns: `max-content repeat(${sizeMatrix.sizes.length}, minmax(28px, max-content))`,
                      columnGap: 8,
                      rowGap: 2,
                      fontSize: 12,
                      marginTop: 4,
                    }}>
                      {/* 码数头行 */}
                      <span style={{ color: '#98a2b3', fontWeight: 600 }}>码数</span>
                      {sizeMatrix.sizes.map(s => (
                        <span key={`h-${s}`} style={{ textAlign: 'center', fontWeight: 600, color: '#262626' }}>{s}</span>
                      ))}
                      {/* 颜色数据行 */}
                      {sizeMatrix.rows.map(row => (
                        <React.Fragment key={row.label}>
                          <span style={{ color: '#98a2b3' }}>{row.label}</span>
                          {sizeMatrix.sizes.map(s => (
                            <span key={`${row.label}-${s}`} style={{ textAlign: 'center', color: '#1677ff', fontWeight: 600 }}>
                              {row.quantityMap.get(s) || 0}
                            </span>
                          ))}
                        </React.Fragment>
                      ))}
                      {/* 总数 */}
                      <span style={{ color: '#98a2b3', fontWeight: 600 }}>总数</span>
                      <span style={{ gridColumn: `2 / ${sizeMatrix.sizes.length + 2}`, color: '#262626', fontWeight: 700 }}>
                        {sizeMatrix.total}件
                      </span>
                    </div>
                  )}

                </div>

                {/* 时间轴 + 节点 */}
                <div className="style-smart-row__timeline-shell" style={{ '--ef-stage-count': stages.length } as React.CSSProperties}>
                  <div className="style-smart-row__timeline-track" />
                  <div className="style-smart-row__timeline-progress" style={{
                    width: `calc((100% - 100% / ${stages.length}) * ${timelinePercent / 100})`,
                  }} />
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${stages.length}, minmax(${STAGE_MIN_SLOT_WIDTH}px, 1fr))`,
                    position: 'relative',
                  }}>
                    {stages.map(stage => (
                      <StageNode key={stage.key} stage={stage} record={record} totalQty={totalQty} />
                    ))}
                  </div>
                </div>

                {/* 侧栏 */}
                <div className="style-smart-row__aside">
                  <div className="style-smart-row__overview">
                    <div className="style-smart-row__overview-value">{overallProgress}%</div>
                    <div className="style-smart-row__overview-label">总进度</div>
                    <Progress percent={overallProgress} showInfo={false} size="small" strokeColor={isScrapped ? '#9ca3af' : '#2d7ff9'} />
                  </div>
                  {/* 操作按钮 */}
                  {(setPrintModalVisible || quickEditModal || handleCloseOrder || handleShareOrder) && (() => {
                    const frozen = isOrderFrozenByStatusOrStock(record);
                    const completed = isOrderFrozenByStatus(record);
                    const directCutting = isDirectCuttingOrder(record as any);
                    const cardActions: RowAction[] = [
                      ...(setPrintModalVisible && setPrintingRecord ? [{
                        key: 'print',
                        label: '打印',
                        title: frozen ? '打印（订单已关单）' : '打印生产制单',
                        disabled: frozen,
                        onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); },
                      }] : []),
                      ...(handlePrintLabel ? [{
                        key: 'printLabel',
                        label: '打印标签',
                        title: '打印洗水唛 / 吊牌',
                        onClick: () => handlePrintLabel(record),
                      }] : []),
                      ...(!isFactoryAccount && openProcessDetail ? [{
                        key: 'process',
                        label: '工序',
                        title: frozen ? '工序（订单已关单）' : '查看工序详情',
                        disabled: frozen,
                        children: [
                          { key: 'all', label: '📋 全部工序', onClick: () => openProcessDetail(record, 'all') },
                          { type: 'divider' as const },
                          ...(!directCutting ? [{ key: 'procurement', label: '采购', onClick: () => openProcessDetail(record, 'procurement') }] : []),
                          { key: 'cutting', label: '裁剪', onClick: () => openProcessDetail(record, 'cutting') },
                          { key: 'carSewing', label: '车缝', onClick: () => openProcessDetail(record, 'carSewing') },
                          ...(() => {
                            const nodes = record.progressNodeUnitPrices;
                            if (!Array.isArray(nodes)) return [];
                            const hasSecondary = nodes.some((n: any) => {
                              const name = String(n.name || n.processName || '').trim();
                              return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
                            });
                            return hasSecondary ? [{ key: 'secondaryProcess', label: '二次工艺', onClick: () => openProcessDetail(record, 'secondaryProcess') }] : [];
                          })(),
                          { key: 'tailProcess', label: '尾部', onClick: () => openProcessDetail(record, 'tailProcess') },
                          { type: 'divider' as const },
                          ...(syncProcessFromTemplate ? [{ key: 'syncProcess', label: '🔄 从模板同步', onClick: () => syncProcessFromTemplate(record) }] : []),
                        ],
                      }] : []),
                      ...(isFactoryAccount && openSubProcessRemap ? [{
                        key: 'subProcessRemap',
                        label: '子工序',
                        title: frozen ? '子工序单价配置（订单已关单）' : '子工序单价配置',
                        disabled: frozen,
                        onClick: () => openSubProcessRemap(record),
                      }] : []),
                      ...(quickEditModal ? [{
                        key: 'quickEdit',
                        label: '编辑',
                        title: frozen ? '编辑（订单已关单）' : '快速编辑备注和预计出货',
                        disabled: frozen,
                        onClick: () => { quickEditModal.open(record); },
                      }] : []),
                      ...(canManageOrderLifecycle && handleCloseOrder ? [
                        {
                          key: 'close',
                          label: <span style={{ color: frozen ? undefined : 'var(--primary-color)' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
                          disabled: frozen,
                          onClick: () => handleCloseOrder(record),
                        },
                        ...(isSupervisorOrAbove && handleScrapOrder ? [{
                          key: 'scrap',
                          label: completed ? '报废(已完成)' : '报废',
                          danger: true as const,
                          disabled: completed,
                          onClick: () => handleScrapOrder(record),
                        }] : []),
                        ...(handleTransferOrder ? [{
                          key: 'transfer',
                          label: '转单',
                          title: frozen ? '转单（订单已关单）' : '转给其他人员处理',
                          disabled: frozen,
                          onClick: () => handleTransferOrder(record),
                        }] : []),
                      ] : []),
                      ...(handleShareOrder ? [{
                        key: 'share',
                        label: '🔗 分享',
                        title: '生成客户查看链接（30天有效）',
                        onClick: () => handleShareOrder(record),
                      }] : []),
                    ];
                    return cardActions.length > 0 ? (
                      <div className="ef-card-actions">
                        <RowActions className="ef-card-row-actions" maxInline={1} actions={cardActions} />
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
  };

  if (loading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>;
  if (data.length === 0) return <Empty description="暂无订单数据" style={{ padding: '80px 0' }} />;

  return (
    <div className="style-smart-list ef-compact">
      {rows.map(renderRow)}
      <div className="style-smart-list__pagination">
        <StandardPagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
        />
      </div>
    </div>
  );
};

export default ExternalFactorySmartView;
