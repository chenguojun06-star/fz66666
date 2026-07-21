/**
 * 工序节点解析逻辑。
 *
 * 抽自原 FlowStepRenderer.tsx 中"工序详细信息"tab 内的 IIFE，
 * 用于把订单 progressWorkflowJson / progressNodeUnitPrices 解析成统一的 workflowNodes 结构。
 */

export interface WorkflowNode {
  id: string;
  name: string;
  progressStage: string;
  machineType: string;
  standardTime: number;
  unitPrice: number;
  sortOrder: number;
  description: string;
}

/**
 * 解析订单的工序节点。
 *
 * 优先级：
 * 1. progressWorkflowJson.nodes（含 name）
 * 2. progressWorkflowJson.processesByNode（按 node 聚合）
 * 3. progressNodeUnitPrices
 *
 * @param order 订单对象
 * @returns 工序节点数组（可能为空）
 */
export function extractWorkflowNodes(order: any): WorkflowNode[] {
  let workflowNodes: WorkflowNode[] = [];

  try {
    if (order?.progressWorkflowJson) {
      const workflow = typeof order.progressWorkflowJson === 'string'
        ? JSON.parse(order.progressWorkflowJson)
        : order.progressWorkflowJson;
      const nodes = workflow?.nodes || [];

      if (nodes.length > 0 && nodes[0]?.name) {
        workflowNodes = nodes.map((item: any, idx: number) => ({
          id: item.id || `proc_${idx}`,
          name: item.name || item.processName || '',
          progressStage: item.progressStage || '',
          machineType: item.machineType || '',
          standardTime: item.standardTime || 0,
          unitPrice: Number(item.unitPrice) || 0,
          sortOrder: item.sortOrder ?? idx,
          description: item.description || item.remark || '',
        }));
      } else {
        const processesByNode = workflow?.processesByNode || {};
        const allProcesses: WorkflowNode[] = [];
        let sortIdx = 0;
        for (const node of nodes) {
          const nodeProcesses = processesByNode[node?.id || ''] || [];
          for (const p of nodeProcesses) {
            allProcesses.push({
              id: p.id || `proc_${sortIdx}`,
              name: p.name || p.processName || '',
              progressStage: p.progressStage || node?.progressStage || node?.name || '',
              machineType: p.machineType || '',
              standardTime: p.standardTime || 0,
              unitPrice: Number(p.unitPrice) || 0,
              sortOrder: sortIdx,
              description: p.description || p.remark || '',
            });
            sortIdx++;
          }
        }
        workflowNodes = allProcesses;
      }
    }
  } catch { /* ignore */ }

  if (
    workflowNodes.length === 0
    && Array.isArray(order?.progressNodeUnitPrices)
    && order.progressNodeUnitPrices.length > 0
  ) {
    workflowNodes = order.progressNodeUnitPrices.map((item: any, idx: number) => ({
      id: item.id || item.processId || `node_${idx}`,
      name: item.name || item.processName || '',
      progressStage: item.progressStage || '',
      machineType: item.machineType || '',
      standardTime: item.standardTime || 0,
      unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
      sortOrder: item.sortOrder ?? idx,
      description: item.description || item.remark || '',
    }));
  }

  return workflowNodes;
}

/**
 * 给工序节点补充描述（基于 processMap / secondaryProcessMap）。
 */
export function enrichWorkflowNodes(
  nodes: WorkflowNode[],
  styleProcessDescriptionMap: Map<string, string>,
  secondaryProcessDescriptionMap: Map<string, string>,
): WorkflowNode[] {
  return nodes.map((item) => {
    const processName = String(item?.name || '').trim();
    const stageName = String(item?.progressStage || '').trim();
    const isSecondary = stageName.includes('二次工艺') || processName.includes('二次工艺');
    const description = String(item?.description || '').trim()
      || (isSecondary
        ? secondaryProcessDescriptionMap.get(processName)
        : styleProcessDescriptionMap.get(processName)) || '';
    return { ...item, description };
  });
}
