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
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 14 }}>{record.styleName || '未命名'}</Text>
        <Tag color={STATUS_MAP[record.status]?.color} style={{ margin: 0 }}>
          {STATUS_MAP[record.status]?.label}
        </Tag>
      </div>

      {latestReview?.comment && (
        <div style={{
          marginBottom: 10, padding: '8px 10px',
          background: latestReview.decision === 'APPROVE' ? '#f6ffed' : '#fff2f0',
          border: `1px solid ${latestReview.decision === 'APPROVE' ? '#b7eb8f' : '#ffccc7'}`,
          borderRadius: 6, fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            审核意见{latestReview.reviewerName ? ` · ${latestReview.reviewerName}` : ''}
          </div>
          <div style={{ color: '#555', lineHeight: 1.6 }}>{latestReview.comment}</div>
        </div>
      )}

      {hasScore ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <Space size={4}>
              <ThunderboltOutlined style={{ color: '#722ed1' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>趋势评分</Text>
              <Tooltip title={scoreMeta.title}>
                <Tag color={scoreMeta.color} style={{ margin: 0, fontSize: 10 }}>{scoreMeta.label}</Tag>
              </Tooltip>
              <Text strong style={{
                color: record.trendScore! >= 75 ? '#52c41a' : record.trendScore! >= 50 ? '#fa8c16' : '#ff4d4f',
              }}>
                {record.trendScore} 分
              </Text>
            </Space>
          </div>
          <Progress
            percent={record.trendScore}
            strokeColor={record.trendScore! >= 75 ? '#52c41a' : record.trendScore! >= 50 ? '#fa8c16' : '#ff4d4f'}
            size="small"
            style={{ marginBottom: 8 }}
          />
          {record.trendScoreReason && (
            <Paragraph style={{ fontSize: 11, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>
              {record.trendScoreReason.slice(0, 150)}{record.trendScoreReason.length > 150 ? '…' : ''}
            </Paragraph>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0 8px', color: '#888', fontSize: 12 }}>
          {aiLoading ? '正在生成 AI 分析...' : '悬停后自动分析趋势、价值与决策建议'}
        </div>
      )}

      <Divider style={{ margin: '8px 0' }} />

      <Row gutter={[8, 6]}>
        {record.costEstimate != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>成本估算</Text>
            <div style={{ fontSize: 13, fontWeight: 600 }}>¥{record.costEstimate}</div>
          </Col>
        )}
        {record.targetPrice != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>目标报价</Text>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#52c41a' }}>¥{record.targetPrice}</div>
          </Col>
        )}
        {record.profitEstimate != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>预估利润率</Text>
            <div style={{ fontSize: 13, fontWeight: 600, color: record.profitEstimate >= 30 ? '#52c41a' : '#fa8c16' }}>
              {record.profitEstimate}%
            </div>
          </Col>
        )}
        {record.targetQty != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>预计下单</Text>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{record.targetQty} 件</div>
          </Col>
        )}
      </Row>

      {record.seasonTags && (() => {
        try {
          const tags: string[] = JSON.parse(record.seasonTags);
          return tags.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              {tags.map(t => <Tag key={t} style={{ fontSize: 11, marginBottom: 2 }}>{t}</Tag>)}
            </div>
          ) : null;
        } catch { return null; }
      })()}

      {hasScore && decisionInsight && (
        <div style={{ marginTop: 10 }}>
          <DecisionInsightCard compact insight={decisionInsight} />
        </div>
      )}
    </div>
  );
};

export default AiHoverCard;
