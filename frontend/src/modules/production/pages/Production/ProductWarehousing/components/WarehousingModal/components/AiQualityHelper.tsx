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

const { Text } = Typography;

interface AiQualityHelperProps {
  orderId?: string | number;
  defectCategory?: string;
  onAdopt: (text: string) => void;
}

const verdictColor: Record<string, string> = {
  good: '#52c41a',
  warn: '#faad14',
  critical: '#ff4d4f',
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
    <div style={{ margin: '8px 0', padding: '10px 12px', background: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e8ff' }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <XiaoyunCloudAvatar size={16} active />
        <Text strong style={{ fontSize: 13, color: '#1677ff' }}>AI质检助手</Text>
        {loading && <Spin size="small" style={{ marginLeft: 4 }} />}
        {data && data.historicalVerdict && (
          <Tag color={verdictColor[data.historicalVerdict]} style={{ marginLeft: 'auto', fontSize: 11 }}>
            {verdictLabel[data.historicalVerdict]}
            {data.historicalDefectRate != null && ` ${(data.historicalDefectRate * 100).toFixed(1)}%`}
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
          style={{ marginBottom: 8, padding: '4px 10px', fontSize: 12 }}
          banner
        />
      )}

      {/* 历史严重缺陷告警 */}
      {data?.historicalVerdict === 'critical' && !data.urgentTip && (
        <Alert
          title="该订单历史次品率偏高，请加强本次质检力度"
          type="error"
          showIcon
          style={{ marginBottom: 8, padding: '4px 10px', fontSize: 12 }}
          banner
        />
      )}

      {/* 质检要点 */}
      {data && data.checkpoints && data.checkpoints.length > 0 && (
        <div style={{ marginBottom: suggestion ? 8 : 0 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>质检要点：</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {data.checkpoints.map((point, idx) => {
              const isRed = point.startsWith('🔴');
              const isYellow = point.startsWith('🟡');
              return (
                <div key={idx} style={{
                  padding: '4px 8px', fontSize: 13,
                  background: isRed ? '#fff1f0' : isYellow ? '#fffbe6' : '#f0f7ff',
                  borderLeft: `3px solid ${isRed ? '#ff4d4f' : isYellow ? '#faad14' : '#1677ff'}`,
                  borderRadius: '0 4px 4px 0', color: '#333',
                }}>{point}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* 异常建议 + 采纳按钮 */}
      {defectCategory && !loading && (
        suggestion ? (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckCircleOutlined style={{ color: '#faad14', marginTop: 2, flexShrink: 0 }} />
              <Text style={{ fontSize: 12, flex: 1 }}>{suggestion}</Text>
              <Button
                type="primary"
                size="small"
                style={{ flexShrink: 0, marginLeft: 8 }}
                onClick={() => onAdopt(suggestion)}
              >
                采纳
              </Button>
            </div>
          </div>
        ) : (
          !loading && data && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              暂无该次品类别的处理建议
            </Text>
          )
        )
      )}
    </div>
  );
};

export default AiQualityHelper;
