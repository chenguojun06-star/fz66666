/**
 * AI质检助手组件
 * 1. 历史质检建议（基于订单ID）
 * 2. 视觉AI质检（图片URL → 缺陷检测 / 款式识别 / 色差检测）
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Button, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { qualityAiApi, QualityAiSuggestionResult } from '@/services/production/productionApi';
import { toPercent } from '@/utils/format';

const { Text } = Typography;

interface AiQualityHelperProps {
  orderId?: string | number;
  defectCategory?: string;
  onAdopt: (text: string) => void;
}

const verdictColor: Record<string, string> = {
  good: 'var(--color-success)',
  warn: 'var(--color-warning)',
  critical: 'var(--color-danger)',
};
const verdictLabel: Record<string, string> = {
  good: '历史良好',
  warn: '历史偏高',
  critical: '历史严重',
};

const AiQualityHelper: React.FC<AiQualityHelperProps> = ({ orderId, defectCategory, onAdopt }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QualityAiSuggestionResult | null>(null);

  const fetchSuggestion = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await qualityAiApi.getSuggestion(id);
      if (res?.code === 200 && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderId) {
      fetchSuggestion(String(orderId));
    } else {
      setData(null);
    }
  }, [orderId, fetchSuggestion]);

  if (!orderId) return null;

  const suggestion = defectCategory && data?.defectSuggestions?.[defectCategory]
    ? data.defectSuggestions[defectCategory]
    : null;

  return (
    <div className="u-m-8px0 u-br-6" style={{ padding: '10px 12px', background: 'var(--status-processing-bg)', border: '1px solid var(--color-blue-100)' }}>
      {/* 标题行 */}
      <div className="u-d-flex u-ai-center u-gap-6 u-mb-8">
        <XiaoyunCloudAvatar size={16} active />
        <Text strong className="u-fs-14" style={{ color: 'var(--color-primary)' }}>AI质检助手</Text>
        {loading && <Spin className="u-ml-4" />}
        {data && data.historicalVerdict && (
          <Tag color={verdictColor[data.historicalVerdict]} className="u-ml-auto u-fs-14">
            {verdictLabel[data.historicalVerdict]}
            {data.historicalDefectRate != null && ` ${toPercent(data.historicalDefectRate)}`}
          </Tag>
        )}
        {data?.urgent && (
          <Tag color="orange">加急</Tag>
        )}
      </div>

      {/* 加急提示 */}
      {data?.urgentTip && (
        <Alert
          title={data.urgentTip}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          className="u-mb-8 u-fs-14" style={{ padding: '4px 10px' }}
          banner
        />
      )}

      {/* 历史严重缺陷告警 */}
      {data?.historicalVerdict === 'critical' && !data.urgentTip && (
        <Alert
          title="该订单历史次品率偏高，请加强本次质检力度"
          type="error"
          showIcon
          className="u-mb-8 u-fs-14" style={{ padding: '4px 10px' }}
          banner
        />
      )}

      {/* 质检要点 */}
      {data && data.checkpoints && data.checkpoints.length > 0 && (
        <div style={{ marginBottom: suggestion ? 8 : 0 }}>
          <Text type="secondary" className="u-fs-14">质检要点：</Text>
          <div className="u-d-flex u-fd-column u-gap-4 u-mt-4">
            {data.checkpoints.map((point, idx) => {
              const isRed = point.startsWith('🔴');
              const isYellow = point.startsWith('🟡');
              return (
                <div key={idx} style={{
                  padding: '4px 8px', fontSize: 14,
                  background: isRed ? 'var(--status-error-bg)' : isYellow ? 'var(--status-warning-bg)' : 'var(--status-processing-bg)',
                  borderLeft: `3px solid ${isRed ? 'var(--color-danger)' : isYellow ? 'var(--color-warning)' : 'var(--color-primary)'}`,
                  borderRadius: '0 4px 4px 0', color: 'var(--color-text-primary)',
                }}>{point}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* 异常建议 + 采纳按钮 */}
      {defectCategory && !loading && (
        suggestion ? (
          <div className="u-mt-8 u-p-8px10px u-br-4" style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)' }}>
            <div className="u-d-flex u-ai-start u-gap-8">
              <CheckCircleOutlined className="u-mt-2 u-fshrink-0" style={{ color: 'var(--color-warning)' }} />
              <Text className="u-fs-14 u-flex-1">{suggestion}</Text>
              <Button
                type="primary"
               
                className="u-fshrink-0 u-ml-8"
                onClick={() => onAdopt(suggestion)}
              >
                采纳
              </Button>
            </div>
          </div>
        ) : (
          !loading && data && (
            <Text type="secondary" className="u-fs-14 u-d-block u-mt-4">
              暂无该次品类别的处理建议
            </Text>
          )
        )
      )}
    </div>
  );
};

export default AiQualityHelper;
