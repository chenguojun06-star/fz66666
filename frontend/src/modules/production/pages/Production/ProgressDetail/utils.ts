import { formatDateTime, formatDateTimeCompact } from '@/utils/datetime';
import { ProductionOrder, ScanRecord, CuttingBundle } from '@/types/production';
import { StyleProcess } from '@/types/style';
import { ProgressNode } from './types';

/**
 * 默认进度节点配置
 */
export const defaultNodes: ProgressNode[] = [
  { id: 'cutting', name: '裁剪', unitPrice: 0 },
  { id: 'production', name: '生产', unitPrice: 0 },
  { id: 'quality', name: '质检', unitPrice: 0 },
  { id: 'packaging', name: '包装', unitPrice: 0 },
];

/**
 * 从扫码记录中获取进度阶段名称
 * @param r 扫码记录对象
 * @returns 进度阶段名称
 */
export const getRecordStageName = (r: Record<string, unknown>) => {
  const stage = String(r?.progressStage || '').trim();
  if (stage) return stage;
  return String(r?.processName || '').trim();
};

/**
 * 标准化阶段名称，去除空格并转为小写
 * @param v 阶段名称
 * @returns 标准化后的阶段名称
 */
export const normalizeStageKey = (v: unknown) => String(v || '').trim().replace(/\s+/g, '');

/**
 * 判断是否为质检阶段
 * @param k 阶段名称
 * @returns 是否为质检阶段
 */
export const isQualityStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('质检') || n.includes('检验') || n.includes('品检') || n.includes('验货');
};

/**
 * 判断是否为裁剪阶段
 * @param k 阶段名称
 * @returns 是否为裁剪阶段
 */
export const isCuttingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('裁剪') || n.includes('裁床') || n.includes('剪裁') || n.includes('开裁');
};

/**
 * 判断是否为生产阶段
 * @param k 阶段名称
 * @returns 是否为生产阶段
 */
export const isProductionStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('生产');
};

/**
 * 判断是否为车缝阶段
 * @param k 阶段名称
 * @returns 是否为车缝阶段
 */
export const isSewingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工');
};

/**
 * 判断是否为整烫阶段
 * @param k 阶段名称
 * @returns 是否为整烫阶段
 */
export const isIroningStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('整烫') || n.includes('熨烫');
};

/**
 * 判断是否为包装阶段
 * @param k 阶段名称
 * @returns 是否为包装阶段
 */
export const isPackagingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('包装') || n.includes('后整') || n.includes('打包') || n.includes('装箱');
};

/**
 * 判断是否为出货阶段
 * @param k 阶段名称
 * @returns 是否为出货阶段
 */
export const isShipmentStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('出货') || n.includes('发货') || n.includes('发运');
};

/**
 * 获取阶段的规范名称，将不同表述统一为标准名称
 * @param k 原始阶段名称
 * @returns 规范后的阶段名称
 */
export const canonicalStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return '';
  const map: Record<string, string> = {
    订单创建: '下单',
    创建订单: '下单',
    开单: '下单',
    制单: '下单',
    物料采购: '采购',
    面辅料采购: '采购',
    备料: '采购',
    到料: '采购',
    缝制: '车缝',
    缝纫: '车缝',
    车工: '车缝',
    后整: '包装',
    打包: '包装',
    装箱: '包装',
    检验: '质检',
    品检: '质检',
    验货: '质检',
    熨烫: '整烫',
    发货: '出货',
    发运: '出货',
    裁床: '裁剪',
    剪裁: '裁剪',
    开裁: '裁剪',
  };
  return normalizeStageKey(map[n] || n);
};

/**
 * 判断两个阶段名称是否匹配
 * @param a 阶段名称a
 * @param b 阶段名称b
 * @returns 是否匹配
 */
export const stageNameMatches = (a: any, b: any) => {
  const x = canonicalStageKey(a);
  const y = canonicalStageKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (isCuttingStageKey(x) && isCuttingStageKey(y)) return true;
  if (isQualityStageKey(x) && isQualityStageKey(y)) return true;
  if (isPackagingStageKey(x) && isPackagingStageKey(y)) return true;
  if (isShipmentStageKey(x) && isShipmentStageKey(y)) return true;
  if (isIroningStageKey(x) && isIroningStageKey(y)) return true;
  if (isProductionStageKey(x) && isProductionStageKey(y)) return true;
  if (isSewingStageKey(x) && isSewingStageKey(y)) return true;
  return x.includes(y) || y.includes(x);
};

/**
 * 为指定阶段查找对应的计价工序
 * @param list 工序列表
 * @param stageName 阶段名称
 * @returns 匹配的工序对象，找不到则返回null
 */
export const findPricingProcessForStage = (list: StyleProcess[], stageName: string) => {
  const stage = String(stageName || '').trim();
  if (!stage) return null;
  const sorted = [...(Array.isArray(list) ? list : [])].sort((a: any, b: any) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0));
  for (const p of sorted) {
    const name = String((p as any)?.processName || '').trim();
    if (!name) continue;
    if (stageNameMatches(stage, name)) {
      return p;
    }
  }
  return null;
};

/**
 * 过滤掉出货相关的节点
 * @param list 节点列表
 * @returns 过滤后的节点列表
 */
export const stripWarehousingNode = (list: ProgressNode[]) => {
  return (Array.isArray(list) ? list : []).filter((n) => {
    const id = String((n as any)?.id || '').trim().toLowerCase();
    const name = String((n as any)?.name || '').trim();
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
};

/**
 * 将数值限制在0-100范围内
 * @param value 输入数值
 * @returns 限制后的数值
 */
export const clampPercent = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

/**
 * 格式化时间为标准格式
 * @param value 时间字符串
 * @returns 格式化后的时间字符串
 */
export const formatTime = (value?: string) => formatDateTime(value);

/**
 * 格式化时间为紧凑格式（MM-DD HH:mm）
 * @param value 时间字符串
 * @returns 格式化后的时间字符串
 */
export const formatTimeCompact = (value?: string) => formatDateTimeCompact(value);

/**
 * 获取订单发货时间
 * @param order 生产订单对象
 * @returns 发货时间字符串
 */
export const getOrderShipTime = (order: ProductionOrder) => {
  return order.actualEndDate || order.plannedEndDate || '';
};

/**
 * 根据进度百分比获取对应的节点索引
 * @param nodes 节点列表
 * @param progress 进度百分比
 * @returns 节点索引
 */
export const getNodeIndexFromProgress = (nodes: ProgressNode[], progress: number) => {
  if (nodes.length <= 1) return 0;
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
};

export const getProgressLabelForTable = (
  order: ProductionOrder,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  defaultNodes: ProgressNode[],
) => {
  const cp = String(order.currentProcessName || '').trim();
  const progress = clampPercent(Number(order.productionProgress) || 0);
  const ns = stripWarehousingNode(resolveNodesForListOrder(order, progressNodesByStyleNo, defaultNodes));
  const idx = getNodeIndexFromProgress(ns, progress);
  const derived = ns[idx]?.name || '生产';
  if (!cp) return derived;
  const cpInNodes = ns.some((n) => String(n?.name || '').trim() === cp);
  return cpInNodes ? cp : derived;
};

export const getProgressPercentForTable = (
  order: ProductionOrder,
  nodes: ProgressNode[],
) => {
  const raw = Number((order as any)?.productionProgress);
  const direct = clampPercent(Number.isFinite(raw) ? raw : 0);
  if (direct > 0) return direct;

  const cp = String((order as any)?.currentProcessName || '').trim();
  if (cp && Array.isArray(nodes) && nodes.length) {
    const idx = nodes.findIndex((n) => String(n?.name || '').trim() === cp);
    if (idx >= 0) {
      return clampPercent(getProgressFromNodeIndex(nodes, idx));
    }
  }

  const rate = clampPercent(Number((order as any)?.materialArrivalRate) || 0);
  const base = 5 + Math.round((15 * rate) / 100);
  return clampPercent(base);
};

export const getQuotationUnitPriceForOrder = (order: ProductionOrder) => {
  const v = Number((order as any)?.quotationUnitPrice);
  if (Number.isFinite(v) && v > 0) {
    return v;
  }
  return 0;
};

export const getCloseMinRequired = (cuttingQuantity: number) => {
  const cq = Number(cuttingQuantity ?? 0);
  if (!Number.isFinite(cq) || cq <= 0) return 0;
  return Math.ceil(cq * 0.9);
};

export const getCurrentWorkflowNodeForOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  nodes: ProgressNode[],
  fallbackNodes: ProgressNode[],
): ProgressNode => {
  const ns = stripWarehousingNode(resolveNodesForOrder(order, progressNodesByStyleNo, nodes));
  const progress = Number(order?.productionProgress) || 0;
  const idx = getNodeIndexFromProgress(ns, progress);
  let picked: ProgressNode | undefined = ns[idx] || ns[0];
  if (!picked || !String(picked?.name || '').trim()) {
    picked = ns.find((n) => String(n?.name || '').trim()) || fallbackNodes.find((n) => String(n?.name || '').trim());
  }
  if (!picked) {
    return { id: '', name: '', unitPrice: 0 } as ProgressNode;
  }
  return picked;
};

export const calcCuttingTotalQty = (
  order: ProductionOrder | null,
  cuttingBundles: CuttingBundle[],
): number => {
  const oid = String(order?.id || '').trim();
  const ono = String(order?.orderNo || '').trim();
  const bundlesForOrder = (cuttingBundles || []).filter(
    (b) => String((b as any)?.productionOrderId || '').trim() === oid || String((b as any)?.productionOrderNo || '').trim() === ono
  );
  return bundlesForOrder.reduce((s, b) => s + (Number((b as any)?.quantity) || 0), 0);
};

/**
 * 根据节点索引获取对应的进度百分比
 * @param nodes 节点列表
 * @param index 节点索引
 * @returns 进度百分比
 */
export const getProgressFromNodeIndex = (nodes: ProgressNode[], index: number) => {
  if (nodes.length <= 1) return 0;
  const idx = Math.max(0, Math.min(nodes.length - 1, index));
  return clampPercent((idx / (nodes.length - 1)) * 100);
};

export const parseProgressNodes = (raw: string): ProgressNode[] => {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    // 支持两种格式：nodes (进度节点) 和 steps (工序单价)
    let itemsRaw = (obj as any)?.nodes;
    if (!Array.isArray(itemsRaw)) {
      itemsRaw = (obj as any)?.steps;
    }
    if (!Array.isArray(itemsRaw)) return [];

    const normalized: ProgressNode[] = itemsRaw
      .map((n: any) => {
        const name = String(n?.name || n?.processName || '').trim();
        const p = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        const id = String(n?.id || n?.processCode || name || '');
        const progressStage = String(n?.progressStage || '').trim() || undefined;
        return { id, name, unitPrice, progressStage };
      })
      .filter((n: ProgressNode) => n.name);
    return stripWarehousingNode(normalized);
  } catch {
    // Intentionally empty
    // 忽略错误
    return [];
  }
};

export const parseWorkflowNodesFromOrder = (order: ProductionOrder | null): ProgressNode[] => {
  const raw = String((order as any)?.progressWorkflowJson ?? '').trim();
  if (!raw) return [];
  return parseProgressNodes(raw);
};

export const resolveNodesForOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  fallbackNodes: ProgressNode[],
): ProgressNode[] => {
  const orderNodes = parseWorkflowNodesFromOrder(order);
  if (orderNodes.length) {
    const styleNo = String((order as any)?.styleNo || '').trim();
    const styleNodes = styleNo && progressNodesByStyleNo[styleNo] ? progressNodesByStyleNo[styleNo] : [];
    if (styleNodes.length > 0) {
      // 始终使用模板库的最新单价和progressStage覆盖订单快照中的旧数据
      const priceMap = new Map<string, number>();
      const stageMap = new Map<string, string>();
      const orderMap = new Map<string, number>();
      styleNodes.forEach((sn, i) => {
        const price = Number(sn.unitPrice) || 0;
        if (price > 0) {
          priceMap.set(sn.name, price);
        }
        if (sn.progressStage) {
          stageMap.set(sn.name, sn.progressStage);
        }
        orderMap.set(sn.name, i);
      });
      return orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
    }
    return orderNodes;
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    return progressNodesByStyleNo[sn].filter(n => (Number(n.unitPrice) || 0) > 0);
  }
  return fallbackNodes?.length ? fallbackNodes : defaultNodes;
};

export const resolveNodesForListOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  fallbackNodes: ProgressNode[],
): ProgressNode[] => {
  const orderNodes = parseWorkflowNodesFromOrder(order);
  if (orderNodes.length) {
    // 合并模板库最新单价到列表视图的节点
    const sn = String((order as any)?.styleNo || '').trim();
    const styleNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : [];
    if (styleNodes.length > 0) {
      const priceMap = new Map<string, number>();
      const stageMap = new Map<string, string>();
      const orderMap = new Map<string, number>();
      styleNodes.forEach((n, i) => {
        const price = Number(n.unitPrice) || 0;
        if (price > 0) {
          priceMap.set(n.name, price);
        }
        if (n.progressStage) {
          stageMap.set(n.name, n.progressStage);
        }
        orderMap.set(n.name, i);
      });
      return orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
    }
    return orderNodes;
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    return progressNodesByStyleNo[sn];
  }
  return fallbackNodes?.length ? fallbackNodes : defaultNodes;
};

export const getProcessesByNodeFromOrder = (
  order: ProductionOrder | null,
  templateNodes?: ProgressNode[],
): Record<string, { name: string; unitPrice?: number }[]> => {
  const raw = String((order as any)?.progressWorkflowJson ?? '').trim();
  if (!raw) return {};

  // 构建模板单价映射，用于覆盖旧快照价格
  const templatePriceMap = new Map<string, number>();
  if (templateNodes?.length) {
    templateNodes.forEach(n => {
      const price = Number(n.unitPrice) || 0;
      if (price > 0) {
        templatePriceMap.set(n.name, price);
      }
    });
  }

  try {
    const obj = JSON.parse(raw);
    const nodes = Array.isArray(obj?.nodes) ? obj.nodes : [];
    const byNode: Record<string, { name: string; unitPrice?: number }[]> = {};
    if (nodes.length && nodes[0]?.name) {
      for (const item of nodes) {
        const n = String(item?.name || item?.processName || '').trim();
        const stage = String(item?.progressStage || n).trim();
        const storedPrice = Number(item?.unitPrice) || 0;
        // 优先使用模板最新单价
        const price = templatePriceMap.get(n) ?? storedPrice;
        if (!byNode[stage]) byNode[stage] = [];
        byNode[stage].push({ name: n, unitPrice: price });
      }
      return byNode;
    }
    const processesByNode = obj?.processesByNode || {};
    const result: Record<string, { name: string; unitPrice?: number }[]> = {};
    for (const k of Object.keys(processesByNode || {})) {
      const arr = Array.isArray(processesByNode[k]) ? processesByNode[k] : [];
      result[k] = arr
        .map((p: any) => {
          const name = String(p?.name || p?.processName || '').trim();
          const storedPrice = Number(p?.unitPrice) || 0;
          return { name, unitPrice: templatePriceMap.get(name) ?? storedPrice };
        })
        .filter((x) => x.name);
    }
    return result;
  } catch {
    return {};
  }
};

/**
 * 基于菲号完成情况计算进度
 * @param order 生产订单
 * @param cuttingBundles 裁剪捆包列表
 * @param scanHistory 扫码历史记录
 * @param nodes 节点列表
 * @returns 计算后的进度百分比
 */
export const calculateProgressFromBundles = (
  order: ProductionOrder,
  cuttingBundles: CuttingBundle[],
  scanHistory: ScanRecord[],
  nodes?: ProgressNode[],
): number => {
  const oid = String(order?.id || '').trim();
  const ono = String(order?.orderNo || '').trim();
  const bundlesForOrder = (cuttingBundles || []).filter(
    (b) => String(b?.productionOrderId || '').trim() === oid || String(b?.productionOrderNo || '').trim() === ono
  );
  if (!bundlesForOrder.length) {
    return Number(order.productionProgress) || 0;
  }

  const effectiveNodes = stripWarehousingNode(Array.isArray(nodes) && nodes.length ? nodes : defaultNodes);
  if (effectiveNodes.length <= 1) {
    return Number(order.productionProgress) || 0;
  }

  const nodeCompletion = effectiveNodes.map((node) => {
    const nodeName = node.name;
    const totalQtyForNode = bundlesForOrder.reduce((acc, bundle) => acc + (Number(bundle?.quantity) || 0), 0);

    const doneQtyForNode = scanHistory
      .filter((r) => String(r?.scanResult || '').trim() === 'success')
      .filter((r) => String(r?.scanType || '').trim() === 'production')
      .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
      .reduce((acc, r) => acc + (Number(r?.quantity) || 0), 0);

    const completionRate = totalQtyForNode > 0 ? doneQtyForNode / totalQtyForNode : 0;
    return { nodeName, completionRate };
  });

  let totalProgress = 0;
  const nodeWeight = 100 / effectiveNodes.length;

  for (let i = 0; i < nodeCompletion.length; i++) {
    const { completionRate } = nodeCompletion[i];
    if (completionRate >= 0.98) {
      totalProgress += nodeWeight;
    } else {
      totalProgress += nodeWeight * completionRate;
      break;
    }
  }

  return clampPercent(totalProgress);
};
