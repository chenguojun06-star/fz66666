import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, Spin, Tag } from 'antd';
import {
  ClockCircleOutlined,
  ExperimentOutlined,
  InboxOutlined,
  RightOutlined,
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

const getOverdueLevel = (days: number): { color: string; label: string } => {
  if (days > 7) return { color: '#ff4d4f', label: '严重' };
  if (days > 3) return { color: '#fa8c16', label: '紧急' };
  return { color: '#faad14', label: '轻度' };
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
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

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

  const currentTotal = useMemo(() => {
    if (!data) return 0;
    return activeTab === 'bulk' ? data.bulkTotal : data.sampleTotal;
  }, [data, activeTab]);

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

  const toggleStage = useCallback((stageName: string) => {
    setExpandedStage(prev => prev === stageName ? null : stageName);
  }, []);

  // stageFilter 模式下的总计数（必须在 shouldHide 判断前定义，保证 hooks 数量一致）
  const stageTotal = useMemo(() => {
    if (!data) return 0;
    return currentGroups.reduce((sum, g) => sum + g.count, 0);
  }, [data, currentGroups]);

  // 空状态判断：forceTab 模式下只关心对应类型的数量；stageFilter 模式下只关心该环节的数量
  const shouldHide = useMemo(() => {
    if (loading || !data) return !loading && !data;
    const groups = currentGroups;
    if (stageFilter) {
      // stageFilter 模式：检查过滤后是否有数据
      const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
      return totalCount === 0;
    }
    if (forceTab === 'bulk') return data.bulkTotal === 0;
    if (forceTab === 'sample') return data.sampleTotal === 0;
    return data.sampleTotal === 0 && data.bulkTotal === 0;
  }, [loading, data, forceTab, stageFilter, currentGroups]);

  if (shouldHide) {
    return null;
  }

  const titleText = stageFilter ? `${stageFilter}延期提醒` : (title || '智能延期提醒');
  const tabLabel = activeTab === 'bulk' ? '大货生产' : '样衣开发';

  return (
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
            {stageFilter && data && stageTotal > 0 && (
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
                  onClick={() => { setActiveTab(tab.key); setExpandedStage(null); }}
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

        <div className="delayed-stage-list">
          {currentGroups.length === 0 ? (
            <div className="delayed-stage-empty">
              暂无{activeTab === 'bulk' ? '大货生产' : '样衣开发'}延期项
            </div>
          ) : (
            currentGroups.map(group => {
              const isExpanded = expandedStage === group.stageName;
              const stageColor = STAGE_COLOR_MAP[group.stageName] || '#8c8c8c';
              return (
                <div key={group.stageName} className="delayed-stage-group">
                  <div
                    className="delayed-stage-group-header"
                    onClick={() => toggleStage(group.stageName)}
                  >
                    <div className="delayed-stage-group-left">
                      <span
                        className="delayed-stage-dot"
                        style={{ backgroundColor: stageColor }}
                      />
                      <span className="delayed-stage-name">{group.stageName}</span>
                      <Badge
                        count={group.count}
                        style={{ backgroundColor: stageColor }}
                        overflowCount={99}
                      />
                    </div>
                    <RightOutlined
                      className={`delayed-stage-arrow ${isExpanded ? 'expanded' : ''}`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="delayed-stage-items">
                      {group.items.map(item => {
                        const level = getOverdueLevel(item.overdueDays);
                        return (
                          <div
                            key={item.id}
                            className="delayed-stage-item"
                            onClick={() => handleItemClick(item)}
                          >
                            <div className="delayed-stage-item-top">
                              <span className="delayed-stage-item-no">{item.no}</span>
                              <Tag
                                color={level.color}
                                className="delayed-stage-item-level"
                              >
                                延{item.overdueDays}天
                              </Tag>
                            </div>
                            <div className="delayed-stage-item-bottom">
                              <span className="delayed-stage-item-name">
                                {item.name || '-'}
                              </span>
                              {item.type === 'bulk' && item.factoryName && (
                                <span className="delayed-stage-item-factory">
                                  {item.factoryName}
                                </span>
                              )}
                              {item.type === 'bulk' && item.quantity > 0 && (
                                <span className="delayed-stage-item-qty">
                                  {item.quantity}件
                                </span>
                              )}
                            </div>
                            {item.progress > 0 && (
                              <div className="delayed-stage-item-progress">
                                <div
                                  className="delayed-stage-item-progress-bar"
                                  style={{ width: `${Math.min(item.progress, 100)}%` }}
                                />
                                <span className="delayed-stage-item-progress-text">
                                  {item.progress}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {currentTotal > 0 && (
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
            查看全部 {currentTotal} 项 →
          </div>
        )}
      </Spin>
    </Card>
  );
};

export default DelayedStageBreakdown;
