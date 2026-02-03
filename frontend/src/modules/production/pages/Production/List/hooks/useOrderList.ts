/**
 * useOrderList Hook
 * 管理生产订单列表的数据获取、分页、搜索等逻辑
 */
import { useState, useEffect } from 'react';
import { App } from 'antd';
import api, { isApiSuccess } from '@/utils/api';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import { useSync } from '@/utils/syncManager';

export const useOrderList = () => {
  const { message } = App.useApp();
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: 10
  });

  // 获取生产订单列表
  const fetchProductionList = async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<ProductionOrder>>(
        '/production/order/list',
        { params: queryParams }
      );
      if (isApiSuccess(response)) {
        setProductionList(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(
          typeof response === 'object' && response !== null && 'message' in response
            ? String(response.message) || '获取生产订单列表失败'
            : '获取生产订单列表失败'
        );
      }
    } catch (error) {
      message.error('获取生产订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取生产订单列表
  useEffect(() => {
    fetchProductionList();
  }, [queryParams]);

  // 实时同步已禁用：避免频繁请求导致性能问题
  // 用户可以通过手动刷新按钮更新数据
  // useSync(
  //   'production-orders',
  //   async () => {
  //     try {
  //       const response = await api.get<PaginatedResponse<ProductionOrder>>(
  //         '/production/order/list',
  //         { params: queryParams }
  //       );
  //       if (isApiSuccess(response)) {
  //         return response.data.records || [];
  //       }
  //       return [];
  //     } catch (error) {
  //       console.error('[实时同步] 获取生产订单列表失败', error);
  //       return [];
  //     }
  //   },
  //   (newData, oldData) => {
  //     if (oldData !== null) {
  //       setProductionList(newData);
  //     }
  //   },
  //   {
  //     interval: 30000,
  //     enabled: !loading,
  //     pauseOnHidden: true,
  //     onError: (error) => {
  //       console.error('[实时同步] 错误', error);
  //     }
  //   }
  // );

  return {
    productionList,
    loading,
    total,
    queryParams,
    setQueryParams,
    fetchProductionList,
  };
};

export default useOrderList;
