import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Space, message } from 'antd';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  InboxOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api, { ApiResult } from '../../utils/api';
import errorHandler from '../../utils/errorHandler';
import { useSync } from '../../utils/syncManager';
import './styles.css';

interface DashboardStats {
  sampleDevelopmentCount: number;     // 样衣开发
  productionOrderCount: number;       // 生产订单
  orderQuantityTotal: number;         // 订单数量
  overdueOrderCount: number;          // 延期订单
  todayWarehousingCount: number;      // 当天入库
  totalWarehousingCount: number;      // 入库总数
  defectiveQuantity: number;          // 次品数量
  paymentApprovalCount: number;       // 审批付款
}

interface RecentActivity {
  id: string;
  type: string;
  content: string;
  time: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [stats, setStats] = useState<DashboardStats>({
    sampleDevelopmentCount: 0,
    productionOrderCount: 0,
    orderQuantityTotal: 0,
    overdueOrderCount: 0,
    todayWarehousingCount: 0,
    totalWarehousingCount: 0,
    defectiveQuantity: 0,
    paymentApprovalCount: 0,
  });

  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

  // 全能搜索功能
  const handleSearch = async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      message.warning('请输入搜索关键词');
      return;
    }

    setSearchLoading(true);
    try {
      const response = (await api.get('/search/universal', {
        params: { keyword }
      })) as ApiResult<any>;

      if (response.code === 200) {
        const result = response.data;

        // 优先跳转到最相关的结果
        if (result.orderNo) {
          // 找到订单号，跳转到生产进度
          navigate(`/production?orderNo=${result.orderNo}`);
        } else if (result.styleNo) {
          // 找到款号，跳转到款号资料
          navigate(`/style-info?styleNo=${result.styleNo}`);
        } else if (result.bundleQr) {
          // 找到扎号，跳转到生产进度
          navigate(`/production?bundleQr=${result.bundleQr}`);
        } else if (result.supplierName) {
          // 找到供应商，跳转到供应商管理
          navigate(`/system/factory?keyword=${keyword}`);
        } else {
          message.info('未找到相关结果，请尝试其他关键词');
        }
      } else {
        message.error(response.message || '搜索失败');
      }
    } catch (error: any) {
      if (error?.status !== 404) {
        errorHandler.handleError(error, '搜索失败');
      } else {
        message.info('未找到相关结果');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const resetDashboardData = () => {
    setStats({
      sampleDevelopmentCount: 0,
      productionOrderCount: 0,
      orderQuantityTotal: 0,
      overdueOrderCount: 0,
      todayWarehousingCount: 0,
      totalWarehousingCount: 0,
      defectiveQuantity: 0,
      paymentApprovalCount: 0,
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
      const response = await api.get<any>('/dashboard');
      const result = response as any;
      if (result.code === 200) {
        const d = result.data || {};
        setStats({
          sampleDevelopmentCount: d.sampleDevelopmentCount ?? 0,
          productionOrderCount: d.productionOrderCount ?? 0,
          orderQuantityTotal: d.orderQuantityTotal ?? 0,
          overdueOrderCount: d.overdueOrderCount ?? 0,
          todayWarehousingCount: d.todayWarehousingCount ?? 0,
          totalWarehousingCount: d.totalWarehousingCount ?? 0,
          defectiveQuantity: d.defectiveQuantity ?? 0,
          paymentApprovalCount: d.paymentApprovalCount ?? 0,
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
  }, []);

  // 实时同步：60秒自动轮询更新统计数据
  useSync(
    'dashboard-stats',
    async () => {
      const response = await api.get<any>('/dashboard');
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
          sampleDevelopmentCount: newData.sampleDevelopmentCount ?? 0,
          productionOrderCount: newData.productionOrderCount ?? 0,
          orderQuantityTotal: newData.orderQuantityTotal ?? 0,
          overdueOrderCount: newData.overdueOrderCount ?? 0,
          todayWarehousingCount: newData.todayWarehousingCount ?? 0,
          totalWarehousingCount: newData.totalWarehousingCount ?? 0,
          defectiveQuantity: newData.defectiveQuantity ?? 0,
          paymentApprovalCount: newData.paymentApprovalCount ?? 0,
        });
        setRecentActivities(newData.recentActivities ?? []);
        // // console.log('[实时同步] 仪表盘数据已更新');
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

        {/* 全能搜索框 */}
        <Card size="small" className="filter-card mb-sm">
          <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
            <Input
              size="large"
              placeholder="输入款号、订单号、扎号、供应商等关键词搜索..."
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
            <Button
              size="large"
              type="primary"
              loading={searchLoading}
              onClick={handleSearch}
            >
              搜索
            </Button>
          </Space.Compact>
        </Card>

        <div className="stats-section">
          <div className="stat-card stat-card--sample" onClick={() => navigate('/style-info')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--sample"><TagsOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.sampleDevelopmentCount}</div>
              <div className="stat-label">样衣开发</div>
            </div>
          </div>

          <div className="stat-card stat-card--production" onClick={() => navigate('/production')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--production"><InboxOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.productionOrderCount}</div>
              <div className="stat-label">生产订单</div>
            </div>
          </div>

          <div className="stat-card stat-card--quantity" onClick={() => navigate('/production')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--quantity"><ShoppingCartOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.orderQuantityTotal}</div>
              <div className="stat-label">订单数量</div>
            </div>
          </div>

          <div className="stat-card stat-card--overdue" onClick={() => navigate('/production')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--overdue"><WarningOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.overdueOrderCount}</div>
              <div className="stat-label">延期订单</div>
            </div>
          </div>

          <div className="stat-card stat-card--today-warehousing" onClick={() => navigate('/production/warehousing')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--today-warehousing"><InboxOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.todayWarehousingCount}</div>
              <div className="stat-label">当天入库</div>
            </div>
          </div>

          <div className="stat-card stat-card--total-warehousing" onClick={() => navigate('/production/warehousing')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--total-warehousing"><ApartmentOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalWarehousingCount}</div>
              <div className="stat-label">入库总数</div>
            </div>
          </div>

          <div className="stat-card stat-card--defective" onClick={() => navigate('/production/warehousing')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--defective"><WarningOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.defectiveQuantity}</div>
              <div className="stat-label">次品数量</div>
            </div>
          </div>

          <div className="stat-card stat-card--payment" onClick={() => navigate('/finance/payment-approval')} style={{ cursor: 'pointer' }}>
            <div className="stat-icon stat-icon--payment"><AccountBookOutlined /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.paymentApprovalCount}</div>
              <div className="stat-label">审批付款</div>
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
