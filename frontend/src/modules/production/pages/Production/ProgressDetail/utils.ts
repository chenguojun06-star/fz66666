import { formatDateTime } from '@/utils/datetime';
import { ProductionOrder, ScanRecord, CuttingBundle } from '@/types/production';
import { StyleProcess } from '@/types/style';
import { ProgressNode } from './types';

// ── 动态工序→父节点映射缓存（从 t_process_parent_mapping 获取） ──
let _dynamicParentMapping: Record<string, string> | null = null;

/**
 * 注入动态映射数据（由外部调用方从 API 获取后设置）
 * 格式: { "整烫": "尾部", "大烫": "尾部", "绣花": "二次工艺", ... }
 */
export function setDynamicParentMapping(mapping: Record<string, string>) {
  _dynamicParentMapping = mapping;
}

/** 获取当前缓存的动态映射 */
export function getDynamicParentMapping(): Record<string, string> | null {
  return _dynamicParentMapping;
}

/**
 * 从动态映射中解析父节点（模拟后端 contains 匹配策略）
 * 优先精确匹配，其次 processName.includes(keyword)，按关键词长度降序
 */
function resolveDynamicParent(processName: string): string | undefined {
  if (!_dynamicParentMapping || !processName) return undefined;
  // 1. 精确匹配
  const exact = _dynamicParentMapping[processName];
  if (exact) return exact;
  // 2. contains 匹配（长关键词优先）
  let bestParent: string | undefined;
  let bestLen = 0;
  for (const [keyword, parent] of Object.entries(_dynamicParentMapping)) {
    if (keyword.length > bestLen && processName.includes(keyword)) {
      bestParent = parent;
      bestLen = keyword.length;
    }
  }
  return bestParent;
}

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
 * 注意："质检入库"不是质检，是入库（质检后入仓），需用 isWarehouseStageKey 判断
 * @param k 阶段名称
 * @returns 是否为质检阶段
 */
export const isQualityStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  // "质检入库""入库质检" 等含"入库"的不算质检
  if (n.includes('入库')) return false;
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
  return n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工') || n.includes('整件');
};

/**
 * 判断是否为整烫阶段
 * @param k 阶段名称
 * @returns 是否为整烫阶段
 */
export const isIroningStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('整烫') || n.includes('熨烫') || n.includes('大烫');
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
    整件: '车缝',  // 整件车缝工序规范化为车缝
    大烫: '整烫',
    熨烫: '整烫',
    后整: '包装',
    打包: '包装',
    装箱: '包装',
    检验: '质检',
    品检: '质检',
    验货: '质检',
    发货: '出货',
    发运: '出货',
    裁床: '裁剪',
    剪裁: '裁剪',
    开裁: '裁剪',
    // 入库别名：小程序上报 progressStage="质检入库""入仓" 等需统一到 "入库"
    质检入库: '入库',
    入仓: '入库',
    仓库: '入库',
    仓储: '入库',
    入库质检: '入库',
    成品入库: '入库',
    完工入库: '入库',
    // 二次工艺别名（包含 t_process_parent_mapping 中所有映射到"二次工艺"的子工序关键词）
    绣花: '二次工艺',
    印花: '二次工艺',
    水洗: '二次工艺',
    压花: '二次工艺',
    烫钻: '二次工艺',
    烫画: '二次工艺',
    贴标: '二次工艺',
    钉珠: '二次工艺',
    贴绣: '二次工艺',
    烫金: '二次工艺',
    数码印: '二次工艺',
    打孔: '二次工艺',
    激光: '二次工艺',
    转印: '二次工艺',
    植绒: '二次工艺',
    涂层: '二次工艺',
    磨毛: '二次工艺',
    染色: '二次工艺',
  };
  return normalizeStageKey(map[n] || n);
};

/**
 * 判断两个阶段名称是否匹配
 * @param a 阶段名称a
 * @param b 阶段名称b
 * @returns 是否匹配
 */
/** 判断是否为「尾部」父节点 */
const isTailStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n === '尾部' || n.includes('尾部') || n.includes('尾工');
};

/** 判断是否为「二次工艺」阶段（含绣花、印花等子工序） */
const isSecondaryProcessStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('二次工艺') || n.includes('二次') || n.includes('绣花') || n.includes('印花') || n.includes('水洗') || n.includes('压花');
};

/** 判断是否为入库阶段（包含质检入库、入仓、仓库等别名） */
export const isWarehouseStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('入库') || n.includes('入仓') || n.includes('仓库') || n.includes('仓储');
};

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
  if (isWarehouseStageKey(x) && isWarehouseStageKey(y)) return true;
  // 二次工艺父节点可以匹配绣花/印花/水洗/压花等子工序
  if (isSecondaryProcessStageKey(x) && isSecondaryProcessStageKey(y)) return true;
  // 尾部父节点可以匹配整烫/质检/包装等子阶段
  // （与后端 resolveParentProgressStage 关键词兜底策略保持一致）
  // 历史扫码记录 progressStage="整烫" 可以被尾部进度球正确计数
  const tailSubStage = (k: string) =>
    isIroningStageKey(k) || isQualityStageKey(k) || isPackagingStageKey(k);
  if (isTailStageKey(x) && tailSubStage(y)) return true;
  if (isTailStageKey(y) && tailSubStage(x)) return true;

  // ── 动态映射匹配（替代硬编码关键词的终极兜底） ──
  // 从 t_process_parent_mapping 加载的映射，覆盖所有已知和未来新增的工序名变体
  if (_dynamicParentMapping) {
    const findParent = (name: string): string | null => {
      if (!name) return null;
      const exact = _dynamicParentMapping![name];
      if (exact) return exact;
      // contains 匹配（与后端 ProcessParentMappingService 一致）
      for (const [kw, parent] of Object.entries(_dynamicParentMapping!)) {
        if (name.includes(kw)) return parent;
      }
      return null;
    };
    const xOrig = normalizeStageKey(a);
    const yOrig = normalizeStageKey(b);
    const xParent = findParent(x) || findParent(xOrig);
    const yParent = findParent(y) || findParent(yOrig);
    // x 是父节点，y 的父节点 = x → 匹配（父子关系）
    if (yParent && yParent === x) return true;
    if (xParent && xParent === y) return true;
    // 注意：故意不做「同父节点 = 匹配」的判断
    // 「剪线」和「蒸烫」都属于「尾部」，但它们是不同的工序，不能互相匹配
    // 同义词匹配已在 canonicalStageKey 的 synonymMap 中处理（如 大烫→整烫）
    // 原始名也尝试
    if (yParent && yParent === xOrig) return true;
    if (xParent && xParent === yOrig) return true;
  }

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

type SubProcessRemapItem = {
  id?: string;
  name?: string;
  originalName?: string;
  [k: string]: unknown;
};

type SubProcessRemapStage = {
  enabled?: boolean;
  subProcesses?: SubProcessRemapItem[];
  [k: string]: unknown;
};

type SubProcessRemap = Record<string, SubProcessRemapStage>;

const stageKeyToParent = (stageKey: string) => {
  const map: Record<string, string> = {
    procurement: '采购',
    cutting: '裁剪',
    secondaryProcess: '二次工艺',
    carSewing: '车缝',
    tailProcess: '尾部',
    warehousing: '入库',
  };
  return map[String(stageKey || '').trim()] || '';
};

const parseSubProcessRemap = (order: ProductionOrder | null): SubProcessRemap => {
  const raw = String((order as any)?.nodeOperations || '').trim();
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const remap = obj?.subProcessRemap;
    if (!remap || typeof remap !== 'object') return {};
    return remap as SubProcessRemap;
  } catch {
    return {};
  }
};

const applySubProcessRemapToNodes = (nodes: ProgressNode[], order: ProductionOrder | null): ProgressNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const remap = parseSubProcessRemap(order);
  const stageKeys = Object.keys(remap);
  if (stageKeys.length === 0) return nodes;

  const working = [...nodes];
  for (const stageKey of stageKeys) {
    const cfg = remap[stageKey];
    if (!cfg || cfg.enabled !== true || !Array.isArray(cfg.subProcesses)) {
      continue;
    }
    const parent = stageKeyToParent(stageKey);
    if (!parent) continue;

    const parentCanonical = canonicalStageKey(parent);
    const matchedRows: ProgressNode[] = [];
    let insertAt = -1;

    for (let i = 0; i < working.length; i += 1) {
      const row = working[i];
      const rowParent = String(row.progressStage || row.name || '').trim();
      if (canonicalStageKey(rowParent) === parentCanonical) {
        if (insertAt < 0) insertAt = i;
        matchedRows.push(row);
      }
    }

    const byName = new Map<string, ProgressNode>();
    matchedRows.forEach((row) => {
      const key = String(row.name || '').trim();
      if (key && !byName.has(key)) {
        byName.set(key, row);
      }
    });

    for (let i = working.length - 1; i >= 0; i -= 1) {
      const row = working[i];
      const rowParent = String(row.progressStage || row.name || '').trim();
      if (canonicalStageKey(rowParent) === parentCanonical) {
        working.splice(i, 1);
      }
    }

    if (insertAt < 0) insertAt = working.length;

    const rebuilt: ProgressNode[] = cfg.subProcesses
      .map((sp, idx) => {
        const name = String(sp?.name || '').trim();
        if (!name) return null;
        const base = byName.get(name);
        return {
          id: String(base?.id || `${stageKey}-${idx + 1}`),
          name,
          unitPrice: Number(base?.unitPrice) || 0,
          progressStage: parent,
        } as ProgressNode;
      })
      .filter((x): x is ProgressNode => Boolean(x));

    if (rebuilt.length > 0) {
      working.splice(insertAt, 0, ...rebuilt);
    }
  }

  return working;
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
      const merged = orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
      return applySubProcessRemapToNodes(merged, order);
    }
    return applySubProcessRemapToNodes(orderNodes, order);
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    return applySubProcessRemapToNodes(
      progressNodesByStyleNo[sn].filter(n => (Number(n.unitPrice) || 0) > 0),
      order,
    );
  }
  return applySubProcessRemapToNodes(fallbackNodes?.length ? fallbackNodes : defaultNodes, order);
};

/**
 * 判断工序是否属于二次工艺（子工序名 → "二次工艺"父节点）
 */
export const isSecondaryProcessSubNode = (nodeName: string, progressStage?: string): boolean => {
  const n = normalizeStageKey(nodeName);
  if (!n) return false;
  // progressStage 直接是"二次工艺" → 直接返回
  if (progressStage && normalizeStageKey(progressStage) === '二次工艺') return true;
  // 动态映射
  const dynamic = resolveDynamicParent(n);
  if (dynamic === '二次工艺') return true;
  // canonicalStageKey 别名映射
  const canonical = canonicalStageKey(n);
  if (canonical === '二次工艺') return true;
  // 硬编码兜底
  return ['绣花', '印花', '水洗', '染色', '压花', '烫钻', '烫画', '贴标', '钉珠', '贴绣', '烫金', '数码印', '打孔', '激光', '转印', '植绒', '涂层', '磨毛'].includes(n);
};

/**
 * 将节点列表中的二次工艺子工序聚合为一个"二次工艺"父节点
 * 例如：[采购, 裁剪, 绣花, 印花, 车缝, 尾部] → [采购, 裁剪, 二次工艺, 车缝, 尾部]
 *
 * ⚠️ 聚合策略（2026-04-21 修订）：
 * - 仅当订单有「≥2 个二次工艺子工序」时才聚合为父节点「二次工艺」；
 * - 只有「1 个二次工艺子工序」时，直接保留子工序原名（例如「绣花」），与页面上其他
 *   子工序名（如「整件」「整烫剪线包装」）显示风格保持一致；
 * - 工序跟进页的约定是「显示子工序名」，不应把具体子工序模糊为父节点名。
 */
export const collapseSecondaryProcessNodes = (nodes: ProgressNode[]): ProgressNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

  // 1. 找出所有二次工艺子工序
  const secondarySubs: ProgressNode[] = [];
  const nonSecondary: ProgressNode[] = [];
  for (const n of nodes) {
    const name = String(n.name || '').trim();
    if (isSecondaryProcessSubNode(name, (n as any).progressStage)) {
      secondarySubs.push(n);
    } else {
      nonSecondary.push(n);
    }
  }

  // 2. 没有二次工艺子工序 → 原样返回
  // 3. 只有 1 个二次工艺子工序 → 保留子工序原名，不聚合（显示「绣花」而非「二次工艺」）
  if (secondarySubs.length <= 1) return nodes;

  // 4. ≥2 个二次工艺子工序 → 聚合为「二次工艺」父节点（在裁剪之后，车缝之前）
  const parentNode: ProgressNode = {
    id: 'secondaryProcess',
    name: '二次工艺',
    unitPrice: 0,
    progressStage: '二次工艺',
  };

  // 找到插入位置：在"裁剪"之后
  let insertAt = nonSecondary.findIndex(n => {
    const nn = String(n.name || '').trim();
    return isCuttingStageKey(nn);
  });
  if (insertAt >= 0) {
    insertAt += 1; // 插入到裁剪之后
  } else {
    insertAt = 0; // 没有裁剪节点，插入到最前面
  }

  const result = [...nonSecondary];
  result.splice(insertAt, 0, parentNode);
  return result;
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
      const merged = orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
      // ★ 二次工艺子工序聚合：将绣花/印花等子工序合并为"二次工艺"父节点
      return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(merged, order));
    }
    // ★ 二次工艺子工序聚合
    return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(orderNodes, order));
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    // ★ 二次工艺子工序聚合
    return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(progressNodesByStyleNo[sn], order));
  }
  return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(fallbackNodes?.length ? fallbackNodes : defaultNodes, order));
};

export const getProcessesByNodeFromOrder = (
  order: ProductionOrder | null,
  templateNodes?: ProgressNode[],
): Record<string, { name: string; unitPrice?: number; processCode?: string }[]> => {
  const templatePriceMap = new Map<string, number>();
  if (templateNodes?.length) {
    templateNodes.forEach(n => {
      const price = Number(n.unitPrice) || 0;
      if (price > 0) {
        templatePriceMap.set(n.name, price);
      }
    });
  }

  const raw = String((order as any)?.progressWorkflowJson ?? '').trim();
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      const nodes = Array.isArray(obj?.nodes) ? obj.nodes : [];
      const byNode: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
      if (nodes.length && nodes[0]?.name) {
        for (const item of nodes) {
          const n = String(item?.name || item?.processName || '').trim();
          if (!n) continue;
          const rawStage = String(item?.progressStage || '').trim();
          const stage = (rawStage && rawStage !== n) ? rawStage : (resolveDynamicParent(n) || rawStage || n);
          const storedPrice = Number(item?.unitPrice) || 0;
          const price = templatePriceMap.get(n) ?? storedPrice;
          const processCode = String(item?.id || item?.processCode || '').trim() || undefined;
          if (!byNode[stage]) byNode[stage] = [];
          byNode[stage].push({ name: n, unitPrice: price, processCode });
        }
        if (Object.keys(byNode).length > 0) return byNode;
      }
      const processesByNode = obj?.processesByNode || {};
      const result: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
      for (const k of Object.keys(processesByNode || {})) {
        const arr = Array.isArray(processesByNode[k]) ? processesByNode[k] : [];
        result[k] = arr
          .map((p: any) => {
            const name = String(p?.name || p?.processName || '').trim();
            const storedPrice = Number(p?.unitPrice) || 0;
            const processCode = String(p?.id || p?.processCode || '').trim() || undefined;
            return { name, unitPrice: templatePriceMap.get(name) ?? storedPrice, processCode };
          })
          .filter((x) => x.name);
      }
      if (Object.keys(result).length > 0) return result;
    } catch {
      // fall through to progressNodeUnitPrices fallback
    }
  }

  const unitPrices = (order as any)?.progressNodeUnitPrices;
  if (Array.isArray(unitPrices) && unitPrices.length > 0) {
    const byNode: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
    for (let idx = 0; idx < unitPrices.length; idx++) {
      const item = unitPrices[idx];
      const n = String(item?.name || item?.processName || '').trim();
      if (!n) continue;
      const rawStage = String(item?.progressStage || '').trim();
      const stage = (rawStage && rawStage !== n) ? rawStage : (resolveDynamicParent(n) || rawStage || n);
      const storedPrice = Number(item?.unitPrice) || Number(item?.price) || 0;
      const price = templatePriceMap.get(n) ?? storedPrice;
      const processCode = String(item?.id || item?.processId || item?.processCode || '').trim() || undefined;
      if (!byNode[stage]) byNode[stage] = [];
      byNode[stage].push({ name: n, unitPrice: price, processCode });
    }
    if (Object.keys(byNode).length > 0) return byNode;
  }

  return {};
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
