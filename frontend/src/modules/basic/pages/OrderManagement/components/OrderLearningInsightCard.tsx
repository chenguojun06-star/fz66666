import React, { useState } from 'react';
import { Alert, Empty, Spin, Tag } from 'antd';
import { DownOutlined, LoadingOutlined, RightOutlined } from '@ant-design/icons';
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
    <div className="u-mt-12 u-mb-12">
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--color-bg-container)',
          borderRadius: 8,
          cursor: 'pointer',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="u-d-flex u-ai-center u-gap-8">
          <span className="u-fs-14 u-fw-400" style={{ color: 'var(--color-text-tertiary)' }}>AI 学习建议</span>
          {loading && !expanded && (
            <span className="u-d-inline-flex u-ai-center u-gap-4 u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <LoadingOutlined className="u-fs-12" />
              <span>分析中...</span>
            </span>
          )}
          {presented && presented.tags.length > 0 && (
            <div className="u-d-flex u-gap-4">
              {presented.tags.slice(0, 2).map((tag) => <Tag key={tag} className="u-m-0">{tag}</Tag>)}
            </div>
          )}
        </div>
        <span className="u-d-flex u-ai-center">
          {expanded ? <DownOutlined className="u-fs-13" style={{ color: 'var(--color-text-tertiary)' }} /> : <RightOutlined className="u-fs-13" style={{ color: 'var(--color-text-tertiary)' }} />}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          <Spin spinning={loading}>
            {!presented ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 学习建议暂不可用" />
            ) : (
              <div>
                <div className="u-d-flex u-jc-between u-gap-12 u-fwrap-wrap u-mb-10">
                  <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>{presented.title}</div>
                  <div className="u-d-flex u-gap-8 u-fwrap-wrap">
                    {presented.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>
                </div>
                <Alert type="info" showIcon title={presented.summary} className="u-mb-10" />
                <div className="u-d-grid u-gap-12 u-mb-12" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                  <OrderLearningRecommendationSummary lines={presented.recommendationLines} />
                  <OrderLearningHistoryPanel lines={presented.recentCaseLines} />
                </div>
                <div className="u-d-grid u-gap-12 u-mb-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
