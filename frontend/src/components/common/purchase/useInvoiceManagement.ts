import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/utils/api';
import {
  aggregateInvoiceUrls,
  parseInvoiceUrls,
  type InvoiceUrlRow,
} from './invoiceUtils';

export type { InvoiceUrlRow } from './invoiceUtils';
export { parseInvoiceUrls } from './invoiceUtils';

interface UseInvoiceManagementParams {
  /** 持久化锚点行：聚合后的发票列表写在这一行（后端字段是行级 invoice_urls） */
  anchor: InvoiceUrlRow | null | undefined;
  /** 参与订单级聚合展示的行（该订单全部采购行）；缺省时只聚合 anchor 自身 */
  rows?: InvoiceUrlRow[];
}

/**
 * 采购发票/单据管理——全站唯一实现（D-889）。
 * 展示 = 订单内所有采购行发票并集；变更 = 整包写回锚点行并清空其余行，
 * 避免删掉的图片从另一行"复活"。三个入口（采购弹窗/节点弹窗/样衣抽屉）共用。
 */
export const useInvoiceManagement = ({ anchor, rows }: UseInvoiceManagementParams) => {
  const allRows = rows && rows.length > 0 ? rows : (anchor ? [anchor] : []);
  const anchorId = anchor?.id != null ? String(anchor.id) : '';
  const signature = allRows.map((r) => `${r.id ?? ''}:${r.invoiceUrls ?? ''}`).join('|');
  const rowsRef = useRef(allRows);
  rowsRef.current = allRows;

  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(() => aggregateInvoiceUrls(allRows));
  const [invoiceUploading, setInvoiceUploading] = useState(false);

  useEffect(() => {
    setInvoiceUrls(aggregateInvoiceUrls(rowsRef.current));
  }, [signature]);

  const persist = useCallback(async (urls: string[]) => {
    if (!anchorId) return;
    await api.post('/production/purchase/update-invoice-urls', {
      purchaseId: anchorId,
      invoiceUrls: JSON.stringify(urls),
    }).catch(() => {});
    // 其余带发票的行清空，保证「并集展示 + 单行存储」口径一致
    await Promise.all(rowsRef.current
      .filter((r) => String(r.id ?? '') !== anchorId && parseInvoiceUrls(r.invoiceUrls).length > 0)
      .map((r) => api.post('/production/purchase/update-invoice-urls', {
        purchaseId: String(r.id),
        invoiceUrls: '[]',
      }).catch(() => {})));
  }, [anchorId]);

  const handleInvoiceUpload = useCallback(async (file: File): Promise<string> => {
    setInvoiceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = (await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })) as any;
      if (res?.code !== 200 || !res?.data) throw new Error(res?.message || '上传失败');
      const url: string =
        typeof res.data === 'string' ? res.data : res.data?.url ?? '';
      return url;
    } finally {
      setInvoiceUploading(false);
    }
  }, []);

  const handleInvoiceChange = useCallback((urls: string[]) => {
    setInvoiceUrls(urls);
    void persist(urls);
  }, [persist]);

  return { invoiceUrls, invoiceUploading, handleInvoiceUpload, handleInvoiceChange };
};
