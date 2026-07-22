import { useState, useEffect } from 'react';
import api from '@/utils/api';

const DEFAULT_COLORS = ['黑色', '白色', '灰色', '蓝色', '红色'];
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function useCommonDict() {
  const [commonColors, setCommonColors] = useState<string[]>([]);
  const [commonSizes, setCommonSizes] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [colorRes, sizeRes] = await Promise.all([
          api.get<any>('/system/dict/list', {
            params: { dictType: 'color', page: 1, pageSize: 200 },
          }),
          api.get<any>('/system/dict/list', {
            params: { dictType: 'size', page: 1, pageSize: 200 },
          }),
        ]);
        if (!mounted) return;
        const colorRecords = colorRes?.data?.records || (Array.isArray(colorRes?.data) ? colorRes.data : []);
        const sizeRecords = sizeRes?.data?.records || (Array.isArray(sizeRes?.data) ? sizeRes.data : []);
        const colorLabels = colorRecords.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        const sizeLabels = sizeRecords.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        if (colorLabels.length) setCommonColors(colorLabels);
        else setCommonColors(DEFAULT_COLORS);
        if (sizeLabels.length) setCommonSizes(sizeLabels);
        else setCommonSizes(DEFAULT_SIZES);
      } catch {
        if (mounted) {
          setCommonColors(DEFAULT_COLORS);
          setCommonSizes(DEFAULT_SIZES);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return {
    commonColors,
    setCommonColors,
    commonSizes,
    setCommonSizes,
  };
}
