/**
 * useSubProcessRemap — 子工序临时重分配 Hook
 *
 * 功能：外发工厂可为每个父节点临时增删/排序子工序，
 *       只影响进度追踪分组显示，不修改父节点单价，不影响工资结算。
 *
 * 存储：作为 nodeOperations JSON 的 subProcessRemap 键追加保存；
 *       永不覆盖其他已有键，安全合并。
 */

import { useState, useCallback } from 'react';
import { productionOrderApi } from '@/services/production/productionApi';
import type { ProductionOrder } from '@/types/production';

// ==============================
// 类型定义
// ==============================

export interface SubProcess {
  id: string;
  name: string;
  /** 进度权重（1~100，选填；系统计算进度时按比例分配，均等默认） */
  ratio?: number;
  /** 外发厂自定义单价（仅厂方内部参考，系统不读取该值用于结算） */
  unitPrice?: number;
  sortOrder: number;
}

export interface ParentNode {
  id: string;
  /** 阶段 key，如 carSewing / tailProcess */
  stageKey: string;
  name: string;
  /** 单价（只读展示，不可修改） */
  unitPrice?: number;
  sortOrder: number;
}

export interface SubProcessRemapEntry {
  enabled: boolean;
  subProcesses: SubProcess[];
}

export type SubProcessRemapConfig = Record<string, SubProcessRemapEntry>;

interface UseSubProcessRemapOptions {
  message: { success: (msg: string) => void; error: (msg: string) => void };
  fetchProductionList: () => void;
}

// ==============================
// 工具函数：解析 progressWorkflowJson 提取父节点
// ==============================

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  procurement: '采购',
  cutting: '裁剪',
  carSewing: '车缝',
  secondaryProcess: '二次工艺',
  tailProcess: '尾部',
  warehousing: '入库',
};

// ── 固定六大父节点（业务约定，不从 workflow JSON 解析）
const CANONICAL_STAGES: Array<{ key: string; sortOrder: number }> = [
  { key: 'procurement', sortOrder: 0 },
  { key: 'cutting', sortOrder: 1 },
  { key: 'secondaryProcess', sortOrder: 2 },
  { key: 'carSewing', sortOrder: 3 },
  { key: 'tailProcess', sortOrder: 4 },
  { key: 'warehousing', sortOrder: 5 },
];

/** 返回固定 6 个父节点（采购 / 裁剪 / 二次工艺 / 车缝 / 尾部 / 入库） */
function getCanonicalParentNodes(): ParentNode[] {
  return CANONICAL_STAGES.map(({ key, sortOrder }) => ({
    id: key,
    stageKey: key,
    name: STAGE_DISPLAY_NAMES[key] ?? key,
    sortOrder,
  }));
}

// ── 工序中文名 → 父节点 key（把 workflow 扁平节点归类到 6 个父阶段）
const PROCESS_NAME_TO_PARENT: Record<string, string> = {
  '采购': 'procurement', '物料采购': 'procurement', '面辅料采购': 'procurement', '备料': 'procurement', '到料': 'procurement', '进料': 'procurement', '物料': 'procurement',
  '裁剪': 'cutting', '裁床': 'cutting', '裁切': 'cutting', '裁片': 'cutting', '剪裁': 'cutting', '开裁': 'cutting',
  '二次工艺': 'secondaryProcess', '二次': 'secondaryProcess',
  '车缝': 'carSewing', '缝制': 'carSewing', '车位': 'carSewing', '整件': 'carSewing', '生产': 'carSewing', '制作': 'carSewing', '车间生产': 'carSewing',
  '尾部': 'tailProcess', '后整理': 'tailProcess', '后道': 'tailProcess',
  '入库': 'warehousing', '验收': 'warehousing', '成品入库': 'warehousing', '仓储': 'warehousing', '上架': 'warehousing', '进仓': 'warehousing', '入仓': 'warehousing',
};

// 后端默认 ID → 父节点 key（兼容 ProductionOrderCreationTool 等后端 ID 格式）
const PROCESS_ID_TO_PARENT: Record<string, string> = {
  purchase: 'procurement', procurement: 'procurement',
  cutting: 'cutting',
  sewing: 'carSewing', carSewing: 'carSewing',
  'secondary-process': 'secondaryProcess', secondaryProcess: 'secondaryProcess',
  pressing: 'tailProcess', quality: 'tailProcess',
  packaging: 'tailProcess', tailProcess: 'tailProcess',
  warehousing: 'warehousing',
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 确定一个工序节点应归属哪个父阶段 */
function resolveParentKey(progressStage: string | undefined, name: string, id: string): string {
  if (progressStage) {
    const k = PROCESS_NAME_TO_PARENT[progressStage.trim()];
    if (k) return k;
  }
  const byName = PROCESS_NAME_TO_PARENT[name.trim()];
  if (byName) return byName;
  const byId = PROCESS_ID_TO_PARENT[id.trim()];
  if (byId) return byId;
  // 模糊匹配：名称包含已知关键词
  for (const [keyword, parentKey] of Object.entries(PROCESS_NAME_TO_PARENT)) {
    if (name.includes(keyword)) return parentKey;
  }
  // 默认归入尾部工序（覆盖最广的杂项节点）
  return 'tailProcess';
}

/** 解析 progressWorkflowJson 中的扁平工序节点，按父阶段归类为初始子工序 */
function parseWorkflowSubProcesses(
  workflowJson: string | undefined | null,
): Record<string, SubProcess[]> {
  const result: Record<string, SubProcess[]> = {};
  if (!workflowJson) return result;
  try {
    const parsed = JSON.parse(workflowJson);
    const nodes: any[] = Array.isArray(parsed?.nodes)
      ? parsed.nodes
      : Array.isArray(parsed?.stages) ? parsed.stages : [];
    if (nodes.length === 0) return result;
    for (const node of nodes) {
      const name = String(node.name ?? '').trim();
      const id = String(node.id ?? node.key ?? '').trim();
      if (!name && !id) continue;
      const progressStage = node.progressStage ? String(node.progressStage).trim() : undefined;
      const parentKey = resolveParentKey(progressStage, name || id, id);
      if (!result[parentKey]) result[parentKey] = [];
      result[parentKey].push({
        id: genId(),
        name: name || id,
        sortOrder: typeof node.sortOrder === 'number' ? node.sortOrder : result[parentKey].length,
      });
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'));
    }
    return result;
  } catch {
    return result;
  }
}

// ==============================
// Hook 主体
// ==============================

export function useSubProcessRemap({ message, fetchProductionList }: UseSubProcessRemapOptions) {
  const [remapVisible, setRemapVisible] = useState(false);
  const [remapRecord, setRemapRecord] = useState<ProductionOrder | null>(null);
  const [parentNodes, setParentNodes] = useState<ParentNode[]>([]);
  const [remapConfig, setRemapConfig] = useState<SubProcessRemapConfig>({});
  const [remapSaving, setRemapSaving] = useState(false);

  /** 打开子工序配置弹窗 */
  const openSubProcessRemap = useCallback(async (record: ProductionOrder) => {
    // 固定 6 个父节点
    const nodes = getCanonicalParentNodes();
    setParentNodes(nodes);
    setRemapRecord(record);

    // 解析工作流中的工序，按父阶段归类为初始子工序
    const workflowSubs = parseWorkflowSubProcesses((record as any).progressWorkflowJson);

    // 加载已有的 nodeOperations，提取 subProcessRemap 键
    let savedConfig: SubProcessRemapConfig = {};
    try {
      const resp = await productionOrderApi.getNodeOperations(record.id as unknown as string);
      const raw = (resp as any)?.data ?? (resp as any);
      const json: string | null = typeof raw === 'string' ? raw : null;
      if (json) {
        const parsed = JSON.parse(json);
        savedConfig = (parsed.subProcessRemap as SubProcessRemapConfig) ?? {};
      }
    } catch {
      // no-op
    }

    // 合并策略：已保存的条目优先；未保存的阶段用 workflow 衍生子工序预填
    const hasSaved = Object.keys(savedConfig).length > 0;
    const mergedConfig: SubProcessRemapConfig = {};
    for (const { key } of CANONICAL_STAGES) {
      if (savedConfig[key]) {
        mergedConfig[key] = savedConfig[key];
      } else if (workflowSubs[key] && workflowSubs[key].length > 0) {
        // 首次打开(无保存)自动启用；有保存记录时新阶段默认关闭
        mergedConfig[key] = { enabled: !hasSaved, subProcesses: workflowSubs[key] };
      }
    }
    setRemapConfig(mergedConfig);

    setRemapVisible(true);
  }, []);

  /** 关闭 Drawer */
  const closeRemap = useCallback(() => {
    setRemapVisible(false);
    setRemapRecord(null);
    setRemapConfig({});
    setParentNodes([]);
  }, []);

  /** 保存子工序配置（追加 subProcessRemap 键，不覆盖其他键） */
  const saveRemap = useCallback(async (config: SubProcessRemapConfig) => {
    if (!remapRecord) return;
    setRemapSaving(true);
    try {
      // 先拉最新 nodeOperations，合并写入
      let existingObj: Record<string, unknown> = {};
      try {
        const resp = await productionOrderApi.getNodeOperations(remapRecord.id as unknown as string);
        const raw = (resp as any)?.data ?? (resp as any);
        if (typeof raw === 'string' && raw.trim()) {
          existingObj = JSON.parse(raw);
        }
      } catch {
        // 旧数据解析失败时从空对象开始
      }

      const merged = { ...existingObj, subProcessRemap: config };
      await productionOrderApi.saveNodeOperations(
        remapRecord.id as unknown as string,
        JSON.stringify(merged),
      );

      message.success('子工序配置已保存');
      closeRemap();
      fetchProductionList();
    } catch {
      message.error('保存失败，请重试');
    } finally {
      setRemapSaving(false);
    }
  }, [remapRecord, closeRemap, fetchProductionList, message]);

  return {
    remapVisible,
    remapRecord,
    parentNodes,
    remapConfig,
    remapSaving,
    openSubProcessRemap,
    closeRemap,
    saveRemap,
  };
}
