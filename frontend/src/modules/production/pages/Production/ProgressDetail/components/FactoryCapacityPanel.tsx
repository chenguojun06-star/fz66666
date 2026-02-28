import React, { useEffect, useState } from 'react';
import { Badge, Spin, Tag, Tooltip } from 'antd';
import { productionOrderApi, type FactoryCapacityItem } from '@/services/production/productionApi';

interface Props {
  /** 外部触发刷新的 key，变化即重新请求 */
  refreshKey?: number;
}

/**
 * 工厂产能雷达面板
 * 展示各工厂当前在制订单数 / 总件数 / 高风险 / 逾期
 * 无额外 store，独立请求，轻量可内嵌
 */
const FactoryCapacityPanel: React.FC<Props> = ({ refreshKey }) => {
  const [items, setItems] = useState<FactoryCapacityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    productionOrderApi.getFactoryCapacity()
      .then((res: any) => {
        const data = res?.data ?? res;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <Spin size="small" style={{ margin: '8px 0' }} />;
  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0' }}>
      {items.map((item) => {
        const hasRisk   = item.atRiskCount   > 0;
        const hasOverdue = item.overdueCount > 0;
        return (
          <Tooltip
            key={item.factoryName}
            title={
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div>在制：<b>{item.totalOrders}</b> 单 / <b>{item.totalQuantity}</b> 件</div>
                {hasRisk   && <div style={{ color: '#ffd591' }}>⚠ 高风险：{item.atRiskCount} 单</div>}
                {hasOverdue && <div style={{ color: '#ff7875' }}>⏰ 逾期：{item.overdueCount} 单</div>}
              </div>
            }
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 12, cursor: 'default',
              background: hasOverdue ? '#fff2f0' : hasRisk ? '#fffbe6' : '#f0f5ff',
              border: `1px solid ${hasOverdue ? '#ffccc7' : hasRisk ? '#ffe58f' : '#adc6ff'}`,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 600, color: '#333' }}>{item.factoryName}</span>
              <Tag
                color="blue"
                style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '16px', height: 16 }}
              >
                {item.totalOrders}单
              </Tag>
              {hasRisk && (
                <Badge count={item.atRiskCount} size="small" color="#faad14" />
              )}
              {hasOverdue && (
                <Badge count={item.overdueCount} size="small" color="#ff4d4f" />
              )}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default FactoryCapacityPanel;
