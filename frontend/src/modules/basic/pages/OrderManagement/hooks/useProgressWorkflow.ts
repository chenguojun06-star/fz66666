import { useState } from 'react';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import type { ProgressNode, PricingProcess } from '../types';
import { defaultProgressNodes } from '../types';

export function useProgressWorkflow() {
  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);

  const buildProgressNodesFromTemplate = (rows: any[]): ProgressNode[] => {
    const raw = (Array.isArray(rows) ? rows : [])
      .map((n: any) => {
        const name = String(n?.name || n?.processName || '').trim();
        if (!name) return null;
        const id = String(n?.processCode || n?.id || name || '').trim() || name;
        const p = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        const progressStage = String(n?.progressStage || name).trim();
        const machineType = String(n?.machineType || '').trim();
        const standardTime = Number(n?.standardTime) || 0;
        return {
          id,
          name,
          progressStage,
          machineType,
          standardTime,
          processes: [{ id: `${id}-0`, processName: name, unitPrice, progressStage, machineType, standardTime }],
        } as unknown as ProgressNode;
      })
      .filter(Boolean) as ProgressNode[];

    // 按工序名去重，保留首次出现（防止模板返回重复行导致工资翻倍）
    const seen = new Set<string>();
    return raw.filter(n => {
      if (seen.has(n.name)) return false;
      seen.add(n.name);
      return true;
    });
  };

  const loadProgressNodesForStyle = async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) return;
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(sn);
      const result = res as Record<string, unknown>;
      if (result.code !== 200) return;
      const rows = Array.isArray(result.data) ? result.data : [];
      const normalized = buildProgressNodesFromTemplate(rows);
      if (normalized.length) {
        setProgressNodes(normalized);
      }
    } catch (e) {
      console.error('[订单] 加载工序模板失败:', e);
    }
  };

  const buildProgressWorkflowJson = (nodes: ProgressNode[]) => {
    const allProcesses: Array<{
      id: string;
      name: string;
      unitPrice: number;
      progressStage: string;
      machineType: string;
      standardTime: number;
      sortOrder: number;
    }> = [];

    const seenNames = new Set<string>();
    (Array.isArray(nodes) ? nodes : []).forEach((n, idx) => {
      const name = String(n?.name || '').trim();
      if (!name) return;
      // 按工序名去重（防止重复节点写入 JSON 导致工资翻倍）
      if (seenNames.has(name)) return;
      seenNames.add(name);

      const id = String((n as any)?.processCode || n?.id || name || '').trim() || name;
      const progressStage = String((n as any)?.progressStage || name).trim();
      const machineType = String((n as any)?.machineType || '').trim();
      const standardTime = Number((n as any)?.standardTime) || 0;

      const processes = (Array.isArray(n?.processes) ? n.processes : []) as PricingProcess[];
      const unitPrice = processes.reduce((sum, p) => sum + (Number(p?.unitPrice) || 0), 0);

      allProcesses.push({
        id,
        name,
        unitPrice,
        progressStage,
        machineType,
        standardTime,
        sortOrder: idx,
      });
    });

    const ensuredProcesses = allProcesses.length > 0
      ? allProcesses
      : defaultProgressNodes.map((n, idx) => ({
        id: n.id,
        name: n.name,
        unitPrice: (Array.isArray(n.processes) ? n.processes : []).reduce((sum, p) => sum + (Number(p.unitPrice) || 0), 0),
        progressStage: n.name,
        machineType: '',
        standardTime: 0,
        sortOrder: idx,
      }));

    const processesByNode: Record<string, typeof ensuredProcesses> = {};
    for (const p of ensuredProcesses) {
      const stage = p.progressStage || p.name;
      if (!processesByNode[stage]) {
        processesByNode[stage] = [];
      }
      processesByNode[stage].push(p);
    }

    return JSON.stringify({
      nodes: ensuredProcesses,
      processesByNode,
    });
  };

  return {
    progressNodes, setProgressNodes,
    buildProgressNodesFromTemplate,
    loadProgressNodesForStyle,
    buildProgressWorkflowJson,
  };
}
