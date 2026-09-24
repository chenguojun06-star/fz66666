export interface OutstockRecord {
  id: number;
  outstockNo: string;
  productionOrderNo?: string;
  styleNo?: string;
  styleName?: string;
  skuCode?: string;
  color?: string;
  size?: string;
  outstockQuantity: number;
  costPrice?: number;
  salesPrice?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockType?: string;
  creatorName?: string;
  createTime?: string;
  remark?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
  settlementTime?: string;
  approvalStatus?: string;
  transferInboundStatus?: string;
  approveByName?: string;
  approveTime?: string;
  platformCode?: string;
  /** D-529：套装出库溯源——销售记录关联的组合SKU */
  comboCode?: string;
  comboName?: string;
  /** D-533：套装出库时行单价记套装单价，子SKU原售价留痕于此（仅供参考） */
  originalSalesPrice?: number | null;
}

export const outstockTypeMap: Record<string, { label: string; color: string }> = {
  normal: { label: '普通出库', color: 'blue' },
  qrcode: { label: '扫码出库', color: 'green' },
  batch: { label: '批量出库', color: 'purple' },
  shipment: { label: '物流出库', color: 'cyan' },
};

/**
 * D-437：出库记录按「出库单」聚合展示。
 * 后端 /outstock-records 返回的是明细行（一码一行，同一单共享 outstockNo），
 * 用户要求列表一行 = 一张出库单，点单号看全部明细 + 整单打印——不再按码数铺开无数行。
 */
export interface GroupedOutstock {
  outstockNo: string;
  lines: OutstockRecord[];
  outstockType?: string;
  productionOrderNo?: string;
  platformCode?: string;
  styleNos: string[];
  styleNames: string[];
  /** D-529：该单命中的组合商品（套装出库时非空） */
  comboCodes: string[];
  skuCount: number;
  totalQuantity: number;
  totalAmount?: number;
  customerName?: string;
  customerPhone?: string;
  trackingNo?: string;
  expressCompany?: string;
  paymentStatus?: string;
  creatorName?: string;
  remark?: string;
  createTime?: string;
  /** 组内状态：全部明细已回入库的调拨单 = returned；全部已审核 = approved；否则 pending */
  status: 'returned' | 'approved' | 'pending';
}

/** 单行是否"已回入库的调拨明细"（不参与审核与结算） */
export function isReturnedTransferLine(r: OutstockRecord): boolean {
  return r.outstockType === 'transfer_out' && r.transferInboundStatus === 'INBOUND';
}

export function groupOutstockByNo(records: OutstockRecord[]): GroupedOutstock[] {
  const map = new Map<string, GroupedOutstock>();
  for (const r of records) {
    const key = r.outstockNo || `__no_${r.id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        outstockNo: key,
        lines: [],
        outstockType: r.outstockType,
        productionOrderNo: r.productionOrderNo,
        platformCode: r.platformCode,
        styleNos: [],
        styleNames: [],
        comboCodes: [],
        skuCount: 0,
        totalQuantity: 0,
        totalAmount: undefined,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        trackingNo: r.trackingNo,
        expressCompany: r.expressCompany,
        paymentStatus: r.paymentStatus,
        creatorName: r.creatorName,
        remark: r.remark,
        createTime: r.createTime,
        status: 'pending',
      };
      map.set(key, g);
    }
    g.lines.push(r);
    g.skuCount += 1;
    g.totalQuantity += r.outstockQuantity || 0;
    if (r.totalAmount != null) g.totalAmount = (g.totalAmount || 0) + Number(r.totalAmount);
    if (r.styleNo && !g.styleNos.includes(r.styleNo)) g.styleNos.push(r.styleNo);
    if (r.styleName && !g.styleNames.includes(r.styleName)) g.styleNames.push(r.styleName);
    if (r.comboCode && !g.comboCodes.includes(r.comboCode)) g.comboCodes.push(r.comboCode);
    if (!g.customerName && r.customerName) g.customerName = r.customerName;
    if (!g.customerPhone && r.customerPhone) g.customerPhone = r.customerPhone;
    if (!g.trackingNo && r.trackingNo) g.trackingNo = r.trackingNo;
    if (!g.expressCompany && r.expressCompany) g.expressCompany = r.expressCompany;
    if (!g.paymentStatus && r.paymentStatus) g.paymentStatus = r.paymentStatus;
    if (!g.productionOrderNo && r.productionOrderNo) g.productionOrderNo = r.productionOrderNo;
    if (!g.platformCode && r.platformCode) g.platformCode = r.platformCode;
    if (r.createTime && (!g.createTime || r.createTime > g.createTime)) g.createTime = r.createTime;
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    const allApproved = g.lines.every((l) => l.approvalStatus === 'approved' || isReturnedTransferLine(l));
    const allReturned = g.lines.every((l) => isReturnedTransferLine(l));
    g.status = allReturned ? 'returned' : allApproved ? 'approved' : 'pending';
  }
  return groups;
}
