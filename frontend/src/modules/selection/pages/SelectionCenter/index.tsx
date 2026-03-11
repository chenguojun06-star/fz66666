import React, { useEffect } from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import {
  AppstoreOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import SelectionBatchList from '../SelectionBatch';
import CandidatePool from '../CandidatePool';
import TrendDashboard from '../TrendDashboard';
import HistoricalAnalysis from '../HistoricalAnalysis';

const TAB_KEYS = ['batch', 'candidates', 'trend', 'history'] as const;
type TabKey = typeof TAB_KEYS[number];

const TAB_ITEMS = [
  { key: 'batch' as TabKey, label: '选品批次', icon: <AppstoreOutlined /> },
  { key: 'candidates' as TabKey, label: '候选款库', icon: <FileTextOutlined /> },
  { key: 'trend' as TabKey, label: '趋势看板', icon: <ThunderboltOutlined /> },
  { key: 'history' as TabKey, label: '历史分析', icon: <FileSearchOutlined /> },
];

/**
 * 选品中心 — 统一 Tab 容器
 * Tab 状态通过 URL ?tab= 持久化，刷新不丢失。
 * 跨 Tab 参数（如 batchId），通过额外 query param 透传，子页面直接读取 useSearchParams。
 */
export default function SelectionCenter() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabKey) ?? 'batch';

  // 如果 tab 值非法，重置为 batch
  useEffect(() => {
    if (!TAB_KEYS.includes(activeTab as TabKey)) {
      setSearchParams((prev) => {
        prev.set('tab', 'batch');
        return prev;
      }, { replace: true });
    }
  }, [activeTab, setSearchParams]);

  const handleTabChange = (key: string) => {
    setSearchParams((prev) => {
      // 切换 tab 时清除跨 Tab 的临时参数（batchId/batchName）
      // 但只在 tab 真正切换时才清除
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', key);
      if (key !== 'candidates') {
        newParams.delete('batchId');
        newParams.delete('batchName');
      }
      return newParams;
    }, { replace: false });
  };

  const tabItems = TAB_ITEMS.map(({ key, label, icon }) => ({
    key,
    label: (
      <span>
        {icon}
        <span style={{ marginLeft: 6 }}>{label}</span>
      </span>
    ),
    children: renderTabContent(key),
  }));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        style={{ flex: 1, overflow: 'hidden' }}
        tabBarStyle={{ marginBottom: 0, paddingLeft: 16, paddingRight: 16, background: '#fff', borderBottom: '1px solid #f0f0f0' }}
        destroyInactiveTabPane={false}
      />
    </div>
  );
}

function renderTabContent(key: TabKey): React.ReactNode {
  switch (key) {
    case 'batch':
      return <SelectionBatchList />;
    case 'candidates':
      return <CandidatePool />;
    case 'trend':
      return <TrendDashboard />;
    case 'history':
      return <HistoricalAnalysis />;
    default:
      return null;
  }
}
