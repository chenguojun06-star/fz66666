import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { Form } from 'antd';
import type { ApiResult } from '@/utils/api';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';
import type { EcOrder } from '../types';

export function useEcommerceOrdersData() {
  const [data, setData] = useState<EcOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(20));
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | undefined>();
  const [filterLinked, setFilterLinked] = useState<boolean | undefined>();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const prevDebouncedKeywordRef = useRef(debouncedKeyword);
  if (debouncedKeyword !== prevDebouncedKeywordRef.current) {
    prevDebouncedKeywordRef.current = debouncedKeyword;
    setPage(1);
  }
  const [detail, setDetail] = useState<EcOrder | null>(null);
  const [linkTarget, setLinkTarget] = useState<EcOrder | null>(null);
  const [linkForm] = Form.useForm();
  const [linking, setLinking] = useState(false);
  const [outboundTarget, setOutboundTarget] = useState<EcOrder | null>(null);
  const [outboundForm] = Form.useForm();
  const [outbounding, setOutbounding] = useState(false);
  const [styleImageMap, setStyleImageMap] = useState<Record<string, string>>({});

  const fetchStyleImages = useCallback(async (orders: EcOrder[]) => {
    const styleNos = [...new Set(
      orders.map(o => (o.skuCode || '').split('-')[0]).filter(Boolean)
    )];
    if (styleNos.length === 0) return;
    const results = await Promise.allSettled(
      styleNos.map(sn =>
        api.get('/style/info/list', { params: { styleNo: sn, pageSize: 5 } })
      )
    );
    const map: Record<string, string> = {};
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        const records: Array<{ styleNo: string; cover?: string }> =
          (res.value as any)?.data?.records ?? [];
        const exact = records.find(s => s.styleNo === styleNos[i]);
        if (exact?.cover) map[styleNos[i]] = exact.cover;
      }
    });
    setStyleImageMap(prev => ({ ...prev, ...map }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (filterPlatform) params.platform = filterPlatform;
      if (filterStatus !== undefined) params.status = filterStatus;
      if (filterLinked !== undefined) params.productionOrderLinked = filterLinked;
      if (debouncedKeyword) params.keyword = debouncedKeyword;
      const res = await api.post<ApiResult>('/ecommerce/orders/list', params);
      const d = (res?.data ?? {}) as Record<string, unknown>;
      const records: EcOrder[] = (d.records as EcOrder[]) ?? [];
      setData(records);
      setTotal((d.total as number) ?? 0);
      // 异步加载款式图片，不阻塞主流程
      fetchStyleImages(records);
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '加载失败'); }
    finally { setLoading(false); }
  }, [page, pageSize, filterPlatform, filterStatus, filterLinked, debouncedKeyword, fetchStyleImages]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // linkForm / outboundForm 在 Modal 内部，关闭时 Form 已卸载，无需手动 resetFields
  // （Form 重新打开时会自动从初始值渲染，不会保留脏数据）

  const handleLink = async () => {
    if (!linkTarget) return;
    try {
      const v = await linkForm.validateFields();
      setLinking(true);
      await api.post(`/ecommerce/orders/${linkTarget.id}/link`, {
        productionOrderNo: v.productionOrderNo,
      });
      message.success('关联成功，出库时自动回写物流状态');
      setLinkTarget(null);
      fetchData();
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '关联失败'); }
    finally { setLinking(false); }
  };

  const handleDirectOutbound = async () => {
    if (!outboundTarget) return;
    try {
      const v = await outboundForm.validateFields();
      setOutbounding(true);
      await api.post(`/ecommerce/orders/${outboundTarget.id}/direct-outbound`, {
        trackingNo: v.trackingNo,
        expressCompany: v.expressCompany,
      });
      message.success('现货出库成功，收入流水已自动记录');
      setOutboundTarget(null);
      fetchData();
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '出库失败'); }
    finally { setOutbounding(false); }
  };

  const pendingShip   = data.filter(d => d.status === 1).length;
  const shipped       = data.filter(d => d.warehouseStatus === 2).length;
  const linked        = data.filter(d => d.productionOrderNo).length;
  const pendingHandle = data.filter(d => d.status === 1 && !d.productionOrderNo).length;
  const totalRevenue  = data.reduce((s, d) => s + (d.payAmount || 0), 0);

  const isFilteringPending = filterLinked === false && filterStatus === 1;

  return {
    data, total, loading, page, pageSize, setPage, setPageSize,
    filterPlatform, setFilterPlatform,
    filterStatus, setFilterStatus,
    filterLinked, setFilterLinked,
    keyword, setKeyword,
    detail, setDetail,
    linkTarget, setLinkTarget,
    linkForm, linking, handleLink,
    outboundTarget, setOutboundTarget,
    outboundForm, outbounding, handleDirectOutbound,
    styleImageMap,
    fetchData,
    pendingShip, shipped, linked, pendingHandle, totalRevenue,
    isFilteringPending,
  };
}
