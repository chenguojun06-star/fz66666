import { useCallback } from 'react';
import type { ProgressNode } from '../types';

type UseNodeWorkflowActionsParams = {
  activeOrderId?: string | number | null;
  isSupervisorOrAbove: boolean;
  nodeWorkflowLocked: boolean;
  nodes: ProgressNode[];
  defaultNodes: ProgressNode[];
  saveNodes: (next: ProgressNode[]) => void;
  setNodeWorkflowDirty: (dirty: boolean) => void;
  message: { error: (msg: string) => void; info: (msg: string) => void };
  Modal: { confirm: (options: any) => void };
};

export const useNodeWorkflowActions = ({
  activeOrderId,
  isSupervisorOrAbove,
  nodeWorkflowLocked,
  nodes,
  defaultNodes,
  saveNodes,
  setNodeWorkflowDirty,
  message,
  Modal,
}: UseNodeWorkflowActionsParams) => {
  const reorderNodeBefore = useCallback((fromId: string, toId: string) => {
    const from = String(fromId || '').trim();
    const to = String(toId || '').trim();
    if (!from || !to || from === to) return;

    const fromIdx = nodes.findIndex((n) => String(n.id) === from);
    const toIdx = nodes.findIndex((n) => String(n.id) === to);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...nodes];
    const [picked] = next.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    next.splice(insertIdx, 0, picked);
    saveNodes(next);
    setNodeWorkflowDirty(true);
  }, [nodes, saveNodes, setNodeWorkflowDirty]);

  const removeNode = useCallback((nodeId: string) => {
    if (!activeOrderId) {
      message.error('未选择订单');
      return;
    }
    if (!isSupervisorOrAbove) {
      message.error('无权限操作进度节点');
      return;
    }
    if (nodeWorkflowLocked) {
      message.error('流程已锁定，如需修改请先退回');
      return;
    }
    if (nodes.length <= 1) {
      message.error('至少保留一个节点');
      return;
    }
    const target = nodes.find((n) => String(n.id) === String(nodeId));
    Modal.confirm({
      title: '确认删除节点？',
      content: `将删除「${target?.name || '该节点'}」`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const next = nodes.filter((n) => String(n.id) !== String(nodeId));
        saveNodes(next.length ? next : defaultNodes);
        setNodeWorkflowDirty(true);
      },
    });
  }, [
    activeOrderId,
    isSupervisorOrAbove,
    nodeWorkflowLocked,
    nodes,
    defaultNodes,
    saveNodes,
    setNodeWorkflowDirty,
    message,
    Modal,
  ]);

  const updateNodeUnitPrice = useCallback((nodeId: string, unitPrice: number) => {
    if (!activeOrderId) return;
    if (!isSupervisorOrAbove) return;
    if (nodeWorkflowLocked) return;
    const p = Number(unitPrice);
    const nextPrice = Number.isFinite(p) && p >= 0 ? p : 0;
    const next = nodes.map((n) => (String(n.id) === String(nodeId) ? { ...n, unitPrice: nextPrice } : n));
    saveNodes(next);
    setNodeWorkflowDirty(true);
  }, [activeOrderId, isSupervisorOrAbove, nodeWorkflowLocked, nodes, saveNodes, setNodeWorkflowDirty]);

  return { reorderNodeBefore, removeNode, updateNodeUnitPrice };
};
