export type OrderLine = {
  id: string;
  color: string;
  size: string;
  quantity: number;
};

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

export const defaultProgressNodes: ProgressNode[] = [
  { id: 'purchase', name: '采购', processes: [{ id: 'purchase-0', processName: '采购', unitPrice: 0 }] },
  { id: 'cutting', name: '裁剪', processes: [{ id: 'cutting-0', processName: '裁剪', unitPrice: 0 }] },
  { id: 'sewing', name: '车缝', processes: [{ id: 'sewing-0', processName: '车缝', unitPrice: 0 }] },
  { id: 'pressing', name: '大烫', processes: [{ id: 'pressing-0', processName: '大烫', unitPrice: 0 }] },
  { id: 'quality', name: '质检', processes: [{ id: 'quality-0', processName: '质检', unitPrice: 0 }] },
  { id: 'secondary-process', name: '二次工艺', processes: [{ id: 'secondary-process-0', processName: '二次工艺', unitPrice: 0 }] },
  { id: 'packaging', name: '包装', processes: [{ id: 'packaging-0', processName: '包装', unitPrice: 0 }] },
  { id: 'warehousing', name: '入库', processes: [{ id: 'warehousing-0', processName: '入库', unitPrice: 0 }] },
];
