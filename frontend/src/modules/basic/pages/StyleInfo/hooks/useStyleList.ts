import React, { useState, useCallback } from 'react';

import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

interface UseStyleListReturn {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  data: StyleInfo[];
  setData: React.Dispatch<React.SetStateAction<StyleInfo[]>>;
  total: number;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
  queryParams: StyleQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<StyleQueryParams>>;
  fetchList: (params?: StyleQueryParams) => Promise<void>;
}

export const useStyleList = (): UseStyleListReturn => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<StyleQueryParams>(({
    page: 1,
    pageSize: readPageSize(10),
    // 默认 Tab 为"开发中"：初始即下推后端过滤，保证列表与 /style/info/stats 统计口径一致
    onlyInProgress: true,
    excludeScrapped: true,
  }));

  const fetchList = useCallback(async (params?: StyleQueryParams) => {
    // 合并而非覆盖：保留统计 Tab 下推的 onlyInProgress/onlyDelayed 等过滤，
    // 避免搜索/操作后调用 fetchList(partialParams) 时丢失 Tab 过滤导致"顶部8条列表6条"
    const finalParams = { ...queryParams, ...(params || {}) };
    setLoading(true);
    try {
      const response = await api.get('/style/info/list', { params: finalParams });
      if (response.code === 200) {
        setData(response.data?.records || []);
        setTotal(response.data?.total || 0);
      } else {
        message.error(response.msg || '获取列表失败');
      }
    } catch (error) {
      console.error('获取样衣列表失败:', error);
      message.error('获取列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  return {
    loading,
    setLoading,
    data,
    setData,
    total,
    setTotal,
    queryParams,
    setQueryParams,
    fetchList,
  };
};
