import { useState, useEffect, useCallback } from 'react';
import type { ApiResult } from '@/utils/api';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import type { Sku } from '../types';

export interface EditRow {
  id: number;
  costPrice: number | null;
  salesPrice: number | null;
}

export function usePricingData() {
  const [data, setData] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [styleNo, setStyleNo] = useState('');
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: 20 };
      if (styleNo) params.styleNo = styleNo;
      const res = await api.get<ApiResult>('/style/sku/list', { params });
      const d = (res?.data ?? {}) as Record<string, unknown>;
      setData(((d.records as Sku[]) ?? []));
      setTotal((d.total as number) ?? 0);
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '加载SKU失败'); }
    finally { setLoading(false); }
  }, [page, styleNo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (row: Sku) => {
    if (!editRow) return;
    setSaving(true);
    try {
      await api.put(`/style/sku/${row.id}`, {
        costPrice: editRow.costPrice,
        salesPrice: editRow.salesPrice,
      });
      message.success('价格已保存');
      setEditRow(null);
      fetchData();
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return {
    data, loading, total, page, setPage,
    styleNo, setStyleNo,
    editRow, setEditRow,
    saving, handleSave,
    fetchData,
  };
}
