import React, { useEffect, useState } from 'react';
import { App, AutoComplete, Button, Checkbox, Space, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import api from '@/utils/api';
import TopStats from '../../components/TopStats';
import StandardToolbar from '@/components/common/StandardToolbar';
import OrderCuttingChart from '../../components/OrderCuttingChart';
import ScanCountChart from '../../components/ScanCountChart';
import OverdueOrderTable from '../../components/OverdueOrderTable';
import { useDashboardStats } from './useDashboardStats';
import { getPatrolSummary, type PatrolSummary } from '@/services/intelligenceApi';
import './styles.css';

interface QuickEntryConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  className: string;
  enabled: boolean;
}

const ALL_QUICK_ENTRIES: QuickEntryConfig[] = [
  { id: 'style', icon: <TagsOutlined />, label: '鏍疯。寮€鍙?, href: '/style-info', className: 'style', enabled: true },
  { id: 'production', icon: <InboxOutlined />, label: '宸ュ簭璺熻繘', href: '/production', className: 'production', enabled: true },
  { id: 'material', icon: <ShoppingCartOutlined />, label: '鐗╂枡閲囪喘', href: '/production/material', className: 'material', enabled: true },
  { id: 'warehousing', icon: <InboxOutlined />, label: '璐ㄦ鍏ュ簱', href: '/production/warehousing', className: 'warehousing', enabled: true },
  { id: 'material-reconciliation', icon: <FileTextOutlined />, label: '鐗╂枡瀵硅处', href: '/finance/material-reconciliation', className: 'report', enabled: true },
  { id: 'factory', icon: <ApartmentOutlined />, label: '渚涘簲鍟嗙鐞?, href: '/system/factory', className: 'factory', enabled: true },
  { id: 'cutting', icon: <InboxOutlined />, label: '瑁佸壀绠＄悊', href: '/production/cutting', className: 'cutting', enabled: false },
  { id: 'factory-reconciliation', icon: <AccountBookOutlined />, label: '宸ュ巶瀵硅处', href: '/finance/factory-reconciliation', className: 'factory-recon', enabled: false },
  { id: 'shipment-reconciliation', icon: <FileTextOutlined />, label: '鍙戣揣瀵硅处', href: '/finance/shipment-reconciliation', className: 'shipment', enabled: false },
];

const STORAGE_KEY = 'dashboard_quick_entries';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const {
    stats,
    recentActivities,
    hasError,
    errorMessage,
    retryCount,
    handleRetry
  } = useDashboardStats();

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: string; desc: string }>>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [patrolSummary, setPatrolSummary] = useState<PatrolSummary | null>(null);
  const [quickEntries, setQuickEntries] = useState<QuickEntryConfig[]>(() => {
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

  useEffect(() => {
    getPatrolSummary()
      .then(setPatrolSummary)
      .catch(() => {});
  }, []);

  const saveQuickEntriesConfig = (entries: QuickEntryConfig[]) => {
    const config: Record<string, boolean> = {};
    entries.forEach(entry => {
      config[entry.id] = entry.enabled;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  };

  const handleToggleEntry = (entryId: string) => {
    const updated = quickEntries.map(entry =>
      entry.id === entryId ? { ...entry, enabled: !entry.enabled } : entry
    );
    setQuickEntries(updated);
  };

  const handleSaveSettings = () => {
    saveQuickEntriesConfig(quickEntries);
    setSettingsVisible(false);
    message.success('蹇嵎鍏ュ彛璁剧疆宸蹭繚瀛?);
  };

  const handleResetSettings = () => {
    const resetEntries = ALL_QUICK_ENTRIES.map(entry => ({ ...entry, enabled: true }));
    setQuickEntries(resetEntries);
    saveQuickEntriesConfig(resetEntries);
    message.success('宸查噸缃负榛樿璁剧疆');
  };

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

        const options: Array<{ value: string; label: string; desc: string }> = [];

        const styleRecords = styleRes?.data?.records || [];
        styleRecords.forEach((item: any) => {
          options.push({
            value: `style:${item.styleNo}`,
            label: `娆惧紡锛?{item.styleNo}`,
            desc: item.styleName || '娆惧紡鍚嶆湭濉啓',
          });
        });

        const orderRecords = orderRes?.data?.records || [];
        orderRecords.forEach((item: any) => {
          options.push({
            value: `order:${item.orderNo}`,
            label: `璁㈠崟锛?{item.orderNo}`,
            desc: `娆惧彿锛?{item.styleNo} | 宸ュ巶锛?{item.factoryName || '鏈寚瀹?}`,
          });
        });

        const factoryRecords = factoryRes?.data?.records || [];
        factoryRecords.forEach((item: any) => {
          options.push({
            value: `factory:${item.factoryName}`,
            label: `宸ュ巶锛?{item.factoryName}`,
            desc: item.contactPerson || '鏈～鍐欒仈绯讳汉',
          });
        });

        setSearchOptions(options);
      } catch (error: unknown) {
        console.error('鎼滅储澶辫触:', error);
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

  const getActivityIcon = (type: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      production: <InboxOutlined />,
      reconciliation: <AccountBookOutlined />,
      style: <TagsOutlined />,
      material: <ShoppingCartOutlined />,
    };
    return iconMap[type] || <FileTextOutlined />;
  };

  const formatActivityTime = (timeStr: string) => {
    if (!timeStr) return '';
    if (timeStr.includes('-')) return timeStr;
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timePart = timeStr.split(':').slice(0, 2).join(':');
    return `${today} ${timePart}`;
  };

  useEffect(() => {
    document.body.classList.add('dashboard-page');
    return () => {
      document.body.classList.remove('dashboard-page');
    };
  }, []);

  const hasAiData = patrolSummary && (
    patrolSummary.pendingCount > 0 ||
    patrolSummary.autoExecutedToday > 0 ||
    patrolSummary.highRiskPending > 0 ||
    (patrolSummary.recentActions && patrolSummary.recentActions.length > 0)
  );

  return (
    <>
      <div className="dashboard-container">
        <PageLayout title="浠〃鐩?>

        {hasError && (
          <div className="dashboard-error-alert">
            <div className="dashboard-error-alert-content">
              <WarningOutlined className="dashboard-error-alert-icon" />
              <div>
                <div className="dashboard-error-alert-title">
                  鏁版嵁鍔犺浇澶辫触
                </div>
                <div className="dashboard-error-alert-desc">
                  {errorMessage || '鏃犳硶杩炴帴鍒版湇鍔″櫒锛岃妫€鏌ョ綉缁滆繛鎺ュ悗閲嶈瘯'}
                </div>
              </div>
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              loading={retryCount > 0 && hasError}
            >
              閲嶈瘯 {retryCount > 0 ? `(${retryCount})` : ''}
            </Button>
          </div>
        )}

        <StandardToolbar
          left={(
            <div className="dashboard-search-inline" style={{ width: 420 }}>
              <AutoComplete
                value={searchKeyword}
                options={searchOptions}
                onChange={handleSearchChange}
                onSelect={handleSearchSelect}
                placeholder="鎼滅储璁㈠崟鍙?娆惧彿/宸ュ巶鍚?
                allowClear
                notFoundContent={searchLoading ? '鎼滅储涓?..' : null}
                optionRender={(opt: any) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>{opt.desc}</div>
                  </div>
                )}
              />
            </div>
          )}
          right={(
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
              >
                閰嶇疆蹇嵎鍏ュ彛
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRetry}
                loading={retryCount > 0 && hasError}
              >
                鍒锋柊鏁版嵁
              </Button>
            </Space>
          )}
        />

        <TopStats />

        <div className="dashboard-analysis-section">
          <div className="dashboard-charts-left">
            <div className="chart-item">
              <OrderCuttingChart />
            </div>
            <div className="chart-item">
              <ScanCountChart />
            </div>
          </div>

          <div className="dashboard-table-right">
            <OverdueOrderTable />
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">鏈€杩戝姩鎬?/h3>
            </div>
            <div className="card-content">
              {recentActivities.length === 0 ? (
                <div className="dashboard-empty-state">
                  <div className="dashboard-empty-state-icon">
                    <InboxOutlined />
                  </div>
                  <div className="dashboard-empty-state-text">鏆傛棤鏈€杩戝姩鎬?/div>
                  <div className="dashboard-empty-state-hint">璁㈠崟鍜屾壂鐮佽褰曞皢鍦ㄨ繖閲屽疄鏃舵樉绀?/div>
                </div>
              ) : (
                <ul className="activity-list">
                  {recentActivities.map(activity => (
                    <li
                      key={activity.id}
                      className="activity-item"
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
              <h3 className="card-title">蹇嵎鍏ュ彛</h3>
              <Button
                type="text"
                onClick={() => setSettingsVisible(true)}
                title="璁剧疆蹇嵎鍏ュ彛"
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

          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">
                <RobotOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                AI鏅鸿兘浣撶畝鎶?              </h3>
            </div>
            <div className="card-content">
              {!hasAiData ? (
                <div className="dashboard-empty-state">
                  <div className="dashboard-empty-state-icon">
                    <RobotOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
                  </div>
                  <div className="dashboard-empty-state-text">AI鏆傛湭鍙戠幇寮傚父</div>
                  <div className="dashboard-empty-state-hint">绯荤粺鎸佺画宸℃涓紝鏈夐闄╀細涓诲姩閫氱煡浣?/div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {patrolSummary.highRiskPending > 0 && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderLeft: '3px solid #cf1322', borderRadius: '0 4px 4px 0', cursor: 'pointer', background: '#fafafa' }}
                      onClick={() => navigate('/production')}
                    >
                      <span style={{ fontSize: 13, color: '#333' }}><b style={{ color: '#cf1322' }}>{patrolSummary.highRiskPending}</b> 涓珮椋庨櫓椤瑰緟澶勭悊</span>
                      <span style={{ fontSize: 12, color: '#bbb' }}>鏌ョ湅</span>
                    </div>
                  )}
                  {patrolSummary.pendingCount > 0 && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderLeft: '3px solid #d46b08', borderRadius: '0 4px 4px 0', cursor: 'pointer', background: '#fafafa' }}
                      onClick={() => navigate('/production')}
                    >
                      <span style={{ fontSize: 13, color: '#333' }}>鍏?<b style={{ color: '#d46b08' }}>{patrolSummary.pendingCount}</b> 涓贰妫€椤瑰緟鍏虫敞</span>
                      <span style={{ fontSize: 12, color: '#bbb' }}>鏌ョ湅</span>
                    </div>
                  )}
                  {patrolSummary.autoExecutedToday > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>浠婃棩AI宸茶嚜鍔ㄥ鐞?<b style={{ color: '#389e0d' }}>{patrolSummary.autoExecutedToday}</b> 椤?/span>
                    </div>
                  )}
                  {patrolSummary.recentActions && patrolSummary.recentActions.length > 0 && (
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>鏈€杩戝彂鐜?/div>
                      {patrolSummary.recentActions.slice(0, 3).map((action, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 12 }}>
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: action.issueSeverity === 'HIGH' ? '#cf1322' : action.issueSeverity === 'MEDIUM' ? '#d46b08' : '#8c8c8c',
                            flexShrink: 0,
                          }} />
                          <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {action.detectedIssue}
                          </span>
                          <span style={{ color: '#bbb', flexShrink: 0 }}>{action.targetId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageLayout>

      <ResizableModal
        title="蹇嵎鍏ュ彛璁剧疆"
        open={settingsVisible}
        onOk={handleSaveSettings}
        onCancel={() => setSettingsVisible(false)}
        width="40vw"
        footer={[
          <Button key="reset" onClick={handleResetSettings}>
            閲嶇疆榛樿
          </Button>,
          <Button key="cancel" onClick={() => setSettingsVisible(false)}>
            鍙栨秷
          </Button>,
          <Button key="submit" type="primary" onClick={handleSaveSettings}>
            淇濆瓨
          </Button>,
        ]}
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16, color: 'var(--neutral-text-secondary)' }}>
            鍕鹃€夐渶瑕佸湪棣栭〉鏄剧ず鐨勫揩鎹峰叆鍙ｏ紙鑷冲皯淇濈暀涓€涓級
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
      </ResizableModal>
      </div>
    </>
  );
};

export default Dashboard;