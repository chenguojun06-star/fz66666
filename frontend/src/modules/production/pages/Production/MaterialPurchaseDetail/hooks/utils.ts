import React from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { UserInfo } from '@/utils/AuthContext.types';

export const getOperatorName = (user: UserInfo | null): string =>
  String(user?.name || user?.username || '').trim();

export const handleFormSubmitError = (
  error: unknown,
  message: MessageInstance,
  fallbackMsg: string
): void => {
  const formError = error as { errorFields?: Array<{ errors?: string[] }> };
  if (formError?.errorFields?.length) {
    message.error(formError.errorFields[0]?.errors?.[0] || '请填写数量');
  } else {
    message.error((error as Error).message || fallbackMsg);
  }
};

interface BatchItemRenderProps {
  name: string;
  desc: string;
  qtyText: string;
}

export const buildBatchModalContent = (
  items: MaterialPurchase[],
  titlePrefix: string,
  renderItem: (item: MaterialPurchase, idx: number) => BatchItemRenderProps
): React.ReactElement =>
  React.createElement('div', null,
    React.createElement('p', null, `${titlePrefix} ${items.length} 项物料：`),
    React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', marginTop: 8, fontSize: 13 } },
      items.map((item, idx) => {
        const { name, desc, qtyText } = renderItem(item, idx);
        return React.createElement('div', {
          key: idx,
          style: {
            padding: '6px 0',
            borderBottom: '1px solid var(--color-border-light)',
            display: 'flex',
            justifyContent: 'space-between',
          },
        },
          React.createElement('span', null, `${name} · ${desc}`),
          React.createElement('span', { style: { color: 'var(--color-primary)' } }, qtyText)
        );
      })
    )
  );

export const exportPurchaseListCSV = (
  purchaseList: MaterialPurchase[],
  styleNoParam: string,
  message: MessageInstance
): void => {
  if (!purchaseList.length) {
    message.info('没有可导出的数据');
    return;
  }
  const header = '物料类型,物料名称,物料编码,颜色,尺码,单位,单价,采购数量,到货数量,金额,供应商,采购日期,最新到货日期,状态\n';
  const rows = purchaseList.map((item) => {
    const amount = Number(item.purchaseQuantity || 0) * Number(item.unitPrice || 0);
    return [
      item.materialType || '',
      item.materialName || '',
      item.materialCode || '',
      item.color || '',
      item.size || '',
      item.unit || '',
      item.unitPrice || '',
      item.purchaseQuantity || '',
      item.arrivedQuantity || '',
      amount.toFixed(2),
      item.supplierName || '',
      item.receivedTime || '',
      item.expectedArrivalDate || '',
      item.status || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  }).join('\n');
  const csv = '\uFEFF' + header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `采购明细_${styleNoParam}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  message.success('导出成功');
};

export const filterPendingPurchases = (list: MaterialPurchase[]): MaterialPurchase[] =>
  list.filter(
    (p) =>
      String(p.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.PENDING &&
      String(p.id || '').trim()
  );

export const filterReturnablePurchases = (list: MaterialPurchase[]): MaterialPurchase[] =>
  list.filter((p) => {
    const s = String(p.status || '').toLowerCase();
    return (
      (s === MATERIAL_PURCHASE_STATUS.RECEIVED ||
        s === MATERIAL_PURCHASE_STATUS.PARTIAL ||
        s === MATERIAL_PURCHASE_STATUS.COMPLETED) &&
      Number(p.returnConfirmed ? 1 : 0) !== 1
    );
  });

export const filterAwaitingConfirmPurchases = (list: MaterialPurchase[]): MaterialPurchase[] =>
  list.filter(
    (p) => String(p.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM
  );
