import React, { useState, useEffect, useRef } from 'react';
import { ProductionOrder } from '@/types/production';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { ensureBoardStatsForOrder } from '../../ProgressDetail/hooks/useBoardStats';
import {
  defaultNodes,
  stripWarehousingNode,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
  canonicalStageKey,
} from '../../ProgressDetail/utils';
import type { ProgressNode } from '../../ProgressDetail/types';
import { formatCompletionTime } from '../utils';

/**
 * 进度追踪 Hook
 * 管理进度球数据加载、工序节点解析、完成时间展示
 */
export function useProgressTracking(productionList: ProductionOrder[]) {
  // 进度球数据
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  const [boardStatsByOrder, setBoardStatsByOrder] = useState<Record<string, Record<string, number>>>({});
  const [boardTimesByOrder, setBoardTimesByOrder] = useState<Record<string, Record<string, string>>>({});
  const boardStatsByOrderRef = useRef<Record<string, Record<string, number>>>({});
  const boardStatsLoadingRef = useRef<Record<string, boolean>>({});

  // 同步 ref
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { progressNodesByStyleNoRef.current = progressNodesByStyleNo; }, [progressNodesByStyleNo]);

  // 加载工序节点模板
  useEffect(() => {
    if (!productionList.length) return;
    const styleNos = Array.from(
      new Set(productionList.map(r => String(r.styleNo || '').trim()).filter(sn => sn && !progressNodesByStyleNoRef.current[sn]))
    );
    if (!styleNos.length) return;
    void (async () => {
      const settled = await Promise.allSettled(
        styleNos.map(async (sn) => {
          const res = await templateLibraryApi.progressNodeUnitPrices(sn);
          const r = res as any;
          const rows = Array.isArray(r?.data) ? r.data : [];
          const normalized: ProgressNode[] = rows
            .map((n: any) => {
              const name = String(n?.name || '').trim();
              const id = String(n?.id || name || '').trim() || name;
              const p = Number(n?.unitPrice);
              const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
              const progressStage = String(n?.progressStage || '').trim() || undefined;
              return { id, name, unitPrice, progressStage };
            })
            .filter((n: ProgressNode) => n.name);
          return { styleNo: sn, nodes: stripWarehousingNode(normalized) };
        })
      );
      const next: Record<string, ProgressNode[]> = {};
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        if (!s.value.nodes.length) continue;
        next[s.value.styleNo] = s.value.nodes;
      }
      if (Object.keys(next).length) {
        setProgressNodesByStyleNo(prev => ({ ...prev, ...next }));
      }
    })();
  }, [productionList]);

  // 加载每个订单的进度球统计数据
  useEffect(() => {
    if (!productionList.length) return;
    const queue = productionList.slice(0, 20);
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o, progressNodesByStyleNo, defaultNodes));
        await ensureBoardStatsForOrder({
          order: o,
          nodes: ns,
          boardStatsByOrderRef,
          boardStatsLoadingRef,
          setBoardStatsByOrder,
          setBoardTimesByOrder,
        });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [productionList, progressNodesByStyleNo]);

  /**
   * 父节点完成时间 = 该父下所有子工序全部完成后，取最晚的时间。
   * 每个父独立计算，任一子未完成则该父无完成时间。
   *
   * 匹配规则：
   * 1. 子节点的 progressStage 与 stageKeyword 匹配 → 属于该父
   * 2. 子节点 name 本身就与 stageKeyword 匹配 → 也属于该父（兼容 name=采购 progressStage=采购 的情况）
   */
  const getStageCompletionTime = (record: ProductionOrder, stageKeyword: string): string => {
    const orderId = String(record.id || '');
    const timeMap = boardTimesByOrder[orderId] || {};
    const keyword = String(stageKeyword || '').trim();
    if (!keyword) return '';

    const nodes = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));

    // 找到属于该父节点的所有子工序
    const childNames = nodes
      .filter(n => {
        const name = String(n.name || '').trim();
        const stage = String(n.progressStage || '').trim();
        if (!name) return false;
        // 子节点的 progressStage 匹配父名称
        if (stage && stage === keyword) return true;
        // 子节点 name 本身就是父名称（如 name='采购' progressStage='采购'）
        if (name === keyword) return true;
        return false;
      })
      .map(n => String(n.name || '').trim());

    if (childNames.length === 0) return '';

    // 所有子都有完成时间 → 父完成，取最晚时间
    // 任一子没有完成时间 → 父未完成
    let latestTime = '';
    for (const name of childNames) {
      const time = timeMap[name];
      if (!time) return '';  // 有子工序未完成，父节点就没完成
      if (!latestTime || time > latestTime) {
        latestTime = time;
      }
    }

    return latestTime;
  };

  /**
   * 渲染工序完成时间标签
   */
  const renderCompletionTimeTag = (record: ProductionOrder, stageKeyword: string, rate: number): React.ReactNode => {
    const t = getStageCompletionTime(record, stageKeyword);
    const formatted = formatCompletionTime(t);
    if (!formatted) return <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.2, marginBottom: 1, textAlign: 'center' }}>--</div>;
    const isComplete = rate >= 100;
    return (
      <div style={{ fontSize: 10, color: isComplete ? '#10b981' : '#6b7280', fontWeight: isComplete ? 600 : 400, lineHeight: 1.2, marginBottom: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>
        {formatted}
      </div>
    );
  };

  return {
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardTimesByOrder,
    getStageCompletionTime,
    renderCompletionTimeTag,
  };
}
