import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Select, Space } from 'antd';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  BellOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import errorHandler from '../../utils/errorHandler';
import { useSync } from '../../utils/syncManager';
import './styles.css';

interface DashboardStats {
  styleCount: number;
  productionCount: number;
  pendingReconciliationCount: number;
  paymentApprovalCount: number;
  todayScanCount: number;
  warehousingOrderCount: number;
  unqualifiedQuantity: number;
  urgentEventCount: number; // 紧急事件（包含各种超期提醒）
}

interface RecentActivity {
  id: string;
  type: string;
  content: string;
  time: string;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    styleCount: 0,
    productionCount: 0,
    pendingReconciliationCount: 0,
    paymentApprovalCount: 0,
    todayScanCount: 0,
    warehousingOrderCount: 0,
    unqualifiedQuantity: 0,
    urgentEventCount: 0,
  });

  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [brand, setBrand] = useState<string | undefined>(undefined);
  const [factory, setFactory] = useState<string | undefined>(undefined);

  const resetDashboardData = () => {
    setStats({
      styleCount: 0,
      productionCount: 0,
      pendingReconciliationCount: 0,
      paymentApprovalCount: 0,
      todayScanCount: 0,
      warehousingOrderCount: 0,
      unqualifiedQuantity: 0,
      urgentEventCount: 0,
    });
    setRecentActivities([]);
  };

  const getActivityIcon = (type: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      production: <InboxOutlined />,
      reconciliation: <AccountBookOutlined />,
      style: <TagsOutlined />,
      material: <ShoppingCartOutlined />,
    };
    return iconMap[type] || <FileTextOutlined />;
  };

  const fetchDashboard = async () => {
    try {
      const response = await api.get<any>('/dashboard', {
        params: {
          startDate: dateRange[0],
          endDate: dateRange[1],
          brand,
          factory
        }
      });
      const result = response as any;
      if (result.code === 200) {
        const d = result.data || {};
        setStats({
          styleCount: d.styleCount ?? 0,
          productionCount: d.productionCount ?? 0,
          pendingReconciliationCount: d.pendingReconciliationCount ?? 0,
          paymentApprovalCount: d.paymentApprovalCount ?? 0,
          todayScanCount: d.todayScanCount ?? 0,
          warehousingOrderCount: d.warehousingOrderCount ?? 0,
          unqualifiedQuantity: d.unqualifiedQuantity ?? 0,
          urgentEventCount: d.urgentEventCount ?? 0,
        });
        setRecentActivities(d.recentActivities ?? []);
      } else {
        errorHandler.handleError(new Error(result.message || '获取仪表盘数据失败'), '获取仪表盘数据失败');
        resetDashboardData();
      }
    } catch (error) {
      errorHandler.handleError(error, '获取仪表盘数据失败');
      resetDashboardData();
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [dateRange?.[0], dateRange?.[1], brand, factory]);

  // 实时同步：60秒自动轮询更新统计数据
  useSync(
    'dashboard-stats',
    async () => {
      const response = await api.get<any>('/dashboard', {
        params: {
          startDate: dateRange[0],
          endDate: dateRange[1],
          brand,
          factory
        }
      });
      const result = response as any;
      if (result?.code === 200) {
        return result.data || {};
      }
      // 返回 null 表示获取失败但不算错误
      return null;
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        // 数据有变化，静默更新
        setStats({
          styleCount: newData.styleCount ?? 0,
          productionCount: newData.productionCount ?? 0,
          pendingReconciliationCount: newData.pendingReconciliationCount ?? 0,
          paymentApprovalCount: newData.paymentApprovalCount ?? 0,
          todayScanCount: newData.todayScanCount ?? 0,
          warehousingOrderCount: newData.warehousingOrderCount ?? 0,
          unqualifiedQuantity: newData.unqualifiedQuantity ?? 0,
          urgentEventCount: newData.urgentEventCount ?? 0,
        });
        setRecentActivities(newData.recentActivities ?? []);
        console.log('[实时同步] 仪表盘数据已更新');
      }
    },
    {
      interval: 60000, // 60秒轮询（统计数据不需要太频繁）
      pauseOnHidden: true,
      onError: (error: any) => {
        // 只在非认证错误时显示提示
        if (error?.status !== 401 && error?.status !== 403) {
          console.error('[实时同步] 仪表盘数据同步失败:', error?.message || error);
        }
      }
    }
  );

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">仪表盘</h2>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <Space wrap>
            <span>时间范围</span>
            <DatePicker.RangePicker onChange={(_, dateStrings) => setDateRange([dateStrings[0], dateStrings[1]])} />
            <span>品牌</span>
            <Select
              allowClear
              placeholder="选择品牌"
              style={{ width: 160 }}
              value={brand}
              onChange={(val) => setBrand(val)}
              options={[
                { value: 'ALL', label: '全部' },
                { value: 'BrandA', label: '品牌A' },
                { value: 'BrandB', label: '品牌B' },
              ]}
            />
            <span>加工厂</span>
            <Select
              allowClear
              placeholder="选择加工厂"
              style={{ width: 160 }}
              value={factory}
              onChange={(val) => setFactory(val)}
              options={[
                { value: 'ALL', label: '全部' },
                { value: 'Guangzhou', label: '广州服装厂' },
                { value: 'Shenzhen', label: '深圳服装厂' },
              ]}
            />
            <Button
              onClick={() => {
                setDateRange([undefined, undefined]);
                setBrand(undefined);
                setFactory(undefined);
              }}
            >
              重置
            </Button>
          </Space>
        </Card>

        <div className="stats-section">
          <div className="stat-card stat-card--style">
            <div className="stat-icon stat-icon--style"><TagsOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.styleCount}</div>
              <div className="stat-label">款号总数</div>
            </div>
          </div>

          <div className="stat-card stat-card--production">
            <div className="stat-icon stat-icon--production"><InboxOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.productionCount}</div>
              <div className="stat-label">生产订单</div>
            </div>
          </div>

          <div className="stat-card stat-card--finance">
            <div className="stat-icon stat-icon--finance"><AccountBookOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.pendingReconciliationCount}</div>
              <div className="stat-label">待对账</div>
            </div>
          </div>

          <div className="stat-card stat-card--scan">
            <div className="stat-icon stat-icon--scan"><FileTextOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.todayScanCount}</div>
              <div className="stat-label">今日扫码</div>
            </div>
          </div>

          <div className="stat-card stat-card--warehousing">
            <div className="stat-icon stat-icon--warehousing"><InboxOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.warehousingOrderCount}</div>
              <div className="stat-label">当天入库</div>
            </div>
          </div>

          <div className="stat-card stat-card--unqualified">
            <div className="stat-icon stat-icon--unqualified"><WarningOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.unqualifiedQuantity}</div>
              <div className="stat-label">次品数量</div>
            </div>
          </div>

          <div className="stat-card stat-card--payment">
            <div className="stat-icon stat-icon--payment"><FileTextOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.paymentApprovalCount}</div>
              <div className="stat-label">审批付款</div>
            </div>
          </div>

          <div className="stat-card stat-card--urgent">
            <div className="stat-icon stat-icon--urgent"><BellOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.urgentEventCount}</div>
              <div className="stat-label">紧急事件</div>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">最近动态</h3>
            </div>
            <div className="card-content">
              <ul className="activity-list">
                {recentActivities.map(activity => (
                  <li key={activity.id} className="activity-item">
                    <span className={`activity-icon activity-icon--${activity.type}`}>{getActivityIcon(activity.type)}</span>
                    <span className="activity-content">{activity.content}</span>
                    <span className="activity-time">{activity.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">快捷入口</h3>
            </div>
            <div className="card-content">
              <div className="quick-entry-grid">
                <a href="/style-info" className="quick-entry-item quick-entry-item--style">
                  <span className="entry-icon entry-icon--style"><TagsOutlined /></span>
                  <span className="entry-label">款号资料</span>
                </a>
                <a href="/production" className="quick-entry-item quick-entry-item--production">
                  <span className="entry-icon entry-icon--production"><InboxOutlined /></span>
                  <span className="entry-label">生产进度</span>
                </a>
                <a href="/production/material" className="quick-entry-item quick-entry-item--material">
                  <span className="entry-icon entry-icon--material"><ShoppingCartOutlined /></span>
                  <span className="entry-label">物料采购</span>
                </a>
                <a href="/production/warehousing" className="quick-entry-item quick-entry-item--warehousing">
                  <span className="entry-icon entry-icon--warehousing"><InboxOutlined /></span>
                  <span className="entry-label">质检入库</span>
                </a>
                <a href="/finance/material-reconciliation" className="quick-entry-item quick-entry-item--report">
                  <span className="entry-icon entry-icon--report"><FileTextOutlined /></span>
                  <span className="entry-label">物料对账</span>
                </a>
                <a href="/system/factory" className="quick-entry-item quick-entry-item--factory">
                  <span className="entry-icon entry-icon--factory"><ApartmentOutlined /></span>
                  <span className="entry-label">供应商管理</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Layout>
  );
};

export default Dashboard;
