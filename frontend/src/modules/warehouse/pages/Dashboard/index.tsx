import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Radio, Space, Select, message } from 'antd';
import {
  InboxOutlined,
  ExportOutlined,
  WarningOutlined,
  DollarOutlined,
  BarChartOutlined,
  UnorderedListOutlined,
  SyncOutlined,
  LineChartOutlined,
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
    totalValue: 1289500,
    materialCount: 156,
    finishedCount: 4520,
    lowStockCount: 8,
    todayInbound: 1200,
    todayOutbound: 850,
  });

  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([
    { id: '1', materialCode: 'F001', materialName: '纯棉面料', availableQty: 800, safetyStock: 1000, unit: '米' },
    { id: '2', materialCode: 'F003', materialName: '涤纶面料', availableQty: 450, safetyStock: 800, unit: '米' },
    { id: '3', materialCode: 'A002', materialName: '拉链5#', availableQty: 180, safetyStock: 500, unit: '条' },
    { id: '4', materialCode: 'A005', materialName: '纽扣12mm', availableQty: 3500, safetyStock: 5000, unit: '颗' },
  ]);

  const [recentOps, setRecentOps] = useState<RecentOperation[]>([
    { id: '1', type: 'inbound', materialName: '纯棉面料-白色', quantity: 500, operator: '张三', time: '10:30' },
    { id: '2', type: 'outbound', materialName: '涤纶面料-黑色', quantity: 300, operator: '李四', time: '11:15' },
    { id: '3', type: 'inbound', materialName: '拉链5#-银色', quantity: 200, operator: '王五', time: '14:20' },
    { id: '4', type: 'outbound', materialName: '纽扣12mm-白色', quantity: 1000, operator: '赵六', time: '15:45' },
  ]);

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

      if (statsRes.data.code === 200) {
        setStats(statsRes.data.data);
      }
      if (lowStockRes.data.code === 200) {
        setLowStockItems(lowStockRes.data.data);
      }
      if (recentOpsRes.data.code === 200) {
        setRecentOps(recentOpsRes.data.data);
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
      if (res.data.code === 200) {
        setTrendData(res.data.data);
      }
    } catch (error) {
      console.error('加载趋势数据失败:', error);
    }
  };

  useEffect(() => {
    loadData();
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
              icon={<WarningOutlined />}
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
              icon={<UnorderedListOutlined />}
              extra={
                <Button size="small" type="link" icon={<SyncOutlined />}>
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
          icon={<LineChartOutlined />}
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
          icon={<BarChartOutlined />}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Button
                type="primary"
                icon={<InboxOutlined />}
                block
                size="large"
                onClick={() => navigate('/warehouse/material')}
              >
                物料库存
              </Button>
            </Col>
            <Col span={6}>
              <Button
                type="primary"
                icon={<InboxOutlined />}
                block
                size="large"
                style={{ background: 'var(--success-color)', borderColor: 'var(--success-color)' }}
                onClick={() => navigate('/warehouse/finished')}
              >
                成品库存
              </Button>
            </Col>
            <Col span={6}>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                block
                size="large"
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
                onClick={() => navigate('/warehouse/sample')}
              >
                样衣管理
              </Button>
            </Col>
            <Col span={6}>
              <Button
                type="default"
                icon={<DollarOutlined />}
                block
                size="large"
                onClick={() => navigate('/warehouse/dashboard')}
              >
                更多功能
              </Button>
            </Col>
          </Row>
        </DashboardCard>
      </div>
    </Layout>
  );
};

export default WarehouseDashboard;
