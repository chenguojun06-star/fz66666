import React, { useMemo, useState } from 'react';
import { Button, Tag } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
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
    <div className="u-d-flex u-fd-column u-gap-8">
      <div className="u-d-flex u-ai-center u-gap-8">
        <Button onClick={() => setVisible((prev) => !prev)}>
          {visible ? '收起建议' : '排产建议'}
        </Button>
        <span className="u-fs-14 u-d-inline-flex u-ai-center u-gap-4" style={{ color: 'var(--color-text-tertiary)' }}>
          {loading ? (
            <>
              <LoadingOutlined style={{ fontSize: 14 }} />
              <span>分析中...</span>
            </>
          ) : (
            <span>显示 {items.length}{plans.length > items.length ? ` / ${plans.length}` : ''} 家</span>
          )}
        </span>
      </div>
      {visible ? (
        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            background: 'var(--color-bg-base)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {loading ? (
            <div className="u-fs-14 u-ta-center" style={{ padding: '10px 0', color: 'var(--color-text-tertiary)' }}>正在分析工厂排产...</div>
          ) : items.length === 0 ? (
            <div className="u-fs-14 u-ta-center" style={{ padding: '10px 0', color: 'var(--color-text-tertiary)', lineHeight: '20px' }}>
              当前没有可用的排产建议数据
              <br />
              不代表不能下单，可继续手动选择工厂
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.key}
                style={{
                  border: item.selected ? '1px solid var(--status-processing-border)' : '1px solid var(--color-border-light)',
                  borderRadius: 8,
                  padding: 10,
                  background: item.selected ? 'var(--status-success-bg)' : 'var(--color-bg-container)',
                }}
              >
                <div className="u-d-flex u-ai-center u-jc-between u-gap-8">
                  <div style={{ minWidth: 0 }}>
                    <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>
                      {item.pinned ? '当前工厂' : `推荐${item.rank}`} · {item.factoryName}
                    </div>
                    <div className="u-fs-14 u-mt-2" style={{ color: 'var(--color-text-tertiary)' }}>{item.estimatedText}</div>
                  </div>
                  <div className="u-d-flex u-ai-center u-gap-6">
                    {item.pinned ? <Tag color="green" style={{ marginInlineEnd: 0 }}>当前</Tag> : null}
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>{item.score}分</Tag>
                    <span style={{ fontSize: 15, color: item.sourceTone }}>{item.sourceLabel}</span>
                  </div>
                </div>
                <div className="u-mt-8 u-d-grid u-gap-8" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <div>
                    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>在制</div>
                    <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{item.currentLoadText}</div>
                  </div>
                  <div>
                    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>可用</div>
                    <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{item.availableCapacityText}</div>
                  </div>
                  <div>
                    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>日产能</div>
                    <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{item.dailyCapacityText}</div>
                  </div>
                </div>
                {item.dataNote ? (
                  <div className="u-mt-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>{item.dataNote}</div>
                ) : null}
                <div className="u-mt-8">
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
