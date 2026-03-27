import React from 'react';
import { Alert, Empty, Spin, Tag } from 'antd';
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
  const presented = presentOrderLearningRecommendation(data);

  return (
    <div style={{ marginTop: 12, marginBottom: 12 }}>
      <Spin spinning={loading}>
        {!presented ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 学习建议暂不可用" />
        ) : (
          <div style={{ border: '1px solid var(--table-border-color)', borderRadius: 8, padding: 12 }}>
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
  );
};

export default OrderLearningInsightCard;
