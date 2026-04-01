import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Space, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ShopOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import SkeletonLoader from '@/components/common/SkeletonLoader';
import { useAuth } from '@/utils/AuthContext';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import { productionOrderApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { savePageSize, readPageSize } from '@/utils/pageSizeStore';
import { isOrderTerminal } from '@/utils/api';
import { useDebouncedValue } from '@/hooks/usePerformance';
import '../../../styles.css';
import { useProgressFilters } from '../ProgressDetail/hooks/useProgressFilters';
import FactorySidebar, { FactoryStats } from './components/FactorySidebar';
import ExternalFactorySmartView from './ExternalFactorySmartView';

const ExternalFactory: React.FC = () => {
  const { message } = App.useApp();
  const { user: _user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [factoryStats, setFactoryStats] = useState<FactoryStats[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: readPageSize(20),
    keyword: '',
    includeScrapped: false,
    excludeTerminal: true,
  });

  const debouncedKeyword = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setQueryParams(prev => ({ ...prev, keyword: debouncedKeyword, page: 1 }));
  }, [debouncedKeyword]);
  const {
    dateSortAsc, toggleDateSort,
  } = useProgressFilters();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: ProductionOrderListParams = {
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        keyword: queryParams.keyword || undefined,
        includeScrapped: queryParams.includeScrapped,
        excludeTerminal: queryParams.excludeTerminal,
        factoryType: 'EXTERNAL',
      };
      const res = await productionOrderApi.list(params);
      if (res && res.data) {
        let records = res.data.records || [];
        if (selectedFactoryId) {
          records = records.filter((o: ProductionOrder) => o.factoryId === selectedFactoryId);
        }
        const orderList = records as ProductionOrder[];
        setOrders(orderList);
        setTotal(res.data.total || 0);
      }
    } catch (err: any) {
      message.error(err?.message || '获取订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, selectedFactoryId, message]);

  const fetchFactoryStats = useCallback(async () => {
    try {
      const res = await productionOrderApi.list({
        page: 1,
        pageSize: 1000,
        factoryType: 'EXTERNAL',
        excludeTerminal: false,
      });
      if (res && res.data) {
        const allOrders = (res.data.records || []) as ProductionOrder[];
        const statsMap = new Map<string, FactoryStats>();
        const now = new Date();

        allOrders.forEach((order) => {
          const factoryId = order.factoryId || 'unknown';
          const factoryName = order.factoryName || '未知工厂';
          if (!statsMap.has(factoryId)) {
            statsMap.set(factoryId, {
              factoryId,
              factoryName,
              orderCount: 0,
              totalQuantity: 0,
              inProgressCount: 0,
              completedCount: 0,
              styleCount: 0,
              overdueCount: 0,
              warningCount: 0,
            });
          }
          const stat = statsMap.get(factoryId)!;
          stat.orderCount++;
          stat.totalQuantity += order.orderQuantity || 0;

          // 统计款号
          const styleSet = new Set<string>();
          if (order.styleNo) styleSet.add(order.styleNo);
          stat.styleCount = (stat.styleCount || 0) + (order.styleNo ? 1 : 0);

          if (order.status === 'completed') {
            stat.completedCount++;
          } else if (order.status === 'production') {
            stat.inProgressCount++;
          }

          // 交期预警统计
          const deliveryDate = (order as any).expectedShipDate || (order as any).plannedEndDate;
          if (deliveryDate && order.status !== 'completed') {
            const d = new Date(deliveryDate);
            const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
              stat.overdueCount = (stat.overdueCount || 0) + 1;
            } else if (diffDays <= 7) {
              stat.warningCount = (stat.warningCount || 0) + 1;
            }
          }
        });

        // 计算每个工厂的唯一款号数
        const factoryStyleMap = new Map<string, Set<string>>();
        allOrders.forEach((order) => {
          const factoryId = order.factoryId || 'unknown';
          if (!factoryStyleMap.has(factoryId)) {
            factoryStyleMap.set(factoryId, new Set());
          }
          if (order.styleNo) {
            factoryStyleMap.get(factoryId)!.add(order.styleNo);
          }
        });

        factoryStyleMap.forEach((styleSet, factoryId) => {
          const stat = statsMap.get(factoryId);
          if (stat) {
            stat.styleCount = styleSet.size;
          }
        });

        setFactoryStats(Array.from(statsMap.values()).sort((a, b) => b.orderCount - a.orderCount));
      }
    } catch (err) {
      console.error('获取工厂统计失败:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchFactoryStats();
  }, [fetchOrders, fetchFactoryStats]);

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

  const handleFactorySelect = useCallback((factoryId: string | null) => {
    setSelectedFactoryId(factoryId);
    setQueryParams(prev => ({ ...prev, page: 1 }));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    savePageSize(pageSize);
    setQueryParams(prev => ({ ...prev, page, pageSize }));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchOrders();
    fetchFactoryStats();
  }, [fetchOrders, fetchFactoryStats]);

  const selectedFactoryName = useMemo(() => {
    if (!selectedFactoryId) return null;
    const factory = factoryStats.find(f => f.factoryId === selectedFactoryId);
    return factory?.factoryName || null;
  }, [selectedFactoryId, factoryStats]);

  return (
    <>
    <Layout>
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        <FactorySidebar
          stats={factoryStats}
          selectedFactoryId={selectedFactoryId}
          onSelect={handleFactorySelect}
          loading={loading}
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <Card
            size="small"
            styles={{ body: { padding: '12px 16px' } }}
            title={
              <Space>
                <ShopOutlined />
                <span>外发工厂订单</span>
                {selectedFactoryName && (
                  <Tag color="blue">{selectedFactoryName}</Tag>
                )}
                <Tag color="orange">{total} 单</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button onClick={handleRefresh}>刷新</Button>
                <Button
                  icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  onClick={toggleDateSort}
                  title={dateSortAsc ? '按时间升序' : '按时间降序'}
                  style={{ borderRadius: 16, minWidth: 32, width: 32, padding: 0 }}
                />
              </Space>
            }
          >
            <StandardToolbar
              left={
                <StandardSearchBar
                  searchPlaceholder="搜索款号/订单号..."
                  searchValue={searchInput}
                  onSearchChange={handleSearch}
                  showDate={false}
                  showStatus={false}
                />
              }
            />
          </Card>

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
      </div>
    </Layout>
    </>
  );
};

export default ExternalFactory;
