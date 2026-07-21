import { useState, useEffect } from 'react';
import { remarkApi } from '@/services/system/remarkApi';

export function useRemarkCount(orderNoForImage: string) {
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkCount, setRemarkCount] = useState(0);

  useEffect(() => {
    const targetNo = orderNoForImage;
    if (!targetNo) return;
    remarkApi.list({ targetType: 'order', targetNo }).then((res: any) => {
      const list = (res as any)?.data || res || [];
      setRemarkCount(Array.isArray(list) ? list.length : 0);
    }).catch((err) => console.error('加载订单备注列表失败:', err));
  }, [orderNoForImage]);

  return { remarkOpen, setRemarkOpen, remarkCount };
}
