// 我的订单模块类型定义 —— 入库/出库/发货域

export interface ProductWarehousing extends Record<string, unknown> {
  id?: string;
  warehousingNo: string;
  orderId: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  warehousingQuantity: number;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  warehousingType: 'scan' | 'manual';
  warehouse?: string;
  qualityStatus: 'qualified' | 'unqualified';
  cuttingBundleId?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
  unqualifiedImageUrls?: string;
  defectCategory?: string;
  defectRemark?: string;
  repairRemark?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
  // 入库人员和时间信息
  warehousingOperatorName?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
  // 显示字段（后端查询时填充）
  color?: string;
  size?: string;
  cuttingQuantity?: number;
  qualityOperatorName?: string;
  receiverName?: string;
  receiverId?: string;
  /** 扫码模式: bundle(菲号) / ucode(U编码) */
  scanMode?: string;
  inspectionType?: 'IQC' | 'IPQC' | 'FQC' | 'OQC';
  aqlLevel?: string;
  sampleSize?: number;
  acceptNumber?: number;
  rejectNumber?: number;
  cpk?: number;
  ppk?: number;
  controlChartType?: string;
  defectCode?: string;
  defectSeverity?: 'critical' | 'major' | 'minor';
  inspectorCertNo?: string;
}

export interface ProductOutstock {
  id?: string;
  outstockNo: string;
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  outstockQuantity: number;
  outstockType: string;
  warehouse?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
  receiveStatus?: string;
  receiveTime?: string;
  receivedBy?: string;
  receivedByName?: string;
}

export interface FactoryShipment {
  id?: string;
  shipmentNo: string;
  orderId: string;
  orderNo: string;
  styleNo: string;
  styleName?: string;
  factoryId?: string;
  factoryName?: string;
  shipQuantity: number;
  shipTime?: string;
  shippedBy?: string;
  shippedByName?: string;
  trackingNo?: string;
  expressCompany?: string;
  shipMethod?: string;
  receiveStatus: string;
  receivedQuantity?: number;
  receiveTime?: string;
  receivedBy?: string;
  receivedByName?: string;
  remark?: string;
  tenantId?: number;
  creatorId?: string;
  creatorName?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
}

export interface FactoryShipmentDetail {
  id: string;
  shipmentId: string;
  color: string;
  sizeName: string;
  quantity: number;
}

export interface WarehousingQueryParams {
  warehousingNo?: string;
  orderNo?: string;
  styleNo?: string;
  warehouse?: string;
  warehouseAreaId?: string;
  orgUnitId?: string;
  parentOrgUnitId?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL' | '';
  /** 质检状态过滤：qualified(合格) / unqualified(不合格) / scrapped(报废) / reversed(冲销) */
  qualityStatus?: string;
  page: number;
  pageSize: number;
}
