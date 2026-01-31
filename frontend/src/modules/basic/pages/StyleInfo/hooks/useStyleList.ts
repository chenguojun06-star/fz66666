import React, { useState, useCallback } from 'react';
import { message } from 'antd';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';

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
  handleDelete: (id: string) => Promise<boolean>;
  handleToggleTop: (record: StyleInfo) => Promise<void>;
}

export const useStyleList = (): UseStyleListReturn => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<StyleQueryParams>(({
    page: 1,
    pageSize: 10
  }));

  const fetchList = useCallback(async (params?: StyleQueryParams) => {
    const finalParams = params || queryParams;
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

  const handleDelete = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await api.delete(`/style/info/${id}`);
      if (response.code === 200) {
        message.success('删除成功');
        await fetchList();
        return true;
      } else {
        message.error(response.msg || '删除失败');
        return false;
      }
    } catch (error) {
      console.error('删除样衣失败:', error);
      message.error('删除失败');
      return false;
    }
  }, [fetchList]);

  const handleToggleTop = useCallback(async (record: StyleInfo) => {
    try {
      const newTopStatus = record.isTop === 1 ? 0 : 1;
      const response = await api.post('/style/info/toggle-top', {
        id: record.id,
        isTop: newTopStatus
      });
      if (response.code === 200) {
        message.success(newTopStatus === 1 ? '置顶成功' : '取消置顶成功');
        await fetchList();
      } else {
        message.error(response.msg || '操作失败');
      }
    } catch (error) {
      console.error('置顶操作失败:', error);
      message.error('操作失败');
    }
  }, [fetchList]);

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
    handleDelete,
    handleToggleTop
  };
};
