import { useState } from 'react';
import api from '@/utils/api';
import { CUTTING_STAGE_ORDER } from '@/utils/productionStage';
import {
  type CuttingProcessNode,
  resolveProgressStage,
} from './cuttingCreateTaskHelpers';

interface UseCuttingProcessNodesOptions {
  message: any;
  dynamicProcessMapping: Record<string, string>;
}

export function useCuttingProcessNodes({ message, dynamicProcessMapping }: UseCuttingProcessNodesOptions) {
  const [createProcessNodes, setCreateProcessNodes] = useState<CuttingProcessNode[]>([]);

  const addProcessNodeToStage = (stage: string) => {
    const targetStage = CUTTING_STAGE_ORDER.includes(stage) ? stage : '裁剪';
    const maxSort = createProcessNodes.length;
    const nextId = String(maxSort + 1).padStart(2, '0');
    setCreateProcessNodes((prev) => [...prev, { id: nextId, name: '', progressStage: targetStage, unitPrice: 0, machineType: '', difficulty: '', standardTime: 0, sizePrices: {} }]);
  };

  const importFromTemplate = async (templateStyleNo: string) => {
    const sn = String(templateStyleNo || '').trim();
    if (!sn) return;
    try {
      const res = await api.get<{ code: number; data: any }>('/template-library/process-price-template', {
        params: { styleNo: sn },
      });
      if (res.code === 200 && res.data) {
        const content = res.data.content || {};
        const steps: any[] = content.steps || [];
        if (steps.length === 0) {
          message.warning('该款号暂无工序模板数据');
          return;
        }
        const nodes: CuttingProcessNode[] = steps.map((step, idx) => ({
          id: String(idx + 1).padStart(2, '0'),
          name: String(step.processName || step.name || '').trim(),
          progressStage: String(step.progressStage || '').trim() || resolveProgressStage(String(step.processName || step.name || ''), dynamicProcessMapping) || '裁剪',
          unitPrice: typeof step.unitPrice === 'number' ? step.unitPrice : 0,
          machineType: String(step.machineType || '').trim(),
          difficulty: String(step.difficulty || '').trim(),
          standardTime: typeof step.standardTime === 'number' ? step.standardTime : 0,
          sizePrices: step.sizePrices && typeof step.sizePrices === 'object' ? step.sizePrices : {},
        })).filter(n => n.name);
        setCreateProcessNodes(nodes);
        message.success(`已导入 ${nodes.length} 道工序`);
      } else {
        message.warning('该款号暂无工序模板数据');
      }
    } catch {
      message.error('模板加载失败');
    }
  };

  const addProcessNode = () => {
    addProcessNodeToStage('裁剪');
  };

  const removeProcessNode = (index: number) => {
    setCreateProcessNodes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateProcessNode = (index: number, field: keyof CuttingProcessNode, value: string | number) => {
    setCreateProcessNodes((prev) => prev.map((node, idx) => {
      if (idx !== index) return node;
      const updated = { ...node, [field]: value };
      if (field === 'name' && typeof value === 'string') {
        const resolved = resolveProgressStage(value, dynamicProcessMapping);
        if (resolved && CUTTING_STAGE_ORDER.includes(resolved)) {
          updated.progressStage = resolved;
        }
      }
      return updated;
    }));
  };

  const buildCuttingWorkflowJson = (): string | undefined => {
    const sorted = [...createProcessNodes].sort((a, b) => {
      const stageA = a.progressStage || resolveProgressStage(a.name, dynamicProcessMapping) || '裁剪';
      const stageB = b.progressStage || resolveProgressStage(b.name, dynamicProcessMapping) || '裁剪';
      const sa = CUTTING_STAGE_ORDER.indexOf(stageA);
      const sb = CUTTING_STAGE_ORDER.indexOf(stageB);
      if (sa !== sb) return sa - sb;
      return 0;
    });
    const nodes = sorted
      .filter((n) => String(n.name || '').trim())
      .map((n, idx) => {
        const node: Record<string, any> = {
          id: String(idx + 1).padStart(2, '0'),
          name: n.name,
          processCode: String(idx + 1).padStart(2, '0'),
          progressStage: n.progressStage || resolveProgressStage(n.name, dynamicProcessMapping) || '',
          unitPrice: n.unitPrice,
        };
        if (n.machineType) node.machineType = n.machineType;
        if (n.difficulty) node.difficulty = n.difficulty;
        if (n.standardTime) node.standardTime = n.standardTime;
        if (n.sizePrices && Object.keys(n.sizePrices).length > 0) node.sizePrices = n.sizePrices;
        return node;
      });
    if (nodes.length === 0) return undefined;
    return JSON.stringify({ nodes });
  };

  return {
    createProcessNodes,
    setCreateProcessNodes,
    addProcessNode,
    addProcessNodeToStage,
    removeProcessNode,
    updateProcessNode,
    importFromTemplate,
    buildCuttingWorkflowJson,
  };
}
