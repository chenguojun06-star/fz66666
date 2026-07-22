import { useEffect, useState } from 'react';
import api from '@/utils/api';

export interface StockInfo {
  quantity: number;
  location: string;
  safetyStock: number;
}

export const useStockCheck = (
  materialCode: string | undefined,
  color: string | undefined,
  size: string | undefined,
): StockInfo | null => {
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);

  useEffect(() => {
    const checkStock = async () => {
      if (!materialCode) {
        setStockInfo(null);
        return;
      }
      try {
        const res = await api.get('/production/material/stock/list', {
          params: {
            page: 1,
            pageSize: 1,
            materialCode,
            color,
            size,
          },
        });
        if (res.code === 200 && res.data.records && res.data.records.length > 0) {
          const stock = res.data.records[0];
          setStockInfo({
            quantity: stock.quantity,
            location: stock.location || '未知',
            safetyStock: stock.safetyStock || 0,
          });
        } else {
          setStockInfo({ quantity: 0, location: '-', safetyStock: 0 });
        }
      } catch (e) {
        // 查询库存失败时忽略错误
      }
    };

    const timer = setTimeout(checkStock, 500);
    return () => clearTimeout(timer);
  }, [materialCode, color, size]);

  return stockInfo;
};
