/**
 * usePurchaseExport — 采购列表导出 Excel
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 */
import dayjs from 'dayjs';
import { exportToExcel } from '@/utils/excelExport';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialQuantity, formatReferenceKilograms, subtractMaterialQuantity } from '../utils';

interface UsePurchaseExportOptions {
  message: any;
  purchaseList: MaterialPurchaseType[];
}

export function usePurchaseExport({ message, purchaseList }: UsePurchaseExportOptions) {
  const handleExport = async () => {
    if (!purchaseList.length) { message.warning('当前没有数据可导出'); return; }
    const exportColumns = [
      { header: '序号', key: 'no', width: 6 },
      { header: '订单号', key: 'orderNo', width: 18 },
      { header: '采购单号', key: 'purchaseNo', width: 18 },
      { header: '物料类型', key: 'materialType', width: 10 },
      { header: '物料名称', key: 'materialName', width: 20 },
      { header: '物料编码', key: 'materialCode', width: 16 },
      { header: '规格', key: 'specifications', width: 14 },
      { header: '供应商', key: 'supplierName', width: 18 },
      { header: '采购数量', key: 'purchaseQuantity', width: 10 },
      { header: '参考公斤数', key: 'referenceKilograms', width: 12 },
      { header: '到货数量', key: 'arrivedQuantity', width: 10 },
      { header: '待到数量', key: 'pendingQuantity', width: 10 },
      { header: '单价', key: 'unitPrice', width: 10 },
      { header: '总金额', key: 'totalAmount', width: 12 },
      { header: '状态', key: 'status', width: 10 },
      { header: '领取人', key: 'receiverName', width: 12 },
      { header: '创建时间', key: 'createTime', width: 20 },
    ];
    const exportData = purchaseList.map((item, index) => [
      index + 1,
      item.orderNo || '-',
      item.purchaseNo || '-',
      item.materialType || '-',
      item.materialName || '-',
      item.materialCode || '-',
      item.specifications || '-',
      item.supplierName || '-',
      formatMaterialQuantity(item.purchaseQuantity),
      formatReferenceKilograms(item.purchaseQuantity, item.conversionRate, item.unit),
      formatMaterialQuantity(item.arrivedQuantity),
      formatMaterialQuantity(subtractMaterialQuantity(item.purchaseQuantity, item.arrivedQuantity)),
      item.unitPrice ?? '-',
      item.totalAmount ?? '-',
      item.status || '-',
      item.receiverName || '-',
      item.createTime || '-',
    ]);
    try {
      await exportToExcel(
        exportData.map((row) => Object.fromEntries(exportColumns.map((c, i) => [c.key, row[i]]))),
        exportColumns,
        `面辅料采购_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`,
      );
      message.success('导出成功');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导出失败');
    }
  };

  return { handleExport };
}
