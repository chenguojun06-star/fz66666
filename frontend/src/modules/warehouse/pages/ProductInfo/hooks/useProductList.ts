import { useState, useCallback } from 'react';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { readPageSize } from '@/utils/pageSizeStore';
import { savePageSize } from '@/utils/pageSizeStore';

interface ProductQueryParams {
  keyword: string;
  category: string;
  season: string;
  status: string;
  page: number;
  pageSize: number;
}

interface UseProductListReturn {
  loading: boolean;
  data: StyleInfo[];
  total: number;
  queryParams: ProductQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<ProductQueryParams>>;
  fetchList: () => Promise<void>;
  handlePageChange: (page: number, pageSize: number) => void;
}

export const useProductList = (): UseProductListReturn => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<ProductQueryParams>({
    keyword: '',
    category: '',
    season: '',
    status: '',
    page: 1,
    pageSize: readPageSize(20),
  });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      };
      if (queryParams.keyword) params.keyword = queryParams.keyword;
      if (queryParams.category) params.category = queryParams.category;
      if (queryParams.season) params.season = queryParams.season;
      if (queryParams.status) params.status = queryParams.status;

      const res = await api.get<any>('/style/info/list', { params });
      if (res.code === 200) {
        const pageData = res.data || {};
        setData(pageData.records || []);
        setTotal(pageData.total || 0);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    if (pageSize !== queryParams.pageSize) {
      savePageSize(pageSize);
    }
    setQueryParams((prev) => ({
      ...prev,
      page: pageSize !== prev.pageSize ? 1 : page,
      pageSize,
    }));
  }, [queryParams.pageSize]);

  return {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList,
    handlePageChange,
  };
};
