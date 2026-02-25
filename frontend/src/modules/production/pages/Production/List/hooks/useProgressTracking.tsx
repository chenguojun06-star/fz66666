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
import { useProductionBoardStore } from '@/stores';

/**
 * 进度追踪 Hook
 * 管理进度球数据加载、工序节点解析、完成时间展示
 */
export function useProgressTracking(productionList: ProductionOrder[]) {
  // 进度球数据
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);

  // 同步 ref
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
          boardStatsByOrder,
          boardStatsLoadingByOrder,
          mergeBoardStatsForOrder,
          mergeBoardTimesForOrder,
          setBoardLoadingForOrder,
        });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [
    productionList,
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    mergeBoardStatsForOrder,
    mergeBoardTimesForOrder,
    setBoardLoadingForOrder,
  ]);

  /**
   * 父进度完成时间 = 它所有子工序全部完成时的最晚时间
   * 每个父独立核算，不跨父混用子工序
   */
  const getStageCompletionTime = (record: ProductionOrder, stageKeyword: string): string => {
    const orderId = String(record.id || '');
    const timeMap = boardTimesByOrder[orderId] || {};
    const keyword = String(stageKeyword || '').trim();
    if (!keyword) return '';

    // ★ 核心：从 progressWorkflowJson 获取父→子映射
    // byParent 示例: { "车缝": [{name:"上领"}, {name:"埋夹"}], "尾部": [{name:"大烫"}, {name:"剪线"}, {name:"包装"}] }
    const byParent = getProcessesByNodeFromOrder(record);

    if (Object.keys(byParent).length > 0) {
      const keywordCanonical = canonicalStageKey(keyword);

      // 找到匹配的父阶段
      const matchKey = Object.keys(byParent).find(parentName => {
        const pc = canonicalStageKey(parentName);
        return pc === keywordCanonical
          || pc.includes(keywordCanonical)
          || keywordCanonical.includes(pc);
      });

      if (matchKey && byParent[matchKey]?.length > 0) {
        const children = byParent[matchKey];
        let allHaveTime = true;
        let latestTime = '';

        for (const child of children) {
          const t = timeMap[child.name] || '';
          if (!t) {
            allHaveTime = false;
            break;
          }
          if (!latestTime || t > latestTime) {
            latestTime = t;
          }
        }

        // 所有子工序都完成 → 返回最晚时间 = 父完成时间
        if (allHaveTime && latestTime) return latestTime;
        // 还有子工序没完成 → 父未完成
        return '';
      }
    }

    // 回退：无 progressWorkflowJson 时直接匹配节点名（兼容旧数据）
    const nodes = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));
    const keywordCanonical = canonicalStageKey(keyword);
    const matchingNodeNames = nodes
      .map(n => n.name)
      .filter(name => {
        const nc = canonicalStageKey(name);
        return nc === keywordCanonical
          || nc.includes(keywordCanonical)
          || keywordCanonical.includes(nc);
      });

    let latestTime = '';
    for (const name of matchingNodeNames) {
      const time = timeMap[name];
      if (time && (!latestTime || time > latestTime)) {
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
