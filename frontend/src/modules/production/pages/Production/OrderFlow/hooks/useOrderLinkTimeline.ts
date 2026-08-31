import { useCallback, useEffect, useState } from 'react';
import { productionScanApi, materialPurchaseApi, productionCuttingApi } from '@/services/production/productionApi';
import { toTs, displayTime } from '@/utils/timeline';

/**
 * 大货订单链路节点类型 —— 跟随模式：把扫码/采购/裁剪节点合并到备注时间线。
 * 与 OrderRemark 合并展示，不新建独立页面。
 */
export type LinkNodeType = 'scan' | 'purchase' | 'cutting';

export interface LinkNode {
  id: string;
  type: LinkNodeType;
  /** 排序用时间戳（ms），缺失则用 0 兜底排到末尾 */
  ts: number;
  /** 显示用时间字符串 */
  timeDisplay: string;
  operator?: string;
  title: string;
  detail?: string;
  /** Ant Design Timeline 颜色 */
  color: string;
}

const COLOR_SCAN = 'blue';
const COLOR_PURCHASE = 'orange';
const COLOR_CUTTING = 'purple';

/** 采购状态中文翻译 */
function translatePurchaseStatus(status: string): string {
  const map: Record<string, string> = {
    pending: '待采购',
    purchasing: '采购中',
    // D-258：采购任务被领取 = 已领取（与两端统一口径，"已采购"误导）
    purchased: '已领取',
    received: '已领取',
    arriving: '到货中',
    arrived: '已到货',
    awaiting_confirm: '待确认',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[status] || status || '';
}

interface UseOrderLinkTimelineArgs {
  orderId: string;
  orderNo: string;
  /** 是否启用链路节点加载，默认 true */
  enabled?: boolean;
}

/**
 * 大货订单链路节点 Hook：聚合扫码/采购/裁剪三类节点。
 *
 * 并行调用三个 API，按时间降序返回统一格式的 LinkNode[]。
 * 任一接口失败不阻塞其他（容错），整体 loading 在全部完成后置 false。
 */
export function useOrderLinkTimeline({ orderId, orderNo, enabled = true }: UseOrderLinkTimelineArgs) {
  const [nodes, setNodes] = useState<LinkNode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNodes = useCallback(async () => {
    if (!enabled || (!orderId && !orderNo)) {
      setNodes([]);
      return;
    }
    setLoading(true);
    try {
      const tasks: Promise<LinkNode[]>[] = [];

      // 1. 扫码节点
      if (orderId) {
        tasks.push(
          productionScanApi
            .listByOrderId(orderId, { page: 1, pageSize: 200 })
            .then((res: any) => {
              const list = (res?.data?.records || res?.data || []) as any[];
              return list.map((r, idx) => ({
                id: `scan-${r.id ?? idx}`,
                type: 'scan' as const,
                ts: toTs(r.scanTime || r.createTime),
                timeDisplay: displayTime(r.scanTime || r.createTime),
                operator: r.operatorName || r.workerName,
                title: `扫码 · ${r.processName || r.progressStage || r.scanType || '工序'}`,
                detail: [
                  r.scanResult ? `结果:${r.scanResult}` : '',
                  r.quantity != null ? `数量:${r.quantity}` : '',
                  r.cuttingBundleNo ? `扎号:${r.cuttingBundleNo}` : '',
                ].filter(Boolean).join(' '),
                color: COLOR_SCAN,
              }));
            })
            .catch(() => [] as LinkNode[]),
        );
      }

      // 2. 采购节点
      if (orderNo) {
        tasks.push(
          materialPurchaseApi
            .listByOrderNo(orderNo)
            .then((res: any) => {
              const list = (res?.data?.records || res?.data || []) as any[];
              const out: LinkNode[] = [];
              list.forEach((p, idx) => {
                const pid = p.id ?? idx;
                const purchaseNo = p.purchaseNo || `采购${pid}`;
                const statusText = translatePurchaseStatus(p.status);
                // 创建节点
                out.push({
                  id: `purchase-create-${pid}`,
                  type: 'purchase',
                  ts: toTs(p.createTime),
                  timeDisplay: displayTime(p.createTime),
                  operator: p.receiverName,
                  title: `采购创建 · ${purchaseNo}`,
                  detail: `状态:${statusText}`,
                  color: COLOR_PURCHASE,
                });
                // 到货节点（如有）
                if (p.actualArrivalDate) {
                  out.push({
                    id: `purchase-arrive-${pid}`,
                    type: 'purchase',
                    ts: toTs(p.actualArrivalDate),
                    timeDisplay: displayTime(p.actualArrivalDate),
                    operator: p.receiverName,
                    title: `采购到货 · ${purchaseNo}`,
                    detail: `状态:${statusText}`,
                    color: COLOR_PURCHASE,
                  });
                }
              });
              return out;
            })
            .catch(() => [] as LinkNode[]),
        );
      }

      // 3. 裁剪节点
      if (orderId) {
        tasks.push(
          productionCuttingApi
            .listBundles(orderId)
            .then((res: any) => {
              const list = (res?.data?.records || res?.data || []) as any[];
              return list.map((b, idx) => ({
                id: `cutting-${b.id ?? idx}`,
                type: 'cutting' as const,
                ts: toTs(b.createTime),
                timeDisplay: displayTime(b.createTime),
                operator: b.receiverName || b.creatorName,
                title: `裁剪分扎 · 扎号${b.bundleNo ?? ''}`,
                detail: [
                  b.status ? `状态:${b.status}` : '',
                  b.quantity != null ? `数量:${b.quantity}` : '',
                ].filter(Boolean).join(' '),
                color: COLOR_CUTTING,
              }));
            })
            .catch(() => [] as LinkNode[]),
        );
      }

      const results = await Promise.all(tasks);
      const merged = results
        .flat()
        .sort((a, b) => b.ts - a.ts); // 降序，最新在前
      setNodes(merged);
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, orderId, orderNo]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  return { nodes, loading, refresh: fetchNodes };
}
