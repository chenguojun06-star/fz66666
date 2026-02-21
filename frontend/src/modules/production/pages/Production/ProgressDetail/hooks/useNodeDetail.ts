import { useState, useCallback } from 'react';
import { ProductionOrder } from '@/types/production';

interface NodeStats {
  done: number;
  total: number;
  percent: number;
  remaining: number;
}

interface ProcessItem {
  id?: string;
  processCode?: string;
  code?: string;
  name: string;
  unitPrice?: number;
}

/**
 * 节点详情弹窗状态管理
 */
export const useNodeDetail = () => {
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailOrder, setNodeDetailOrder] = useState<ProductionOrder | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState('');
  const [nodeDetailName, setNodeDetailName] = useState('');
  const [nodeDetailStats, setNodeDetailStats] = useState<NodeStats | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<ProcessItem[]>([]);

  const openNodeDetail = useCallback((
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: NodeStats,
    unitPrice?: number,
    processList?: ProcessItem[]
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
};
