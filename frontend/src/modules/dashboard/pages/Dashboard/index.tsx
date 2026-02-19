import React, { useEffect, useState, useCallback } from 'react';
import { App, AutoComplete, Button, Card, Checkbox, Modal, Space } from 'antd';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import MiniDataDashboard from '../../components/MiniDataDashboard';
import TopStats from '../../components/TopStats';
import StandardToolbar from '@/components/common/StandardToolbar';
import OrderCuttingChart from '../../components/OrderCuttingChart';
import ScanCountChart from '../../components/ScanCountChart';
import OverdueOrderTable from '../../components/OverdueOrderTable';
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
  id: string;        // 实体ID，用于跳转
  type: string;      // 类型: style/production/scan/material
  content: string;   // 显示内容
  time: string;      // 时间
}

interface QuickEntryConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  className: string;
  enabled: boolean;
}

// 所有可用的快捷入口配置
const ALL_QUICK_ENTRIES: QuickEntryConfig[] = [
  { id: 'style', icon: <TagsOutlined />, label: '样衣开发', href: '/style-info', className: 'style', enabled: true },
  { id: 'production', icon: <InboxOutlined />, label: '生产进度', href: '/production', className: 'production', enabled: true },
  { id: 'material', icon: <ShoppingCartOutlined />, label: '物料采购', href: '/production/material', className: 'material', enabled: true },
  { id: 'warehousing', icon: <InboxOutlined />, label: '质检入库', href: '/production/warehousing', className: 'warehousing', enabled: true },
  { id: 'material-reconciliation', icon: <FileTextOutlined />, label: '物料对账', href: '/finance/material-reconciliation', className: 'report', enabled: true },
  { id: 'factory', icon: <ApartmentOutlined />, label: '供应商管理', href: '/system/factory', className: 'factory', enabled: true },
  { id: 'order-management', icon: <FileTextOutlined />, label: '订单管理', href: '/order-management', className: 'order', enabled: false },
  { id: 'cutting', icon: <InboxOutlined />, label: '裁剪管理', href: '/production/cutting', className: 'cutting', enabled: false },
  { id: 'factory-reconciliation', icon: <AccountBookOutlined />, label: '工厂对账', href: '/finance/factory-reconciliation', className: 'factory-recon', enabled: false },
  { id: 'shipment-reconciliation', icon: <FileTextOutlined />, label: '发货对账', href: '/finance/shipment-reconciliation', className: 'shipment', enabled: false },
];

const STORAGE_KEY = 'dashboard_quick_entries';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [quickEntries, setQuickEntries] = useState<QuickEntryConfig[]>(() => {
    // 从localStorage加载用户配置
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const savedConfig = JSON.parse(saved);
        return ALL_QUICK_ENTRIES.map(entry => ({
          ...entry,
          enabled: savedConfig[entry.id] !== false,
        }));
      } catch (e) {
        console.error('Failed to parse quick entries config:', e);
      }
    }
    return ALL_QUICK_ENTRIES;
  });

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

  // 保存快捷入口配置
  const saveQuickEntriesConfig = (entries: QuickEntryConfig[]) => {
    const config: Record<string, boolean> = {};
    entries.forEach(entry => {
      config[entry.id] = entry.enabled;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  };

  // 切换快捷入口显示状态
  const handleToggleEntry = (entryId: string) => {
    const updated = quickEntries.map(entry =>
      entry.id === entryId ? { ...entry, enabled: !entry.enabled } : entry
    );
    setQuickEntries(updated);
  };

  // 保存快捷入口设置
  const handleSaveSettings = () => {
    saveQuickEntriesConfig(quickEntries);
    setSettingsVisible(false);
    message.success('快捷入口设置已保存');
  };

  // 重置为默认设置
  const handleResetSettings = () => {
    const resetEntries = ALL_QUICK_ENTRIES.map(entry => ({ ...entry, enabled: true }));
    setQuickEntries(resetEntries);
    saveQuickEntriesConfig(resetEntries);
    message.success('已重置为默认设置');
  };

  // 智能搜索 - 模糊搜索款式/订单/工厂，点击跳转
  useEffect(() => {
    const keyword = searchKeyword.trim();
    if (!keyword || keyword.length < 2) {
      setSearchOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const [styleRes, orderRes, factoryRes] = await Promise.all([
          api.get('/style/info/list', { params: { keyword, page: 1, pageSize: 5 } }),
          api.get('/production/order/list', { params: { keyword, page: 1, pageSize: 5 } }),
          api.get('/system/factory/list', { params: { factoryName: keyword, page: 1, pageSize: 5 } }),
        ]);

        const options: Array<{ value: string; label: React.ReactNode }> = [];

        const styleRecords = styleRes?.data?.records || [];
        styleRecords.forEach((item: any) => {
          options.push({
            value: `style:${item.styleNo}`,
            label: (
              <div>
                <div>款式：{item.styleNo}</div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>{item.styleName || '款式名未填写'}</div>
              </div>
            ),
          });
        });

        const orderRecords = orderRes?.data?.records || [];
        orderRecords.forEach((item: any) => {
          options.push({
            value: `order:${item.orderNo}`,
            label: (
              <div>
                <div>订单：{item.orderNo}</div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>
                  款号：{item.styleNo} | 工厂：{item.factoryName || '未指定'}
                </div>
              </div>
            ),
          });
        });

        const factoryRecords = factoryRes?.data?.records || [];
        factoryRecords.forEach((item: any) => {
          options.push({
            value: `factory:${item.factoryName}`,
            label: (
              <div>
                <div>工厂：{item.factoryName}</div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>{item.contactPerson || '未填写联系人'}</div>
              </div>
            ),
          });
        });

        setSearchOptions(options);
      } catch (error: any) {
        console.error('搜索失败:', error);
        setSearchOptions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const handleSearchChange = (value: string) => {
    setSearchKeyword(value);
  };

  const handleSearchSelect = (value: string) => {
    if (value.startsWith('style:')) {
      const styleNo = value.replace('style:', '');
      navigate(`/style-info?styleNo=${encodeURIComponent(styleNo)}`);
    } else if (value.startsWith('order:')) {
      const orderNo = value.replace('order:', '');
      navigate(`/production?orderNo=${encodeURIComponent(orderNo)}`);
    } else if (value.startsWith('factory:')) {
      const factoryName = value.replace('factory:', '');
      navigate(`/system/factory?factoryName=${encodeURIComponent(factoryName)}`);
    }
    setSearchKeyword('');
    setSearchOptions([]);
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

  // 格式化活动时间显示
  const formatActivityTime = (timeStr: string) => {
    if (!timeStr) return '';
    if (timeStr.includes('-')) return timeStr;
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timePart = timeStr.split(':').slice(0, 2).join(':');
    return `${today} ${timePart}`;
  };

  // 处理活动点击，跳转到对应页面
  const handleActivityClick = (activity: RecentActivity) => {
    const { type, id, content } = activity;

    switch (type) {
      case 'style':
        // 款式：跳转到样衣开发页面
        navigate('/style-info');
        break;
      case 'production':
        // 生产订单：从content中提取订单号跳转
        const orderNoMatch = content.match(/订单\s+([A-Z0-9]+)/);
        if (orderNoMatch && orderNoMatch[1]) {
          navigate(`/production?orderNo=${encodeURIComponent(orderNoMatch[1])}`);
        } else {
          navigate('/production');
        }
        break;
      case 'scan':
        // 扫码记录：跳转到扫码记录页面
        navigate('/production/scan-records');
        break;
      case 'material':
        // 物料采购：跳转到物料管理页面
        navigate('/production/material');
        break;
      default:
        // 未知的活动类型
    }
  };

  const fetchDashboard = useCallback(async () => {
    try {
      setHasError(false);
      setErrorMessage('');

      const response = await api.get<{ code: number; data: any; message?: string }>('/dashboard');
      if (response.code === 200) {
        const d = response.data || {};
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
        setRetryCount(0); // 成功后重置重试计数
      } else {
        // API返回非200状态码
        const errMsg = response.message || '获取仪表盘数据失败';
        console.error('[Dashboard] API错误:', errMsg);
        setHasError(true);
        setErrorMessage(errMsg);
        // 不要重置数据，保留上次的数据
      }
    } catch (error: any) {
      // 网络错误或其他异常
      console.error('[Dashboard] 获取数据失败:', error);
      const errMsg = error?.message || '网络错误，无法加载数据';
      setHasError(true);
      setErrorMessage(errMsg);
      // 不要重置数据，保留上次的数据
    }
  }, []);

  // 手动重试
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchDashboard();
    // 给body添加class标识首页
    document.body.classList.add('dashboard-page');
    return () => {
      document.body.classList.remove('dashboard-page');
    };
  }, [fetchDashboard]);

  // 实时同步：60秒自动轮询更新统计数据
  useSync(
    'dashboard-stats',
    async () => {
      const response = await api.get<{ code: number; data: any }>('/dashboard');
      if (response?.code === 200) {
        return response.data || {};
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
      <div className="dashboard-container">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">仪表盘</h2>
          </div>

        {/* 错误提示 */}
        {hasError && (
          <div style={{
            padding: '16px 24px',
            marginBottom: '16px',
            background: '#fff2e8',
            border: '1px solid #ffbb96',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <WarningOutlined style={{ color: '#fa8c16', fontSize: '18px' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#d4380d', marginBottom: '4px' }}>
                  数据加载失败
                </div>
                <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)' }}>
                  {errorMessage || '无法连接到服务器，请检查网络连接后重试'}
                </div>
              </div>
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              loading={retryCount > 0 && hasError}
            >
              重试 {retryCount > 0 ? `(${retryCount})` : ''}
            </Button>
          </div>
        )}

        {/* 智能搜索 */}
        <StandardToolbar
          left={(
            <div className="dashboard-search-inline" style={{ width: 420 }}>
              <AutoComplete
                value={searchKeyword}
                options={searchOptions}
                onChange={handleSearchChange}
                onSelect={handleSearchSelect}
                placeholder="搜索订单号/款号/工厂名"
                allowClear
                notFoundContent={searchLoading ? '搜索中...' : null}
              />
            </div>
          )}
          right={(
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
              >
                配置快捷入口
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRetry}
                loading={retryCount > 0 && hasError}
              >
                刷新数据
              </Button>
            </Space>
          )}
        />

        {/* 顶部4个统计看板 */}
        <TopStats />

        {/* 质检数据看板 */}
        <MiniDataDashboard />

        {/* 数据分析区域 */}
        <div className="dashboard-analysis-section">
          {/* 左侧折线图区域 */}
          <div className="dashboard-charts-left">
            <div className="chart-item">
              <OrderCuttingChart />
            </div>
            <div className="chart-item">
              <ScanCountChart />
            </div>
          </div>

          {/* 右侧延期订单表格 */}
          <div className="dashboard-table-right">
            <OverdueOrderTable />
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">最近动态</h3>
            </div>
            <div className="card-content">
              {recentActivities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--neutral-text-secondary)' }}>
                  暂无最近动态
                </div>
              ) : (
                <ul className="activity-list">
                  {recentActivities.map(activity => (
                    <li
                      key={activity.id}
                      className="activity-item"
                      onClick={() => handleActivityClick(activity)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className={`activity-icon activity-icon--${activity.type}`}>
                        {getActivityIcon(activity.type)}
                      </span>
                      <span className="activity-content">{activity.content}</span>
                      <span className="activity-time">{formatActivityTime(activity.time)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">快捷入口</h3>
              <Button
                type="text"
                onClick={() => setSettingsVisible(true)}
                title="设置快捷入口"
                style={{ color: 'var(--neutral-text-secondary)' }}
              />
            </div>
            <div className="card-content">
              <div className="quick-entry-grid">
                {quickEntries
                  .filter(entry => entry.enabled)
                  .map(entry => (
                    <a
                      key={entry.id}
                      href={entry.href}
                      className={`quick-entry-item quick-entry-item--${entry.className}`}
                    >
                      <span className={`entry-icon entry-icon--${entry.className}`}>{entry.icon}</span>
                      <span className="entry-label">{entry.label}</span>
                    </a>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 快捷入口设置弹窗 */}
      <Modal
        title="快捷入口设置"
        open={settingsVisible}
        onOk={handleSaveSettings}
        onCancel={() => setSettingsVisible(false)}
        width={600}
        footer={[
          <Button key="reset" onClick={handleResetSettings}>
            重置默认
          </Button>,
          <Button key="cancel" onClick={() => setSettingsVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleSaveSettings}>
            保存
          </Button>,
        ]}
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16, color: 'var(--neutral-text-secondary)' }}>
            勾选需要在首页显示的快捷入口（至少保留一个）
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {quickEntries.map(entry => (
              <Checkbox
                key={entry.id}
                checked={entry.enabled}
                onChange={() => handleToggleEntry(entry.id)}
                disabled={quickEntries.filter(e => e.enabled).length === 1 && entry.enabled}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {entry.icon}
                  {entry.label}
                </span>
              </Checkbox>
            ))}
          </div>
        </div>
      </Modal>
      </div>
    </Layout>
  );
};

export default Dashboard;
