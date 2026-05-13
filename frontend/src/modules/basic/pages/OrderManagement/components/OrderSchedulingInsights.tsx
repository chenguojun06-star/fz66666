import React, { useMemo, useState } from 'react';
import { Button, Tag } from 'antd';
import type { SchedulePlan } from '@/services/intelligence/intelligenceApi';
import { buildSchedulingInsightItems } from './orderSchedulingInsightsOrchestrator';

interface OrderSchedulingInsightsProps {
  loading: boolean;
  plans: SchedulePlan[];
  selectedFactoryId?: string;
  factories: Array<{ id?: string | number; factoryName: string }>;
  onSelectFactory: (factoryId: string) => void;
}

const OrderSchedulingInsights: React.FC<OrderSchedulingInsightsProps> = ({
  loading,
  plans,
  selectedFactoryId,
  factories,
  onSelectFactory,
}) => {
  const [visible, setVisible] = useState(false);
  const items = useMemo(
    () => buildSchedulingInsightItems(plans, factories, selectedFactoryId),
    [factories, plans, selectedFactoryId],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button onClick={() => setVisible((prev) => !prev)}>
          {visible ? '收起建议' : '排产建议'}
        </Button>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {loading ? '分析中...' : `显示 ${items.length}${plans.length > items.length ? ` / ${plans.length}` : ''} 家`}
        </span>
      </div>
      {visible ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            background: '#fff',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {loading ? (
            <div style={{ padding: '10px 0', fontSize: 12, color: '#8c8c8c', textAlign: 'center' }}>正在分析工厂排产...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '10px 0', fontSize: 12, color: '#8c8c8c', textAlign: 'center', lineHeight: '20px' }}>
              当前没有可用的排产建议数据
              <br />
              不代表不能下单，可继续手动选择工厂
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.key}
                style={{
                  border: item.selected ? '1px solid #91caff' : '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 10,
                  background: item.selected ? '#f6ffed' : '#fafafa',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f1f1f' }}>
                      {item.pinned ? '当前工厂' : `推荐${item.rank}`} · {item.factoryName}
                    </div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{item.estimatedText}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.pinned ? <Tag color="green" style={{ marginInlineEnd: 0 }}>当前</Tag> : null}
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>{item.score}分</Tag>
                    <span style={{ fontSize: 11, color: item.sourceTone }}>{item.sourceLabel}</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>在制</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{item.currentLoadText}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>可用</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{item.availableCapacityText}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>日产能</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{item.dailyCapacityText}</div>
                  </div>
                </div>
                {item.dataNote ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>{item.dataNote}</div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <Button
                   
                    type={item.selected ? 'primary' : 'default'}
                    onClick={() => {
                      if (item.factoryId) {
                        onSelectFactory(item.factoryId);
                      }
                    }}
                    disabled={!item.factoryId}
                  >
                    {item.selected ? '已选中' : '选这个'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

export default OrderSchedulingInsights;
