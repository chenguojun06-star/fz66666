import React, { useState, useEffect, useRef } from 'react';
import { ProductionOrder } from '@/types/production';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { ensureBoardStatsForOrder } from '../../ProgressDetail/hooks/useBoardStats';
import {
  defaultNodes,
  stripWarehousingNode,
  resolveNodesForListOrder,
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
              return { id, name, unitPrice };
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
   * 动态匹配阶段完成时间：从订单实际工序节点中查找
   */
  const getStageCompletionTime = (record: ProductionOrder, stageKeyword: string): string => {
    const orderId = String(record.id || '');
    const timeMap = boardTimesByOrder[orderId] || {};

    const nodes = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));

    const matchingNodeNames = nodes
      .map(n => n.name)
      .filter(name => {
        const nodeName = String(name || '').trim();
        const canonical = (s: string) => {
          const n = s.trim().replace(/\s+/g, '');
          const map: Record<string, string> = {
            '物料采购': '采购', '面辅料采购': '采购', '备料': '采购', '到料': '采购',
            '裁床': '裁剪', '剪裁': '裁剪', '开裁': '裁剪',
            '缝制': '车缝', '缝纫': '车缝', '车工': '车缝',
            '后整': '包装', '打包': '包装', '装箱': '包装',
            '检验': '质检', '品检': '质检', '验货': '质检',
            '熨烫': '整烫', '大烫': '整烫',
          };
          return map[n] || n;
        };

        const nodeCanonical = canonical(nodeName);
        const stageCanonical = canonical(stageKeyword);

        return nodeCanonical === stageCanonical ||
               nodeCanonical.includes(stageCanonical) ||
               stageCanonical.includes(nodeCanonical);
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
