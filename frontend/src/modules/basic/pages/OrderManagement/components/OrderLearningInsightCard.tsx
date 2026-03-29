import React, { useState } from 'react';
import { Alert, Empty, Spin, Tag } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import type { OrderLearningRecommendationResponse } from '@/services/intelligence/orderLearningApi';
import OrderLearningFactoryScoreBoard from './OrderLearningFactoryScoreBoard';
import { presentOrderLearningRecommendation } from './orderLearningPresenter';
import OrderLearningGapCard from './OrderLearningGapCard';
import OrderLearningHistoryPanel from './OrderLearningHistoryPanel';
import OrderLearningRecommendationSummary from './OrderLearningRecommendationSummary';
import OrderLearningSimilarCasesPanel from './OrderLearningSimilarCasesPanel';

interface OrderLearningInsightCardProps {
  loading: boolean;
  data?: OrderLearningRecommendationResponse | null;
}

const OrderLearningInsightCard: React.FC<OrderLearningInsightCardProps> = ({
  loading,
  data,
}) => {
  const [expanded, setExpanded] = useState(false);
  const presented = presentOrderLearningRecommendation(data);

  return (
    <div style={{ marginTop: 12, marginBottom: 12 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'linear-gradient(90deg, #f0f5ff 0%, #e6f7ff 100%)',
          borderRadius: 8,
          cursor: 'pointer',
          border: '1px solid #91d5ff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1d39c4' }}>✨ AI 学习建议</span>
          {presented && presented.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {presented.tags.slice(0, 2).map((tag) => <Tag key={tag} style={{ margin: 0 }}>{tag}</Tag>)}
            </div>
          )}
        </div>
        <span style={{ color: '#1d39c4', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {expanded ? '收起' : '展开'} {expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '12px', background: '#fff', border: '1px solid #91d5ff', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          <Spin spinning={loading}>
            {!presented ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 学习建议暂不可用" />
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>{presented.title}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {presented.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>
                </div>
                <Alert type="info" showIcon message={presented.summary} style={{ marginBottom: 10 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 12 }}>
                  <OrderLearningRecommendationSummary lines={presented.recommendationLines} />
                  <OrderLearningHistoryPanel lines={presented.recentCaseLines} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <OrderLearningFactoryScoreBoard lines={presented.factoryScoreLines} />
                  <OrderLearningSimilarCasesPanel lines={presented.similarCaseLines} />
                </div>
                <OrderLearningGapCard lines={presented.gapLines} />
              </div>
            )}
          </Spin>
        </div>
      )}
    </div>
  );
};

export default OrderLearningInsightCard;
