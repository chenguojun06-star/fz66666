import React, { useEffect, useState, useCallback } from 'react';
import { App, AutoComplete, Button, Card, Checkbox, Input, Modal, Space } from 'antd';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  InboxOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import api, { ApiResult } from '@/utils/api';
import errorHandler from '@/utils/errorHandler';
import { useSync } from '@/utils/syncManager';
import MiniDataDashboard from '../../components/MiniDataDashboard';
import TopStats from '../../components/TopStats';
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
  id: string;
  type: string;
  content: string;
  time: string;
}

interface SearchOption {
  value: string;
  label: string;
  type: 'order' | 'style' | 'factory';
  data: any;
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
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
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

  // 实时搜索建议
  const handleSearchInput = async (value: string) => {
    setSearchKeyword(value);

    if (!value || value.trim().length < 2) {
      setSearchOptions([]);
      return;
    }

    try {
      const keyword = value.trim();
      const options: SearchOption[] = [];

      // 并发搜索订单、款号、工厂
      const [ordersRes, stylesRes, factoriesRes] = await Promise.all([
        api.get('/production/order/list', { params: { orderNo: keyword, pageSize: 5 } }).catch(() => null),
        api.get('/style/info/list', { params: { styleNo: keyword, pageSize: 5 } }).catch(() => null),
        api.get('/system/factory/list', { params: { factoryName: keyword, pageSize: 5 } }).catch(() => null),
      ]);

      // 添加订单选项
      if (ordersRes?.code === 200 && Array.isArray(ordersRes.data?.records)) {
        ordersRes.data.records.forEach((order: any) => {
          options.push({
            value: order.orderNo,
            label: `📦 订单: ${order.orderNo} - ${order.styleName || order.styleNo}`,
            type: 'order',
            data: order
          });
        });
      }

      // 添加款号选项
      if (stylesRes?.code === 200 && Array.isArray(stylesRes.data?.records)) {
        stylesRes.data.records.forEach((style: any) => {
          options.push({
            value: style.styleNo,
            label: `👔 款号: ${style.styleNo} - ${style.styleName || ''}`,
            type: 'style',
            data: style
          });
        });
      }

      // 添加工厂选项
      if (factoriesRes?.code === 200 && Array.isArray(factoriesRes.data?.records)) {
        factoriesRes.data.records.forEach((factory: any) => {
          options.push({
            value: factory.factoryName,
            label: `🏭 工厂: ${factory.factoryName}`,
            type: 'factory',
            data: factory
          });
        });
      }

      setSearchOptions(options);
    } catch (error) {
      // 静默失败，不影响用户输入
      console.error('搜索建议失败:', error);
    }
  };

  // 选择搜索建议
  const handleSelect = (value: string, option: SearchOption) => {
    setSearchKeyword(value);

    // 根据类型跳转
    if (option.type === 'order') {
      navigate(`/production?orderNo=${option.data.orderNo}`);
    } else if (option.type === 'style') {
      navigate(`/style-info?styleNo=${option.data.styleNo}`);
    } else if (option.type === 'factory') {
      navigate(`/system/factory?factoryName=${option.data.factoryName}`);
    }
  };

  // 盲收搜索功能 - 直接跳转到成品入库页面
  const handleSearch = async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      message.warning('请输入订单号或扫码');
      return;
    }

    setSearchLoading(true);
    try {
      // 直接跳转到成品入库页面，带上搜索关键词
      // 支持订单号、菲号、SKU等多种格式
      navigate(`/production/warehousing?search=${encodeURIComponent(keyword)}`);
      message.success('已跳转到成品入库页面');
    } catch (error: unknown) {
      errorHandler.handleError(error, '跳转失败');
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

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await api.get<{ code: number; data: unknown }>('/dashboard');
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
      } else {
        errorHandler.handleError(new Error(response.message || '获取仪表盘数据失败'), '获取仪表盘数据失败');
        resetDashboardData();
      }
    } catch (error) {
      errorHandler.handleError(error, '获取仪表盘数据失败');
      resetDashboardData();
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // 实时同步：60秒自动轮询更新统计数据
  useSync(
    'dashboard-stats',
    async () => {
      const response = await api.get<{ code: number; data: unknown }>('/dashboard');
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
        // // console.log('[实时同步] 仪表盘数据已更新');
      }
    },
    {
      interval: 60000, // 60秒轮询（统计数据不需要太频繁）
      pauseOnHidden: true,
      onError: (error: unknown) => {
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

        {/* 智能搜索入口 */}
        <Card size="small" className="filter-card mb-sm">
          <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
            <AutoComplete
              style={{ flex: 1 }}
              value={searchKeyword}
              options={searchOptions}
              onSearch={handleSearchInput}
              onSelect={handleSelect}
            >
              <Input
                size="large"
                prefix={<SearchOutlined />}
                placeholder="输入订单号、款号、工厂名..."
                onPressEnter={handleSearch}
                allowClear
              />
            </AutoComplete>
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
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
                title="设置快捷入口"
                style={{ color: '#666' }}
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
          <p style={{ marginBottom: 16, color: '#666' }}>
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
    </Layout>
  );
};

export default Dashboard;
