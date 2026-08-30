import type { OrderLine } from '@/types/production';
export type { OrderLine };

export type PricingProcess = {
  id: string;
  processName: string;
  unitPrice: number;
};

export type ProgressNode = {
  id: string;
  name: string;
  processes: PricingProcess[];
};

// 行业标准：生产工序只含4个核心阶段（裁剪/二次工艺/车缝/尾部）
// 采购/入库不属于生产工序，进度由采购单状态/仓库收货驱动
// D-234：删除默认的「质检/大烫/包装」——这些属于可选子工序，不是默认父阶段
export const defaultProgressNodes: ProgressNode[] = [
  { id: 'cutting', name: '裁剪', processes: [{ id: 'cutting-0', processName: '裁剪', unitPrice: 0 }] },
  { id: 'carSewing', name: '车缝', processes: [{ id: 'carSewing-0', processName: '车缝', unitPrice: 0 }] },
  { id: 'secondaryProcess', name: '二次工艺', processes: [{ id: 'secondaryProcess-0', processName: '二次工艺', unitPrice: 0 }] },
  { id: 'tailProcess', name: '尾部', processes: [{ id: 'tailProcess-0', processName: '尾部', unitPrice: 0 }] },
];
