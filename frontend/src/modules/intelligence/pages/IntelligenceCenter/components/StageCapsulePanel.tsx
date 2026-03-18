import React, { useEffect, useMemo, useState } from 'react';
import { UpOutlined, DownOutlined } from '@ant-design/icons';
import { Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import type { ProductionOrder } from '@/types/production';
import { stageAliasMap, tailProcessKeywords } from '@/utils/productionStage';
import { useProductionBoardStore } from '@/stores/productionBoardStore';

type StageKey = 'procurement' | 'cutting' | 'secondaryProcess' | 'sewing' | 'tailProcess' | 'warehousing';

type StageMeta = {
  key: StageKey;
  label: string;
  focusNode: string;
  accent: string;
  glow: string;
};

type StageBucket = StageMeta & {
  count: number;
  quantity: number;
  orders: ProductionOrder[];
  leadOrder: ProductionOrder | null;
};

const STAGE_META: StageMeta[] = [
  { key: 'procurement', label: '采购', focusNode: '采购', accent: '#2dd4bf', glow: 'rgba(45,212,191,0.26)' },
  { key: 'cutting', label: '裁剪', focusNode: '裁剪', accent: '#22c55e', glow: 'rgba(34,197,94,0.24)' },
  { key: 'secondaryProcess', label: '二次工艺', focusNode: '二次工艺', accent: '#a78bfa', glow: 'rgba(167,139,250,0.24)' },
  { key: 'sewing', label: '车缝', focusNode: '车缝', accent: '#38bdf8', glow: 'rgba(56,189,248,0.24)' },
  { key: 'tailProcess', label: '尾部', focusNode: '尾部', accent: '#f59e0b', glow: 'rgba(245,158,11,0.24)' },
  { key: 'warehousing', label: '入库', focusNode: '入库', accent: '#f97316', glow: 'rgba(249,115,22,0.24)' },
];

const STAGE_INDEX: Record<StageKey, number> = {
  procurement: 0,
  cutting: 1,
  secondaryProcess: 2,
  sewing: 3,
  tailProcess: 4,
  warehousing: 5,
};

const STAGNANT_HOURS = 48; // 超过48小时视为停滞
const fmtDate = (d?: string) => (d ? d.slice(5, 10) : '--');
const fmtStagnant = (hours: number) => {
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  if (d === 0) return `${h}小时`;
  if (h === 0) return `${d}天`;
  return `${d}天${h}小时`;
};

const toNumber = (value: unknown) => Number(value) || 0;

const includesAny = (text: string, aliases: string[]) => aliases.some((alias) => text.includes(alias));

const secondaryProcessAliases = Array.from(new Set([...stageAliasMap.secondaryProcess, '工艺', '二次工艺']));

const normalizeStageName = (raw: string): StageKey | null => {
  const safe = String(raw || '').trim();
  if (!safe) return null;
  if (includesAny(safe, stageAliasMap.warehousing)) return 'warehousing';
  if (includesAny(safe, tailProcessKeywords)) return 'tailProcess';
  if (includesAny(safe, secondaryProcessAliases)) return 'secondaryProcess';
  if (includesAny(safe, stageAliasMap.sewing)) return 'sewing';
  if (includesAny(safe, stageAliasMap.cutting)) return 'cutting';
  if (includesAny(safe, stageAliasMap.procurement)) return 'procurement';
  return null;
};

const parseWorkflowStages = (order: ProductionOrder): StageKey[] => {
  const hasSecondaryProcess = Boolean(order.hasSecondaryProcess);
  const baseStages: StageKey[] = hasSecondaryProcess
    ? ['procurement', 'cutting', 'secondaryProcess', 'sewing', 'tailProcess', 'warehousing']
    : ['procurement', 'cutting', 'sewing', 'tailProcess', 'warehousing'];
  const raw = String(order.progressWorkflowJson || '').trim();
  if (!raw) return baseStages;

  try {
    const parsed = JSON.parse(raw) as { steps?: Array<Record<string, unknown>>; stages?: Array<Record<string, unknown>> };
    const nodes = Array.isArray(parsed?.steps) ? parsed.steps : Array.isArray(parsed?.stages) ? parsed.stages : [];
    const mapped = nodes
      .map((node) => normalizeStageName(String(node?.progressStage || node?.stage || node?.name || '')))
      .filter((value): value is StageKey => Boolean(value));
    const merged = hasSecondaryProcess
      ? (['procurement', ...mapped, 'secondaryProcess', 'warehousing'] as StageKey[])
      : (['procurement', ...mapped, 'warehousing'] as StageKey[]);
    return Array.from(new Set(merged)).sort((a, b) => STAGE_INDEX[a] - STAGE_INDEX[b]);
  } catch {
    return baseStages;
  }
};

const hasSecondaryProcessData = (order: ProductionOrder) => {
  if (order.hasSecondaryProcess) return true;
  if (order.secondaryProcessStartTime || order.secondaryProcessEndTime) return true;
  const nodes = order.progressNodeUnitPrices;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  return nodes.some((node: any) => {
    const name = String(node?.name || node?.processName || '').trim();
    return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
  });
};

const sortOrders = (orders: ProductionOrder[]) => {
  return [...orders].sort((a, b) => {
    const urgentDelta = Number(String(b.urgencyLevel || '') === 'urgent') - Number(String(a.urgencyLevel || '') === 'urgent');
    if (urgentDelta !== 0) return urgentDelta;
    const timeA = a.plannedEndDate ? new Date(a.plannedEndDate).getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = b.plannedEndDate ? new Date(b.plannedEndDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (timeA !== timeB) return timeA - timeB;
    return toNumber(b.orderQuantity) - toNumber(a.orderQuantity);
  });
};

const detectStage = (order: ProductionOrder): StageKey => {
  const hasSecondaryProcess = hasSecondaryProcessData(order);
  const workflowStages = parseWorkflowStages(order);

  const warehousingRate = toNumber(order.warehousingCompletionRate);
  const tailRate = Math.max(toNumber(order.tailProcessRate), toNumber(order.qualityCompletionRate));
  const secondaryRate = Math.max(toNumber(order.secondaryProcessRate), toNumber(order.secondaryProcessCompletionRate));
  const sewingRate = Math.max(toNumber(order.carSewingCompletionRate), toNumber(order.sewingCompletionRate));
  const cuttingRate = toNumber(order.cuttingCompletionRate);
  const procurementRate = Math.max(toNumber(order.procurementCompletionRate), toNumber(order.materialArrivalRate));

  const rateMap: Record<StageKey, number> = {
    procurement: procurementRate,
    cutting: cuttingRate,
    secondaryProcess: hasSecondaryProcess ? secondaryRate : 100,
    sewing: sewingRate,
    tailProcess: tailRate,
    warehousing: warehousingRate,
  };

  const stageChain: StageKey[] = hasSecondaryProcess
    ? ['procurement', 'cutting', 'secondaryProcess', 'sewing', 'tailProcess', 'warehousing']
    : ['procurement', 'cutting', 'sewing', 'tailProcess', 'warehousing'];

  const firstIncompleteByRate = stageChain.find((stage) => rateMap[stage] < 100);
  if (firstIncompleteByRate) return firstIncompleteByRate;

  const exactStage = normalizeStageName(String(order.currentProgressStage || order.currentProcessName || order.progressStage || ''));
  if (exactStage === 'secondaryProcess' && !hasSecondaryProcess) {
    return 'sewing';
  }
  if (exactStage) return exactStage;

  const firstIncomplete = workflowStages.find((stage) => rateMap[stage] < 100);
  if (firstIncomplete) return firstIncomplete;
  if (warehousingRate < 100) return 'warehousing';
  return stageChain[stageChain.length - 1] || workflowStages[workflowStages.length - 1] || 'warehousing';
};

interface StageCapsulePanelProps {
  orders: ProductionOrder[];
}

const StageCapsulePanel: React.FC<StageCapsulePanelProps> = ({ orders }) => {
  const navigate = useNavigate();
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('stage_capsule_collapsed') === 'true'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('stage_capsule_collapsed', String(next)); } catch {}
    return next;
  });

  const buckets = useMemo<StageBucket[]>(() => {
    const map = new Map<StageKey, StageBucket>();
    STAGE_META.forEach((meta) => {
      map.set(meta.key, { ...meta, count: 0, quantity: 0, orders: [], leadOrder: null });
    });

    orders.forEach((order) => {
      const key = detectStage(order);
      const bucket = map.get(key);
      if (!bucket) return;
      bucket.orders.push(order);
      bucket.count += 1;
      bucket.quantity += toNumber(order.orderQuantity);
    });

    return STAGE_META.map((meta) => {
      const bucket = map.get(meta.key)!;
      const sorted = sortOrders(bucket.orders);
      return {
        ...bucket,
        orders: sorted,
        leadOrder: sorted[0] || null,
      };
    });
  }, [orders]);

  const bucketStagnantMap = useMemo<Map<StageKey, number>>(() => {
    const now = dayjs();
    const result = new Map<StageKey, number>();
    for (const bucket of buckets) {
      let maxTime = '';
      let hasTimes = false;
      for (const order of bucket.orders) {
        const timeMap = boardTimesByOrder[String(order.id ?? '')] ?? {};
        const times = Object.values(timeMap).filter(Boolean);
        if (times.length > 0) {
          hasTimes = true;
          const latest = times.reduce((a, b) => (a > b ? a : b));
          if (latest > maxTime) maxTime = latest;
        }
      }
      if (hasTimes && maxTime) {
        const hours = now.diff(dayjs(maxTime), 'hour');
        if (hours >= STAGNANT_HOURS) result.set(bucket.key, hours);
      }
    }
    return result;
  }, [buckets, boardTimesByOrder]);

  const orderStagnantMap = useMemo<Map<string, number>>(() => {
    const now = dayjs();
    const result = new Map<string, number>();
    for (const bucket of buckets) {
      for (const order of bucket.orders) {
        const key = String(order.id ?? '');
        if (!key) continue;
        const timeMap = boardTimesByOrder[key] ?? {};
        const times = Object.values(timeMap).filter(Boolean);
        if (times.length === 0) continue;
        const latest = times.reduce((a, b) => (a > b ? a : b));
        const hours = now.diff(dayjs(latest), 'hour');
        if (hours >= STAGNANT_HOURS) result.set(key, hours);
      }
    }
    return result;
  }, [buckets, boardTimesByOrder]);

  const [activeStage, setActiveStage] = useState<StageKey | null>('procurement');

  useEffect(() => {
    if (activeStage && buckets.some((item) => item.key === activeStage && item.count > 0)) return;
    setActiveStage(buckets.find((item) => item.count > 0)?.key || 'procurement');
  }, [activeStage, buckets]);

  const selectedBucket = buckets.find((item) => item.key === activeStage) || buckets[0];

  const openOrders = (targetOrders: ProductionOrder[], focusNode: string, primaryOrder?: ProductionOrder | null) => {
    const orderNos = Array.from(
      new Set(
        targetOrders
          .map((order) => String(order.orderNo || '').trim())
          .filter(Boolean)
      )
    );
    const primaryOrderNo = String(primaryOrder?.orderNo || orderNos[0] || '').trim();
    if (!primaryOrderNo || orderNos.length === 0) return;
    const query = new URLSearchParams({ orderNo: primaryOrderNo, orderNos: orderNos.join(','), focusNode });
    navigate(`/production/progress-detail?${query.toString()}`);
  };

  return (
    <div className="c-stage-capsule-panel">
      <div className="c-card c-stage-shell">
        <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={toggleCollapsed}>
          <span className="live-dot" style={{ ['--dot-size' as any]: '7px', ['--dot-color' as any]: '#38bdf8' }} />
          进度节点
          <span className="c-card-badge cyan-badge">点击卡片展开订单</span>
          <span
            style={{ marginLeft: 'auto', cursor: 'pointer', color: collapsed ? '#a78bfa' : '#5a7a9a', fontSize: 12, padding: '0 4px', display: 'inline-flex', alignItems: 'center', flexShrink: 0, userSelect: 'none' }}
            title={collapsed ? '展开面板' : '收起面板'}
          >
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </span>
        </div>

        <div style={{ overflow: 'hidden', maxHeight: collapsed ? 0 : 900, transition: 'max-height 0.28s ease' }}>
        <div className="c-stage-grid">
          {buckets.map((item) => {
            const isActive = activeStage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`c-stage-card${isActive ? ' active' : ''}${bucketStagnantMap.has(item.key) ? ' stagnant' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveStage((prev) => prev === item.key ? null : item.key);
                }}
                style={{ ['--stage-accent' as any]: item.accent, ['--stage-glow' as any]: item.glow }}
                title={`查看${item.label}对应订单`}
              >
                <div className="c-stage-card-head">
                  <span className="c-stage-name">{item.label}</span>
                  <span className="c-stage-count">{item.count}单</span>
                </div>
                <div className="c-stage-card-main">{item.quantity.toLocaleString()}</div>
                <div className="c-stage-card-unit">件</div>
                <div className="c-stage-card-foot">
                  {item.leadOrder ? (
                    <>
                      <span className="c-stage-lead">{item.leadOrder.orderNo}</span>
                      <span className="c-stage-lead-progress">{toNumber(item.leadOrder.productionProgress)}%</span>
                    </>
                  ) : (
                    <span className="c-stage-empty">暂无订单</span>
                  )}
                </div>
                {bucketStagnantMap.has(item.key) && (
                  <div className="c-stage-stagnant-bar">⏸ 停滞 {fmtStagnant(bucketStagnantMap.get(item.key)!)}</div>
                )}
              </button>
            );
          })}
        </div>

        {activeStage && selectedBucket && (
        <div className="c-stage-detail" style={{ ['--stage-accent' as any]: selectedBucket.accent, ['--stage-glow' as any]: selectedBucket.glow }}>
          <div className="c-stage-detail-head">
            <div>
              <div className="c-stage-detail-title">{selectedBucket.label}舱订单</div>
              <div className="c-stage-detail-sub">当前 {selectedBucket.count} 单，累计 {selectedBucket.quantity.toLocaleString()} 件</div>
            </div>
            {selectedBucket.leadOrder && (
              <button
                type="button"
                className="c-stage-open-primary"
                onClick={() => openOrders(selectedBucket.orders, selectedBucket.focusNode, selectedBucket.leadOrder)}
              >
                打开该舱订单
              </button>
            )}
          </div>

          {selectedBucket.orders.length > 0 ? (
            <div className="c-stage-order-list">
              {selectedBucket.orders.slice(0, 8).map((order) => (
                <button
                  key={String(order.id || order.orderNo)}
                  type="button"
                  className={`c-stage-order-row${orderStagnantMap.has(String(order.id ?? '')) ? ' stagnant' : ''}`}
                  onClick={() => openOrders(selectedBucket.orders, selectedBucket.focusNode, order)}
                >
                  <span className="c-stage-order-no">{order.orderNo}</span>
                  <span className="c-stage-order-style">{order.styleNo || '--'}</span>
                  <span className="c-stage-order-factory">{order.factoryName || '--'}</span>
                  <span className="c-stage-order-qty">{order.orderQuantity ?? order.cuttingQuantity ?? '--'}件</span>
                  <span className="c-stage-order-date">下单 {fmtDate(order.createTime)}</span>
                  <span className="c-stage-order-date">交期 {fmtDate(order.plannedEndDate)}</span>
                  <span className="c-stage-order-progress">{toNumber(order.productionProgress)}%</span>
                  {orderStagnantMap.has(String(order.id ?? '')) && (
                    <span className="c-stagnant-badge">⏸{fmtStagnant(orderStagnantMap.get(String(order.id ?? ''))!)}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="c-stage-empty-wrap">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前阶段暂无在制订单" />
            </div>
          )}
        </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default StageCapsulePanel;
