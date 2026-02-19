export interface SampleStock {
  id: string;
  styleId?: string;
  styleNo: string;
  styleName?: string;
  sampleType: string; // development, pre_production, shipment, sales
  color: string;
  size: string;
  quantity: number;
  loanedQuantity: number;
  location?: string;
  imageUrl?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface SampleLoan {
  id: string;
  sampleStockId: string;
  borrower: string;
  borrowerId?: string;
  loanDate: string;
  expectedReturnDate?: string;
  returnDate?: string;
  quantity: number;
  status: string; // borrowed, returned, lost
  remark?: string;
  createTime?: string;
}

export const SampleTypeMap: Record<string, string> = {
  development: '开发样',
  pre_production: '产前样',
  shipment: '大货样',
  sales: '销售样',
};
