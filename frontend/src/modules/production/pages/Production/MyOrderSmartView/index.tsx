import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Input, Space, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, RadarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import SkeletonLoader from '@/components/common/SkeletonLoader';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import { productionOrderApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { savePageSize, readPageSize } from '@/utils/pageSizeStore';
import { isOrderTerminal } from '@/utils/api';
import ExternalFactorySmartView from '../ExternalFactory/ExternalFactorySmartView';
import '../ExternalFactory/externalFactory.css';

const DEFAULT_PAGE_SIZE = 20;

const MyOrderSmartView: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [dateSortAsc, setDateSortAsc] = useState(false);
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: readPageSize(DEFAULT_PAGE_SIZE),
    keyword: '',
    includeScrapped: true,
    excludeTerminal: false,
  });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: ProductionOrderListParams = {
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        keyword: queryParams.keyword || undefined,
        includeScrapped: queryParams.includeScrapped,
        excludeTerminal: queryParams.excludeTerminal,
      };
      const res = await productionOrderApi.list(params);
      if (res && res.data) {
        const records = (res.data.records || []) as ProductionOrder[];
        setOrders(records);
        setTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '获取订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, message]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setQueryParams(prev => ({ ...prev, keyword: searchInput, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [orders, dateSortAsc]);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    savePageSize(pageSize);
    setQueryParams(prev => ({ ...prev, page, pageSize }));
  }, []);

  return (
    <Layout>
      <div style={{ padding: 16 }}>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px' } }}
          title={
            <Space>
              <RadarChartOutlined />
              <span>智能看板</span>
              <Tag color="blue">{total} 单</Tag>
            </Space>
          }
          extra={
            <Space>
              <Input.Search
                placeholder="搜索款号/订单号..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onSearch={v => setSearchInput(v)}
                style={{ width: 240 }}
                allowClear
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchOrders}
              >
                刷新
              </Button>
              <Button
                icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                onClick={() => setDateSortAsc(v => !v)}
                title={dateSortAsc ? '按时间升序' : '按时间降序'}
                style={{ borderRadius: 16, minWidth: 32, width: 32, padding: 0 }}
              />
            </Space>
          }
        />

        {loading && orders.length === 0 ? (
          <SkeletonLoader type="table" rows={8} loading={loading} />
        ) : (
          <ExternalFactorySmartView
            data={sortedOrders}
            loading={loading}
            total={total}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </Layout>
  );
};

export default MyOrderSmartView;
