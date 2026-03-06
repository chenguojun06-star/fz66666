import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Spin, Tag } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PainPointResponse } from '@/services/intelligence/intelligenceApi';
import { LiveDot, risk2color } from './IntelligenceWidgets';

const levelLabelMap: Record<string, string> = {
  HIGH: '高优先级',
  MEDIUM: '中优先级',
  LOW: '低优先级',
};

const domainLabelMap: Record<string, string> = {
  PRODUCTION: '生产',
  FACTORY: '工厂',
  FINANCE: '财务',
  WAREHOUSE: '仓库',
};

const TenantPainPointPanel: React.FC = () => {
  const { message } = App.useApp();
  const [items, setItems] = useState<PainPointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (withRefresh = false) => {
    try {
      if (withRefresh) {
        setRefreshing(true);
        await intelligenceApi.refreshPainPoints();
      } else {
        setLoading(true);
      }
      const response = await intelligenceApi.listPainPoints(8);
      const next = ((response as any)?.data ?? []) as PainPointResponse[];
      setItems(Array.isArray(next) ? next : []);
    } catch (error: any) {
      message.error(error?.message || '加载租户痛点失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [message]);

  useEffect(() => {
    void load(true);
  }, [load]);

  return (
    <div style={{ padding: '0 24px 12px' }}>
      <div className="c-card c-pain-card">
        <div className="c-card-title">
          <LiveDot size={7} color={items.length > 0 ? '#ff4136' : '#39ff14'} />
          租户经营痛点雷达
          <span className="c-card-badge red-badge">{items.length} 项</span>
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined spin={refreshing} />}
            className="c-pain-refresh"
            onClick={() => { void load(true); }}
          >
            刷新分析
          </Button>
        </div>

        {loading ? (
          <div className="c-pain-loading"><Spin size="small" /> 正在分析最近订单、扫码与反馈…</div>
        ) : items.length === 0 ? (
          <div className="c-pain-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前未识别到高频经营痛点" />
          </div>
        ) : (
          <div className="c-pain-grid">
            {items.map((item) => {
              const levelColor = risk2color(item.painLevel || 'LOW');
              return (
                <div key={item.id} className="c-pain-item">
                  <div className="c-pain-head">
                    <div className="c-pain-title-wrap">
                      <span className="c-pain-title">{item.painName}</span>
                      <Tag color={item.painLevel === 'HIGH' ? 'error' : item.painLevel === 'MEDIUM' ? 'warning' : 'success'}>
                        {levelLabelMap[item.painLevel] || item.painLevel}
                      </Tag>
                    </div>
                    <span className="c-pain-domain" style={{ color: levelColor }}>
                      {domainLabelMap[item.businessDomain] || item.businessDomain}
                    </span>
                  </div>
                  <div className="c-pain-metrics">
                    <span>触发 {item.triggerCount || 0} 次</span>
                    <span>影响 {item.affectedOrderCount || 0} 单</span>
                    <span>{item.latestTriggerTime ? `最近 ${dayjs(item.latestTriggerTime).format('MM-DD HH:mm')}` : '等待新样本'}</span>
                  </div>
                  <div className="c-pain-reason">{item.rootReasonSummary || '暂无原因摘要'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantPainPointPanel;
