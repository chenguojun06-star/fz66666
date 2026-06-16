export interface SampleStock {
  id: string;
  styleId?: string;
  styleNo: string;
  styleName?: string;
  patternNo?: string;
  sampleType: string; // development, pre_production, shipment, sales
  color: string;
  size: string;
  quantity: number;
  loanedQuantity: number;
  location?: string;
  imageUrl?: string;
  remark?: string;
  sampleCompletedTime?: string;
  inventoryStatus?: 'active' | 'destroyed';
  destroyTime?: string;
  destroyRemark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface SampleLoan {
  id: string;
  sampleStockId: string;
  borrower: string;
  borrowerId?: string;
  lendTo?: string;
  lendToId?: string;
  lendToType?: string; // person/factory/customer
  lendToFactoryId?: string;
  lendToFactoryName?: string;
  transferFromLoanId?: string;
  loanDate: string;
  expectedReturnDate?: string;
  returnDate?: string;
  quantity: number;
  remainingQuantity?: number;
  operatorId?: string;
  operatorName?: string;
  status: string; // borrowed, returned, lost, transferred
  remark?: string;
  createTime?: string;
}

export const SampleTypeMap: Record<string, string> = {
  development: '开发样',
  pre_production: '产前样',
  shipment: '大货样',
  sales: '销售样',
};
