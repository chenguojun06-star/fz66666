import { useCallback, useEffect } from 'react';
import type { ProductionOrder } from '@/types/production';

export type InlineNodeOpsDeps = {
  activeOrder: ProductionOrder | null;
  currentInlineNode: { id?: string | number | null } | null;
  nodeOps: Record<string, any>;
  setNodeOps: (next: Record<string, any>) => void;
  setInlineSaving: (saving: boolean) => void;
  user: { name?: string; username?: string } | null;
  productionOrderApi: { saveNodeOperations: (orderId: string, payload: string) => Promise<unknown> };
  message: { success: (msg: string) => void; error: (msg: string) => void };
  fetchNodeOperations: (orderId: string) => Promise<Record<string, any>>;
  formatDateTimeCompact: (value?: string) => string;
};

export const useInlineNodeOps = ({
  activeOrder,
  currentInlineNode,
  nodeOps,
  setNodeOps,
  setInlineSaving,
  user,
  productionOrderApi,
  message,
  fetchNodeOperations,
  formatDateTimeCompact,
}: InlineNodeOpsDeps) => {
  const updateInlineOps = useCallback((field: string, value: any) => {
    const k = String(currentInlineNode?.id || '').trim();
    if (!k) return;
    setNodeOps((prev) => ({
      ...prev,
      [k]: {
        ...((prev || {})[k] || {}),
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedByName: String(user?.name || user?.username || '未知')
      }
    }));
  }, [currentInlineNode?.id, setNodeOps, user?.name, user?.username]);

  const saveInlineOps = useCallback(async () => {
    if (!activeOrder?.id) return;
    const k = String(currentInlineNode?.id || '').trim();
    if (!k) return;
    setInlineSaving(true);
    try {
      const updated = { ...(nodeOps || {}) };
      const current = (updated as any)[k] || {};
      const history = Array.isArray(current.history) ? current.history : [];
      const fmt = (t: any) => (t ? formatDateTimeCompact(t) : '-');
      const item = {
        time: new Date().toISOString(),
        operatorName: String(user?.name || user?.username || '未知'),
        action: history.length === 0 ? 'create' : 'update',
        changes: `领取人: ${String(current.assignee || '-')}; 数量: ${typeof current.assigneeQuantity === 'number' ? current.assigneeQuantity : '-'
          }; 领取时间: ${fmt(current.receiveTime)}; 完成时间: ${fmt(current.completeTime)}`
      };
      (updated as any)[k] = { ...current, history: [...history, item].slice(-20) };
      const res = await productionOrderApi.saveNodeOperations(String(activeOrder.id), JSON.stringify(updated));
      if ((res as any)?.code === 200) {
        message.success('保存成功');
        setNodeOps(updated);
      } else {
        message.error((res as any)?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setInlineSaving(false);
    }
  }, [
    activeOrder?.id,
    currentInlineNode?.id,
    setInlineSaving,
    nodeOps,
    formatDateTimeCompact,
    user?.name,
    user?.username,
    productionOrderApi,
    message,
    setNodeOps,
  ]);

  useEffect(() => {
    const id = String(activeOrder?.id || '').trim();
    if (!id) {
      setNodeOps({});
      return;
    }
    (async () => {
      try {
        const parsed = await fetchNodeOperations(id);
        setNodeOps(parsed || {});
      } catch {
        setNodeOps({});
      }
    })();
  }, [activeOrder?.id, fetchNodeOperations, setNodeOps]);

  return { updateInlineOps, saveInlineOps };
};
