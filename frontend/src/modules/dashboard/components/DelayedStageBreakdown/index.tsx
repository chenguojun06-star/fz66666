import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, Spin, Tag } from 'antd';
import {
  ClockCircleOutlined,
  ExperimentOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import './styles.css';

interface DelayedItem {
  id: string;
  no: string;
  name: string;
  stage: string;
  overdueDays: number;
  plannedEndDate: string;
  factoryName: string;
  type: 'sample' | 'bulk';
  progress: number;
  quantity: number;
}

interface DelayedStageGroup {
  stageName: string;
  count: number;
  items: DelayedItem[];
}

interface DelayedStageBreakdownData {
  sampleDelayed: DelayedStageGroup[];
  bulkDelayed: DelayedStageGroup[];
  sampleTotal: number;
  bulkTotal: number;
}

type TabKey = 'bulk' | 'sample';

const TAB_CONFIG: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'bulk', label: '大货生产', icon: <InboxOutlined /> },
  { key: 'sample', label: '样衣开发', icon: <ExperimentOutlined /> },
];

const STAGE_COLOR_MAP: Record<string, string> = {
  '采购': '#1677ff',
  '裁剪': '#13c2c2',
  '车缝': '#722ed1',
  '尾部': '#eb2f96',
  '二次工艺': '#fa8c16',
  '入库': '#52c41a',
  '纸样开发': '#1677ff',
  'BOM配置': '#13c2c2',
  '尺码表': '#722ed1',
  '工序配置': '#eb2f96',
  '生产制单': '#fa8c16',
  '样衣制作': '#52c41a',
};

interface DelayedStageBreakdownProps {
  /** 强制锁定某个 Tab（用于嵌入到对应页面，不显示 Tab 切换） */
  forceTab?: TabKey;
  /** 自定义标题，不填时用默认"智能延期提醒" */
  title?: string;
  /** 只显示指定环节的延期项（如"裁剪"、"采购"），用于嵌入到对应环节页面 */
  stageFilter?: string;
}

const DelayedStageBreakdown: React.FC<DelayedStageBreakdownProps> = ({ forceTab, title, stageFilter }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DelayedStageBreakdownData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(forceTab || 'bulk');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get('/dashboard/delayed-stage-breakdown');
      const resp = result?.data || result;
      if (resp && typeof resp === 'object') {
        setData(resp as DelayedStageBreakdownData);
      }
    } catch (error) {
      console.error('Failed to load delayed stage breakdown:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentGroups = useMemo(() => {
    if (!data) return [];
    let groups = activeTab === 'bulk' ? data.bulkDelayed : data.sampleDelayed;
    // stageFilter：只显示指定环节的延期项（如嵌入裁剪页面时传"裁剪"）
    if (stageFilter) {
      groups = groups.filter(g => g.stageName === stageFilter);
    }
    return groups;
  }, [data, activeTab, stageFilter]);

  // 是否有可显示的延期数据：用普通变量计算
  const hasVisibleData = (() => {
    if (!data) return false;
    if (stageFilter) {
      const totalCount = currentGroups.reduce((sum, g) => sum + g.count, 0);
      return totalCount > 0;
    }
    if (forceTab === 'bulk') return data.bulkTotal > 0;
    if (forceTab === 'sample') return data.sampleTotal > 0;
    return data.sampleTotal > 0 || data.bulkTotal > 0;
  })();

  const handleItemClick = useCallback((item: DelayedItem) => {
    if (item.type === 'bulk') {
      // 大货生产：根据环节跳转到对应页面
      const stagePathMap: Record<string, string> = {
        '裁剪': '/production/cutting',
        '采购': '/production/material',
        '车缝': '/production',
        '尾部': '/production',
        '二次工艺': '/production',
        '入库': '/production/warehousing',
      };
      const path = stagePathMap[item.stage] || '/production';
      navigate(`${path}?orderNo=${encodeURIComponent(item.no)}`);
    } else {
      // 样衣开发：跳转到款号详情页
      navigate(`/style-info/${encodeURIComponent(item.id)}`);
    }
  }, [navigate]);

  const titleText = stageFilter ? `${stageFilter}延期提醒` : (title || '智能延期提醒');

  // stageFilter 模式下的总计数（用 IIFE 计算）
  const stageTotal = (() => {
    if (!data) return 0;
    return currentGroups.reduce((sum, g) => sum + g.count, 0);
  })();

  const totalCount = (() => {
    if (!data) return 0;
    return activeTab === 'bulk' ? data.bulkTotal : data.sampleTotal;
  })();

  return (
    <>
      {/* 用条件渲染替代 early return，保证 hooks 数量一致 */}
      {hasVisibleData ? (
        <Card
          className="delayed-stage-breakdown-card"
          variant="borderless"
          title={
            <div className="delayed-stage-header">
              <div className="delayed-stage-header-left">
                <ClockCircleOutlined style={{ color: 'var(--color-error, #ff4d4f)' }} />
                <span>{titleText}</span>
              </div>
              <div className="delayed-stage-header-right">
                {stageFilter && stageTotal > 0 && (
                  <Tag color="red">延期 {stageTotal} 项</Tag>
                )}
                {!forceTab && !stageFilter && data && data.sampleTotal > 0 && (
                  <Tag color="orange">样衣 {data.sampleTotal}</Tag>
                )}
                {!forceTab && !stageFilter && data && data.bulkTotal > 0 && (
                  <Tag color="red">大货 {data.bulkTotal}</Tag>
                )}
                {forceTab && !stageFilter && data && (
                  <Tag color={forceTab === 'bulk' ? 'red' : 'orange'}>
                    {forceTab === 'bulk' ? `大货 ${data.bulkTotal}` : `样衣 ${data.sampleTotal}`}
                  </Tag>
                )}
              </div>
            </div>
          }
        >
          <Spin spinning={loading}>
            {!forceTab && (
              <div className="delayed-stage-tabs">
                {TAB_CONFIG.map(tab => {
                  const count = tab.key === 'bulk' ? (data?.bulkTotal || 0) : (data?.sampleTotal || 0);
                  return (
                    <div
                      key={tab.key}
                      className={`delayed-stage-tab ${activeTab === tab.key ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {count > 0 && (
                        <Badge
                          count={count}
                          size="small"
                          style={{ backgroundColor: tab.key === 'bulk' ? '#ff4d4f' : '#fa8c16' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 横向表格排列：每个环节一列，点击跳转 */}
            {currentGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 12 }}>
                暂无{activeTab === 'bulk' ? '大货生产' : '样衣开发'}延期项
              </div>
            ) : (
              <div style={{
                display: 'flex',
                gap: 0,
                border: '1px solid #000',
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 8,
              }}>
                {currentGroups.map((group, idx) => {
                  const stageColor = STAGE_COLOR_MAP[group.stageName] || '#8c8c8c';
                  const isClickable = group.items.length > 0;
                  return (
                    <div
                      key={group.stageName}
                      onClick={() => isClickable && handleItemClick(group.items[0])}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 8px',
                        borderRight: idx < currentGroups.length - 1 ? '1px solid #000' : 'none',
                        cursor: isClickable ? 'pointer' : 'default',
                        background: isClickable ? '#fff' : '#f5f5f5',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span
                          style={{
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: isClickable ? stageColor : '#ccc',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: isClickable ? '#111' : '#999',
                          whiteSpace: 'nowrap'
                        }}>
                          {group.stageName}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          fontSize: 18, fontWeight: 700,
                          color: isClickable ? stageColor : '#ccc',
                          lineHeight: 1
                        }}>
                          {group.count}
                        </span>
                        <span style={{ fontSize: 11, color: '#999' }}>项</span>
                      </div>
                      {isClickable && (
                        <div style={{ fontSize: 10, color: '#1890ff', marginTop: 2 }}>点击查看 →</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 查看全部链接 */}
            {totalCount > 0 && (
              <div
                className="delayed-stage-view-all"
                onClick={() => {
                  if (stageFilter) {
                    // stageFilter 模式：跳转到对应环节页面
                    const stagePathMap: Record<string, string> = {
                      '裁剪': '/production/cutting',
                      '采购': '/production/material',
                      '车缝': '/production',
                      '尾部': '/production',
                      '二次工艺': '/production',
                      '入库': '/production/warehousing',
                    };
                    navigate(stagePathMap[stageFilter] || '/production');
                  } else if (activeTab === 'bulk') {
                    navigate('/production?filter=overdue');
                  } else {
                    navigate('/style-info');
                  }
                }}
              >
                查看全部 {totalCount} 项 →
              </div>
            )}
          </Spin>
        </Card>
      ) : null}
    </>
  );
};

export default DelayedStageBreakdown;
