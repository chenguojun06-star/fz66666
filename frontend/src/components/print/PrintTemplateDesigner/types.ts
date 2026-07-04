/**
 * 打印模板设计器类型定义
 */

export interface TemplateField {
  id: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  width?: number;
}

export interface TemplateConfig {
  type: 'LABEL' | 'SHIPPING' | 'PURCHASE' | 'INBOUND';
  width: number;
  height: number;
  unit: 'mm' | 'px';
  fields: TemplateField[];
}

export interface PrintTemplate {
  id?: number;
  tenantId?: number;
  templateName: string;
  templateType: string;
  configJson: string;
  isDefault?: boolean;
  createTime?: string;
  updateTime?: string;
}

export interface DraggableFieldItem {
  id: string;
  label: string;
  category?: string;
}

export const FIELD_LIST: DraggableFieldItem[] = [
  { id: 'styleNo', label: '款号', category: '款式信息' },
  { id: 'styleName', label: '款式名称', category: '款式信息' },
  { id: 'color', label: '颜色', category: '款式信息' },
  { id: 'size', label: '尺码', category: '款式信息' },
  { id: 'quantity', label: '数量', category: '款式信息' },
  { id: 'customerName', label: '客户名称', category: '订单信息' },
  { id: 'orderNo', label: '订单号', category: '订单信息' },
  { id: 'orderDate', label: '订单日期', category: '订单信息' },
  { id: 'deliveryDate', label: '交货日期', category: '订单信息' },
  { id: 'price', label: '价格', category: '财务信息' },
  { id: 'totalAmount', label: '总金额', category: '财务信息' },
  { id: 'factoryName', label: '工厂名称', category: '生产信息' },
  { id: 'operatorName', label: '操作员', category: '生产信息' },
  { id: 'processName', label: '工序名称', category: '生产信息' },
  { id: 'barcode', label: '条码', category: '标识' },
  { id: 'qrCode', label: '二维码', category: '标识' },
  { id: 'remark', label: '备注', category: '其他' },
];

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  type: 'LABEL',
  width: 80,
  height: 50,
  unit: 'mm',
  fields: [],
};

export const TEMPLATE_TYPE_OPTIONS = [
  { value: 'LABEL', label: '标签' },
  { value: 'SHIPPING', label: '发货单' },
  { value: 'PURCHASE', label: '采购单' },
  { value: 'INBOUND', label: '入库单' },
];