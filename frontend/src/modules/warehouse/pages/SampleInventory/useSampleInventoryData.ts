import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useModal, useTablePagination } from '@/hooks';
import { useSync } from '@/utils/syncManager';
import api from '@/utils/api';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { SampleStock } from './types';

export const useSampleInventoryData = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = useTablePagination(20);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SampleStock[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sampleType, setSampleType] = useState<string | undefined>(undefined);
  const [recordStatus, setRecordStatus] = useState<'active' | 'destroyed'>('active');
  const [dateRange, setDateRange] = useState<[import('dayjs').Dayjs | null, import('dayjs').Dayjs | null] | null>(null);
  const [inboundSeed, setInboundSeed] = useState<Record<string, any> | undefined>(undefined);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const destroyModal = useModal<SampleStock>();
  const inboundModal = useModal<void>();
  const inboundOpenRef = useRef(inboundModal.open);
  inboundOpenRef.current = inboundModal.open;
  const loanModal = useModal<SampleStock>();
  const historyDrawer = useModal<SampleStock>();
  const [transferVisible, setTransferVisible] = useState(false);
  const [selectedStock, setSelectedStock] = useState<SampleStock | null>(null);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  }, [showSmartErrorNotice]);

  const clearAutoInboundParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    ['action', 'styleId', 'styleNo', 'styleName', 'color', 'size', 'quantity', 'sampleType'].forEach((key) => {
      next.delete(key);
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeInboundModal = useCallback(() => {
    inboundModal.close();
    setInboundSeed(undefined);
    if (searchParams.get('action') === 'inbound') {
      clearAutoInboundParams();
    }
  }, [clearAutoInboundParams, inboundModal, searchParams]);

  const closeDestroyModal = useCallback(() => {
    destroyModal.close();
  }, [destroyModal]);

  const currentPage = pagination.pagination.current;
  const currentPageSize = pagination.pagination.pageSize;
  const setPaginationTotal = pagination.setTotal;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/list', {
        params: {
          page: currentPage,
          pageSize: currentPageSize,
          styleNo: searchText,
          sampleType,
          recordStatus,
        },
      });
      if (res.code === 200) {
        setDataSource(res.data.records || []);
        setPaginationTotal(res.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (error) {
      reportSmartError('样衣库存加载失败', '网络异常或服务不可用，请稍后重试', 'SAMPLE_STOCK_LOAD_FAILED');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentPageSize, searchText, sampleType, recordStatus, showSmartErrorNotice, reportSmartError, setPaginationTotal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 30秒轮询自动刷新样衣库存
  useSync(
    'warehouse-sample-inventory-poll',
    async () => { await loadData(); },
    () => {},
    { interval: 30000, pauseOnHidden: true }
  );

  const searchParamsStr = searchParams.toString();

  useEffect(() => {
    const action = searchParams.get('action');
    const styleId = searchParams.get('styleId');
    const styleNo = searchParams.get('styleNo');
    const styleName = searchParams.get('styleName');
    const color = searchParams.get('color');
    const size = searchParams.get('size');
    const quantity = searchParams.get('quantity');
    const sampleTypeParam = searchParams.get('sampleType');
    if (styleNo) {
      setSearchText(styleNo);
    }
    if (action === 'inbound' && styleNo) {
      setInboundSeed({
        styleId: styleId || undefined,
        styleNo,
        styleName: styleName || undefined,
        color: color || undefined,
        size: size || undefined,
        quantity: quantity ? Number(quantity) : undefined,
        sampleType: sampleTypeParam || 'development',
      });
      inboundOpenRef.current();
      clearAutoInboundParams();
    }
  }, [clearAutoInboundParams, searchParams, searchParamsStr]);

  return {
    // pagination
    pagination,
    // data
    loading,
    dataSource,
    smartError,
    showSmartErrorNotice,
    // filters
    searchText,
    setSearchText,
    sampleType,
    setSampleType,
    recordStatus,
    setRecordStatus,
    dateRange,
    setDateRange,
    // inbound
    inboundModal,
    inboundSeed,
    setInboundSeed,
    closeInboundModal,
    // loan
    loanModal,
    // history
    historyDrawer,
    // transfer
    transferVisible,
    setTransferVisible,
    selectedStock,
    setSelectedStock,
    // destroy
    destroyModal,
    closeDestroyModal,
    // actions
    loadData,
  };
};

export default useSampleInventoryData;
