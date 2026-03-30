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
  sortOrder: number;
}

export interface ParentNode {
  id: string;
  /** 阶段 key，如 carSewing / tailProcess */
  stageKey: string;
  name: string;
  /** 下单单价（只读展示，不可修改） */
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
  procurement: '面料采购',
  cutting: '裁剪',
  carSewing: '车缝',
  secondaryProcess: '二次工艺',
  tailProcess: '尾部工序',
  warehousing: '入库',
};

/** 将 progressWorkflowJson 解析成 ParentNode 数组 */
function parseParentNodes(workflowJson: string | undefined | null): ParentNode[] {
  if (!workflowJson) return getDefaultParentNodes();
  try {
    const parsed = JSON.parse(workflowJson);
    // Format A: { stages: [...] }
    const stageArr = Array.isArray(parsed?.stages)
      ? parsed.stages
      : Array.isArray(parsed?.nodes)
        ? parsed.nodes      // Format B: { nodes: [...] }
        : null;
    if (!stageArr || stageArr.length === 0) return getDefaultParentNodes();

    return stageArr
      .filter((s: any) => s?.id || s?.key)
      .map((s: any, idx: number) => ({
        id: String(s.id ?? s.key ?? `stage_${idx}`),
        stageKey: String(s.key ?? s.id ?? `stage_${idx}`),
        name: s.name ?? STAGE_DISPLAY_NAMES[s.key ?? s.id ?? ''] ?? String(s.id ?? s.key ?? `阶段${idx + 1}`),
        unitPrice: s.unitPrice ?? undefined,
        sortOrder: s.sortOrder ?? idx,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return getDefaultParentNodes();
  }
}

/** 无工序流程时的默认父节点（裁剪 / 车缝 / 尾部 / 入库） */
function getDefaultParentNodes(): ParentNode[] {
  const defaults = ['cutting', 'carSewing', 'tailProcess', 'warehousing'];
  return defaults.map((key, idx) => ({
    id: key,
    stageKey: key,
    name: STAGE_DISPLAY_NAMES[key] ?? key,
    sortOrder: idx,
  }));
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

  /** 打开子工序配置 Drawer */
  const openSubProcessRemap = useCallback(async (record: ProductionOrder) => {
    const nodes = parseParentNodes((record as any).progressWorkflowJson);
    setParentNodes(nodes);
    setRemapRecord(record);

    // 加载已有的 nodeOperations，提取 subProcessRemap 键
    try {
      const resp = await productionOrderApi.getNodeOperations(record.id as unknown as string);
      const raw = (resp as any)?.data ?? (resp as any);
      const json: string | null = typeof raw === 'string' ? raw : null;
      if (json) {
        const parsed = JSON.parse(json);
        setRemapConfig((parsed.subProcessRemap as SubProcessRemapConfig) ?? {});
      } else {
        setRemapConfig({});
      }
    } catch {
      setRemapConfig({});
    }

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
