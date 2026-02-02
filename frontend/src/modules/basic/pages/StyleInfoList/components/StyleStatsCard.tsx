import React from 'react';
import { Card, Col, Row, Segmented, Spin, Statistic, Tag } from 'antd';
import type { PatternDevelopmentStats } from '@/types/production';

interface StyleStatsCardProps {
  stats: PatternDevelopmentStats | null;
  loading: boolean;
  rangeType: 'day' | 'week' | 'month';
  onRangeChange: (value: string | number) => void;
}

/**
 * 开发费用统计迷你看板
 * 显示：面辅料、工序单价、二次工艺、总开发费、样衣数量
 */
const StyleStatsCard: React.FC<StyleStatsCardProps> = ({
  stats,
  loading,
  rangeType,
  onRangeChange
}) => {
  return (
    <Card
      size="small"
      className="development-stats-card mb-sm"
      style={{ background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>📊 开发费用统计</span>
        <Segmented
          value={rangeType}
          onChange={onRangeChange}
          options={[
            { label: '今日', value: 'day' },
            { label: '本周', value: 'week' },
            { label: '本月', value: 'month' },
          ]}
          size="small"
        />
      </div>
      <Spin spinning={loading}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title={<span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>🧵 面辅料</span>}
              value={stats?.materialCost ?? 0}
              precision={2}
              prefix="¥"
              styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>⚙️ 工序单价</span>}
              value={stats?.processCost ?? 0}
              precision={2}
              prefix="¥"
              styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>🔧 二次工艺</span>}
              value={stats?.secondaryProcessCost ?? 0}
              precision={2}
              prefix="¥"
              styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>💰 总开发费</span>}
              value={stats?.totalCost ?? 0}
              precision={2}
              prefix="¥"
              styles={{ value: { color: 'var(--primary-color)', fontSize: 20, fontWeight: 700 } }}
            />
          </Col>
        </Row>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <Tag color="default">
            样衣数量: {stats?.patternCount ?? 0} 件
          </Tag>
        </div>
      </Spin>
    </Card>
  );
};

export default StyleStatsCard;
