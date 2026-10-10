import { useState, useEffect, useCallback } from 'react';
import type { ApiResult } from '@/utils/api';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { useStyleCoverImages } from '@/hooks/useStyleCoverImages';
import { readPageSize } from '@/utils/pageSizeStore';
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
  // 每页条数由 state 驱动并透传到请求：写死 20 时分页器的"每页条数"改不动
  const [pageSize, setPageSize] = useState(readPageSize(20));
  const [styleNo, setStyleNo] = useState('');
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [saving, setSaving] = useState(false);
  const { imageMap, fetchByStyleNos } = useStyleCoverImages();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (styleNo) params.styleNo = styleNo;
      const res = await api.get<ApiResult>('/style/sku/list', { params });
      const d = (res?.data ?? {}) as Record<string, unknown>;
      const records = (d.records as Sku[]) ?? [];
      setData(records);
      setTotal((d.total as number) ?? 0);
      // 异步加载款号封面图
      fetchByStyleNos(records.map(r => r.styleNo));
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '加载商品编码失败'); }
    finally { setLoading(false); }
  }, [page, pageSize, styleNo, fetchByStyleNos]);

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
    data, loading, total, page, setPage, pageSize, setPageSize,
    styleNo, setStyleNo,
    editRow, setEditRow,
    saving, handleSave,
    fetchData,
    imageMap,
  };
}
