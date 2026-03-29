import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Space, Spin, Tag, Table, Popover } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ShopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardPagination from '@/components/common/StandardPagination';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import LazyImage from '@/components/common/LazyImage';
import SkeletonLoader from '@/components/common/SkeletonLoader';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import { useAuth } from '@/utils/AuthContext';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import { productionOrderApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { savePageSize, readPageSize } from '@/utils/pageSizeStore';
import { isOrderTerminal } from '@/utils/api';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useDebouncedValue } from '@/hooks/usePerformance';
import '../../../styles.css';
import { useProgressFilters } from '../ProgressDetail/hooks/useProgressFilters';
import FactorySidebar, { FactoryStats } from './components/FactorySidebar';

const PAGE_SIZE_OPTIONS = ['20', '50', '100', '200'] as const;

const ExternalFactory: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
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

  const columns: ColumnsType<ProductionOrder> = useMemo(() => [
    {
      title: '图片',
      key: 'image',
      width: 60,
      fixed: 'left',
      render: (_: unknown, record: ProductionOrder) => {
        const cover = (record as any).styleCover;
        if (!cover) return <div style={{ width: 40, height: 40, background: '#f5f5f5', borderRadius: 4 }} />;
        const fullUrl = getFullAuthedFileUrl(cover);
        return (
          <LazyImage
            src={fullUrl}
            width={40}
            height={40}
            borderRadius={4}
          />
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      fixed: 'left',
      render: (text: string, record: ProductionOrder) => (
        <Popover
          content={<SmartOrderHoverCard order={record} />}
          trigger="hover"
          placement="rightTop"
          mouseEnterDelay={0.3}
          getPopupContainer={() => document.body}
          styles={{ root: { width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH } }}
        >
          <span style={{ cursor: 'pointer' }}>{text}</span>
        </Popover>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 80,
      align: 'center' as const,
      render: (qty: number) => <Tag color="blue">{qty || 0}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'default', text: '待处理' },
          production: { color: 'processing', text: '生产中' },
          completed: { color: 'success', text: '已完成' },
          delayed: { color: 'warning', text: '延期' },
          scrapped: { color: 'error', text: '报废' },
        };
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '进度',
      key: 'progress',
      width: 200,
      align: 'center' as const,
      render: (_: unknown, record: ProductionOrder) => {
        const progressPercent = Math.max(0, Math.min(100, Number(record.productionProgress || 0)));
        const isClosed = record.status === 'scrapped' || String(record.status || '') === 'closed';

        const getNodeColor = () => {
          if (isClosed) return '#9ca3af';
          const expectedShipDate = (record as any).expectedShipDate || (record as any).plannedEndDate;
          if (!expectedShipDate) return '#52c41a';
          const now = new Date();
          const delivery = new Date(expectedShipDate as string);
          const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) return '#ff4d4f';
          if (diffDays <= 3) return '#faad14';
          return '#52c41a';
        };

        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%' }}>
            <LiquidProgressBar
              percent={progressPercent}
              width={180}
              height={14}
              color={getNodeColor()}
              status={isClosed ? 'default' : 'normal'}
            />
            <span style={{ fontSize: 12, color: '#666', minWidth: 40 }}>{progressPercent}%</span>
          </div>
        );
      },
    },
    {
      title: '下单日期',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 110,
      render: (time: string) => {
        if (!time) return '-';
        const d = new Date(time);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      },
    },
    {
      title: '交期',
      key: 'deliveryDate',
      width: 140,
      render: (_: unknown, record: ProductionOrder) => {
        const deliveryDate = (record as any).expectedShipDate || (record as any).plannedEndDate;
        if (!deliveryDate) return <span style={{ color: '#999' }}>-</span>;
        const d = new Date(deliveryDate);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;
        const now = new Date();
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        let daysText = '';
        let daysColor = '#52c41a';
        if (diffDays < 0) {
          daysText = `已逾期${Math.abs(diffDays)}天`;
          daysColor = '#ff4d4f';
        } else if (diffDays === 0) {
          daysText = '今天';
          daysColor = '#faad14';
        } else {
          daysText = `剩余${diffDays}天`;
        }
        return (
          <span>
            {dateStr}
            <span style={{ color: daysColor, marginLeft: 4, fontSize: 11 }}>({daysText})</span>
          </span>
        );
      },
    },
  ], []);

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
            <Table
              className="external-factory-table"
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading && orders.length > 0}
              columns={columns}
              dataSource={sortedOrders}
              size="small"
              scroll={{ x: 1400, y: 'calc(100vh - 300px)' }}
              pagination={false}
              bordered={false}
            />
          )}

          <StandardPagination
            current={queryParams.page}
            pageSize={queryParams.pageSize}
            total={total}
            onChange={handlePageChange}
            pageSizeOptions={PAGE_SIZE_OPTIONS as unknown as (string | number)[]}
          />
        </div>
      </div>
    </Layout>
    </>
  );
};

export default ExternalFactory;
