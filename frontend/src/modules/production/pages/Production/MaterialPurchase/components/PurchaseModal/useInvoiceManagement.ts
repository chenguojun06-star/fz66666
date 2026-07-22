import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { parseInvoiceUrls } from './PurchaseDetailView.helpers';

interface UseInvoiceManagementParams {
  currentPurchase: MaterialPurchaseType | null;
}

export const useInvoiceManagement = ({ currentPurchase }: UseInvoiceManagementParams) => {
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(() =>
    parseInvoiceUrls((currentPurchase as any)?.invoiceUrls)
  );
  const [invoiceUploading, setInvoiceUploading] = useState(false);

  const persistInvoiceUrls = useCallback(
    async (urls: string[]) => {
      if (!currentPurchase?.id) return;
      await api
        .post('/production/purchase/update-invoice-urls', {
          purchaseId: currentPurchase.id,
          invoiceUrls: JSON.stringify(urls),
        })
        .catch(() => {});
    },
    [currentPurchase?.id]
  );

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

  const handleInvoiceChange = useCallback(
    (urls: string[]) => {
      setInvoiceUrls(urls);
      void persistInvoiceUrls(urls);
    },
    [persistInvoiceUrls]
  );

  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls((currentPurchase as any)?.invoiceUrls));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPurchase?.id]);

  return {
    invoiceUrls,
    invoiceUploading,
    handleInvoiceUpload,
    handleInvoiceChange,
  };
};
