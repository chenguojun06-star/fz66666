import { useCallback, useRef, useState } from 'react';
import api from '@/utils/api';

interface MaterialDbOption {
  label: string;
  value: string;
  record?: any;
}

interface UseMaterialDbSearchResult {
  materialDbOptions: MaterialDbOption[];
  materialDbLoading: boolean;
  searchMaterialDb: (keyword: string) => void;
}

export const useMaterialDbSearch = (): UseMaterialDbSearchResult => {
  const [materialDbOptions, setMaterialDbOptions] = useState<MaterialDbOption[]>([]);
  const [materialDbLoading, setMaterialDbLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMaterialDb = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!keyword || keyword.trim().length < 1) {
      setMaterialDbOptions([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setMaterialDbLoading(true);
      try {
        const res = await api.get('/material/database/list', {
          params: { keyword: keyword, pageSize: 30 },
        });
        const records: any[] = res?.data?.records || [];
        setMaterialDbOptions(
          records.map((m) => ({
            label: `${m.materialCode || ''} - ${m.materialName || ''}`,
            value: m.materialCode || '',
            record: m,
          })),
        );
      } catch {
        setMaterialDbOptions([]);
      } finally {
        setMaterialDbLoading(false);
      }
    }, 300);
  }, []);

  return {
    materialDbOptions,
    materialDbLoading,
    searchMaterialDb,
  };
};

export const fillFormFromMaterialDb = (form: any, record: any) => {
  if (!record) return;
  const patch: Record<string, unknown> = {
    materialCode: record.materialCode || '',
    materialName: record.materialName || '',
    unit: record.unit || '',
    conversionRate: record.conversionRate != null ? Number(record.conversionRate) : undefined,
  };
  const validSet = new Set(['fabricA','fabricB','fabricC','fabricD','fabricE','liningA','liningB','liningC','liningD','liningE','accessoryA','accessoryB','accessoryC','accessoryD','accessoryE']);
  const raw = String(record.materialType || '').trim();
  if (validSet.has(raw)) {
    patch.materialType = raw;
  } else if (raw) {
    const t = raw.toLowerCase();
    if (t.startsWith('fabric')) patch.materialType = 'fabricA';
    else if (t.startsWith('lining')) patch.materialType = 'liningA';
    else if (t.startsWith('accessory')) patch.materialType = 'accessoryA';
  }
  if (record.specifications) patch.specifications = String(record.specifications);
  if (record.color) patch.color = String(record.color);
  if (record.fabricComposition) patch.fabricComposition = String(record.fabricComposition);
  if (record.fabricWidth) patch.fabricWidth = String(record.fabricWidth);
  if (record.fabricWeight) patch.fabricWeight = String(record.fabricWeight);
  if (record.unitPrice != null) patch.unitPrice = Number(record.unitPrice);
  form.setFieldsValue(patch);
};
