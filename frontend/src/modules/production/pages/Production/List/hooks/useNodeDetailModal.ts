import { useState, useCallback } from 'react';
import type { ProductionOrder } from '@/types/production';

export interface NodeDetailStats {
  done: number;
  total: number;
  percent: number;
  remaining: number;
}

export function useNodeDetailModal() {
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailOrder, setNodeDetailOrder] = useState<ProductionOrder | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState('');
  const [nodeDetailName, setNodeDetailName] = useState('');
  const [nodeDetailStats, setNodeDetailStats] = useState<NodeDetailStats | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<any[]>([]);

  const openNodeDetail = useCallback((
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: NodeDetailStats,
    unitPrice?: number,
    processList?: any[]
  ) => {
    setNodeDetailOrder(order);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailVisible(true);
  }, []);

  const closeNodeDetail = useCallback(() => {
    setNodeDetailVisible(false);
    setNodeDetailOrder(null);
  }, []);

  return {
    nodeDetailVisible,
    nodeDetailOrder,
    nodeDetailType,
    nodeDetailName,
    nodeDetailStats,
    nodeDetailUnitPrice,
    nodeDetailProcessList,
    openNodeDetail,
    closeNodeDetail,
  };
}
