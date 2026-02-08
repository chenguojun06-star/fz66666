import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Radio, Space, Select, message } from 'antd';
import {
  InboxOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import DashboardStats from '@/components/common/DashboardStats';
import DashboardCard from '@/components/common/DashboardCard';
import DashboardTable from '@/components/common/DashboardTable';
import DashboardLineChart from '@/components/common/DashboardLineChart';
import api from '@/utils/api';
import type { ColumnsType } from 'antd/es/table';

interface WarehouseStats {
  totalValue: number;           // 库存总值
  materialCount: number;        // 物料种类
  finishedCount: number;        // 成品总数
  lowStockCount: number;        // 低库存预警
  todayInbound: number;         // 今日入库
  todayOutbound: number;        // 今日出库
}

interface LowStockItem {
  id: string;
  materialCode: string;
  materialName: string;
  availableQty: number;
  safetyStock: number;
  unit: string;
}

interface RecentOperation {
  id: string;
  type: 'inbound' | 'outbound';
  materialName: string;
  quantity: number;
  operator: string;
  time: string;
}

interface TrendDataPoint {
  date: string;
  value: number;
  type: string;
}

type TimeRange = 'day' | 'week' | 'month' | 'year';
type MaterialType = 'fabric' | 'accessory' | 'finished';

const WarehouseDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [materialType, setMaterialType] = useState<MaterialType>('fabric');
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [stats, setStats] = useState<WarehouseStats>({
    totalValue: 0,
    materialCount: 0,
    finishedCount: 0,
    lowStockCount: 0,
    todayInbound: 0,
    todayOutbound: 0,
  });

  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);

  const [recentOps, setRecentOps] = useState<RecentOperation[]>([]);

  const lowStockColumns: ColumnsType<LowStockItem> = [
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 100,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 150,
    },
    {
      title: '可用库存',
      dataIndex: 'availableQty',
      key: 'availableQty',
      width: 100,
      align: 'right',
      render: (qty, record) => (
        <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>
          {qty} {record.unit}
        </span>
      ),
    },
    {
      title: '安全库存',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 100,
      align: 'right',
      render: (qty, record) => `${qty} ${record.unit}`,
    },
    {
      title: '缺口',
      key: 'shortage',
      width: 100,
      align: 'right',
      render: (_, record) => (
        <span style={{ color: 'var(--warning-color)', fontWeight: 600 }}>
          {record.safetyStock - record.availableQty} {record.unit}
        </span>
      ),
    },
  ];

  const recentOpsColumns: ColumnsType<RecentOperation> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type) => (
        type === 'inbound' ? (
          <span style={{ color: 'var(--success-color)' }}>入库</span>
        ) : (
          <span style={{ color: 'var(--primary-color)' }}>出库</span>
        )
      ),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 180,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (qty) => <strong>{qty}</strong>,
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 80,
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 80,
    },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      // 并行加载所有数据
      const [statsRes, lowStockRes, recentOpsRes] = await Promise.all([
        api.get('/warehouse/dashboard/stats'),
        api.get('/warehouse/dashboard/low-stock'),
        api.get('/warehouse/dashboard/recent-operations'),
      ]);

      if (statsRes && statsRes.data) {
        setStats(statsRes.data);
      }
      if (lowStockRes && lowStockRes.data) {
        setLowStockItems(lowStockRes.data);
      }
      if (recentOpsRes && recentOpsRes.data) {
        setRecentOps(recentOpsRes.data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载趋势数据
  const loadTrendData = async () => {
    try {
      const res = await api.get('/warehouse/dashboard/trend', {
        params: { range: timeRange, type: materialType },
      });
      if (res && res.data) {
        setTrendData(res.data);
      }
    } catch (error) {
      console.error('加载趋势数据失败:', error);
      message.error('加载趋势数据失败');
    }
  };

  useEffect(() => {
    loadData();
    loadTrendData(); // 初始加载时也获取趋势数据
  }, []);

  useEffect(() => {
    // 根据时间范围和物料类型更新趋势数据
    loadTrendData();
  }, [timeRange, materialType]);

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        {/* 顶部统计卡片 */}
        <DashboardStats
          columns={6}
          gutter={16}
          loading={loading}
          style={{ marginBottom: 16 }}
          stats={[
            {
              title: '库存总值',
              value: stats.totalValue,
              prefix: '¥',
              precision: 2,
              valueColor: '#1890ff',
            },
            {
              title: '物料种类',
              value: stats.materialCount,
              suffix: '种',
              valueColor: 'var(--success-color)',
            },
            {
              title: '成品总数',
              value: stats.finishedCount,
              suffix: '件',
              valueColor: '#722ed1',
            },
            {
              title: '低库存预警',
              value: stats.lowStockCount,
              suffix: '种',
              valueColor: '#ff4d4f',
            },
            {
              title: '今日入库',
              value: stats.todayInbound,
              suffix: '次',
              valueColor: '#13c2c2',
            },
            {
              title: '今日出库',
              value: stats.todayOutbound,
              suffix: '次',
              valueColor: '#faad14',
            },
          ]}
        />

        {/* 数据表格区域 */}
        <Row gutter={16}>
          {/* 低库存预警 */}
          <Col span={14}>
            <DashboardTable
              title="低库存预警"
              extra={
                <Button
                  size="small"
                  type="link"
                  onClick={() => navigate('/warehouse/material')}
                >
                  查看全部
                </Button>
              }
              columns={lowStockColumns}
              dataSource={lowStockItems}
              loading={loading}
              scroll={{ y: 300 }}
            />
          </Col>

          {/* 今日出入库 */}
          <Col span={10}>
            <DashboardTable
              title="今日出入库"
              extra={
                <Button size="small" type="link">
                  刷新
                </Button>
              }
              columns={recentOpsColumns}
              dataSource={recentOps}
              loading={loading}
              scroll={{ y: 300 }}
            />
          </Col>
        </Row>

        {/* 出入库趋势分析 */}
        <DashboardCard
          title="出入库趋势分析"
          style={{ marginTop: 16 }}
          extra={
            <Space size="middle">
              <span style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)' }}>物料类型：</span>
              <Select
                value={materialType}
                onChange={setMaterialType}
                style={{ width: 120 }}
                size="small"
                options={[
                  { label: '📦 面料', value: 'fabric' },
                  { label: '🔧 辅料', value: 'accessory' },
                  { label: '👔 成品', value: 'finished' },
                ]}
              />
              <span style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)' }}>时间范围：</span>
              <Radio.Group
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                size="small"
                buttonStyle="solid"
              >
                <Radio.Button value="day">日</Radio.Button>
                <Radio.Button value="week">周</Radio.Button>
                <Radio.Button value="month">月</Radio.Button>
                <Radio.Button value="year">年</Radio.Button>
              </Radio.Group>
            </Space>
          }
        >
          <DashboardLineChart
            data={trendData}
            loading={loading}
            height={380}
            smooth
            areaStyle
            yAxisLabel="数量"
            color={['#1890ff', 'var(--success-color)']}
          />
        </DashboardCard>

        {/* 快捷操作区域 */}
        <DashboardCard
          title="快捷操作"
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Button
                type="primary"
                block
                size="large"
                onClick={() => navigate('/warehouse/material')}
                icon={<InboxOutlined />}
              >
                物料库存
              </Button>
            </Col>
            <Col span={12}>
              <Button
                type="primary"
                block
                size="large"
                style={{ background: 'var(--success-color)', borderColor: 'var(--success-color)' }}
                onClick={() => navigate('/warehouse/finished')}
                icon={<ExportOutlined />}
              >
                成品库存
              </Button>
            </Col>
          </Row>
        </DashboardCard>
      </div>
    </Layout>
  );
};

export default WarehouseDashboard;
