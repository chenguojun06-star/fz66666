import React from 'react';
import { Row, Col, Tag, Space, Tooltip, Divider, Progress, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH } from '@/components/common/DecisionInsightCard';
import type { Candidate, CandidateReviewItem } from './selectionCenterUtils';
import { STATUS_MAP, getScoreMeta, buildCandidateInsight } from './selectionCenterUtils';

const { Text, Paragraph } = Typography;

const AiHoverCard: React.FC<{
  record: Candidate;
  aiLoading: boolean;
  latestReview?: CandidateReviewItem | null;
}> = ({ record, aiLoading, latestReview }) => {
  const hasScore = record.trendScore != null;
  const scoreMeta = getScoreMeta(record);
  const decisionInsight = buildCandidateInsight(record);

  return (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, boxSizing: 'border-box' }}>
      <div className="u-mb-8 u-d-flex u-jc-between u-ai-center">
        <Text strong className="u-fs-14">{record.styleName || '未命名'}</Text>
        <Tag color={STATUS_MAP[record.status]?.color} className="u-m-0">
          {STATUS_MAP[record.status]?.label}
        </Tag>
      </div>

      {latestReview?.comment && (
        <div style={{
          marginBottom: 10, padding: '8px 10px',
          background: latestReview.decision === 'APPROVE' ? 'var(--status-success-bg)' : 'var(--status-success-bg)',
          border: `1px solid ${latestReview.decision === 'APPROVE' ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
          borderRadius: 6, fontSize: 14,
        }}>
          <div className="u-fw-600 u-mb-4">
            审核意见{latestReview.reviewerName ? ` · ${latestReview.reviewerName}` : ''}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{latestReview.comment}</div>
        </div>
      )}

      {hasScore ? (
        <>
          <div className="u-mb-4">
            <Space size={4}>
              <ThunderboltOutlined style={{ color: 'var(--color-accent-purple)' }} />
              <Text type="secondary" className="u-fs-14">趋势评分</Text>
              <Tooltip title={scoreMeta.title}>
                <Tag color={scoreMeta.color} className="u-m-0 u-fs-14">{scoreMeta.label}</Tag>
              </Tooltip>
              <Text strong style={{
                color: record.trendScore! >= 75 ? 'var(--color-success)' : record.trendScore! >= 50 ? 'var(--color-warning)' : 'var(--color-danger)',
              }}>
                {record.trendScore} 分
              </Text>
            </Space>
          </div>
          <Progress
            percent={record.trendScore}
            strokeColor={record.trendScore! >= 75 ? 'var(--color-success)' : record.trendScore! >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'}
           
            className="u-mb-8"
          />
          {record.trendScoreReason && (
            <Paragraph className="u-fs-14 u-mb-8" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {record.trendScoreReason.slice(0, 150)}{record.trendScoreReason.length > 150 ? '…' : ''}
            </Paragraph>
          )}
        </>
      ) : (
        <div className="u-ta-center u-fs-14" style={{ padding: '12px 0 8px', color: 'var(--color-text-muted)' }}>
          {aiLoading ? '正在生成 AI 分析...' : '悬停后自动分析趋势、价值与决策建议'}
        </div>
      )}

      <Divider className="u-m-8px0" />

      <Row gutter={[8, 6]}>
        {record.costEstimate != null && (
          <Col span={12}>
            <Text type="secondary" className="u-fs-14">成本估算</Text>
            <div className="u-fs-14 u-fw-600">¥{record.costEstimate}</div>
          </Col>
        )}
        {record.targetPrice != null && (
          <Col span={12}>
            <Text type="secondary" className="u-fs-14">目标报价</Text>
            <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-success)' }}>¥{record.targetPrice}</div>
          </Col>
        )}
        {record.profitEstimate != null && (
          <Col span={12}>
            <Text type="secondary" className="u-fs-14">预估利润率</Text>
            <div style={{ fontSize: 14, fontWeight: 600, color: record.profitEstimate >= 30 ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {record.profitEstimate}%
            </div>
          </Col>
        )}
        {record.targetQty != null && (
          <Col span={12}>
            <Text type="secondary" className="u-fs-14">预计下单</Text>
            <div className="u-fs-14 u-fw-600">{record.targetQty} 件</div>
          </Col>
        )}
      </Row>

      {record.seasonTags && (() => {
        try {
          const tags: string[] = JSON.parse(record.seasonTags);
          return tags.length > 0 ? (
            <div className="u-mt-8">
              {tags.map(t => <Tag key={t} className="u-fs-14 u-mb-2">{t}</Tag>)}
            </div>
          ) : null;
        } catch { return null; }
      })()}

      {hasScore && decisionInsight && (
        <div className="u-mt-10">
          <DecisionInsightCard compact insight={decisionInsight} />
        </div>
      )}
    </div>
  );
};

export default AiHoverCard;
