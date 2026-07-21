import type { OrganizationUnit } from '@/types/system';

export type CuttingFactoryMode = 'INTERNAL' | 'EXTERNAL';

const INTERNAL_UNIT_KEYWORDS = ['组', '车间', '班组', '产线', '裁剪', '车缝', '缝制', '尾部', '后整', '整烫', '包装', '质检', '工艺', '生产'];

export const isSelectableInternalUnit = (unit: OrganizationUnit) => {
  if (unit.nodeType !== 'DEPARTMENT') {
    return false;
  }
  // 只匹配部门自身名称，不匹配路径（pathNames），避免"财务部门"因上级是"车间2"而被误选入
  const name = String(unit.unitName || unit.nodeName || '').trim();
  return INTERNAL_UNIT_KEYWORDS.some((keyword) => name.includes(keyword));
};

export interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
}

export interface CuttingCreateOrderLine {
  color: string;
  size: string;
  quantity: number | null;
}

export const createEmptyOrderLine = (): CuttingCreateOrderLine => ({
  color: '',
  size: '',
  quantity: null,
});

export interface CuttingProcessNode {
  id: string;
  name: string;
  progressStage: string;
  unitPrice: number;
  machineType?: string;
  difficulty?: string;
  standardTime?: number;
  sizePrices?: Record<string, number>;
}

// 已移除 defaultCuttingProcessNodes（2026-04-28）：不再使用自动模板加载
// 用户现在必须手动从零开始配置工序

const FIXED_PARENT_NODES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

const SYNONYM_TO_PARENT: Record<string, string> = {
  '采购': '采购', '物料采购': '采购', '面辅料采购': '采购', '备料': '采购', '到料': '采购', '进料': '采购', '物料': '采购',
  '裁剪': '裁剪', '裁床': '裁剪', '剪裁': '裁剪', '开裁': '裁剪', '裁片': '裁剪', '裁切': '裁剪',
  '二次工艺': '二次工艺', '二次': '二次工艺',
  '车缝': '车缝', '缝制': '车缝', '缝纫': '车缝', '车工': '车缝', '生产': '车缝', '制作': '车缝',
  '车位': '车缝', '车间生产': '车缝', '整件': '车缝',
  '尾部': '尾部', '后整理': '尾部', '后道': '尾部',
  '入库': '入库', '仓储': '入库', '上架': '入库', '进仓': '入库', '入仓': '入库', '验收': '入库', '成品入库': '入库',
};

export function resolveProgressStage(processName: string, dynamicMapping?: Record<string, string>): string {
  if (!processName?.trim()) return '';
  const name = processName.trim();
  if (FIXED_PARENT_NODES.includes(name)) return name;
  if (dynamicMapping && dynamicMapping[name]) return dynamicMapping[name];
  if (SYNONYM_TO_PARENT[name]) return SYNONYM_TO_PARENT[name];
  for (const [keyword, parent] of Object.entries(SYNONYM_TO_PARENT)) {
    if (name.includes(keyword)) return parent;
  }
  if (dynamicMapping) {
    for (const [keyword, parent] of Object.entries(dynamicMapping)) {
      if (name.includes(keyword)) return parent;
    }
  }
  return '';
}

export interface ProcessUnitPrice {
  processName: string;
  unitPrice: number | null;
  processCode?: string;
}
