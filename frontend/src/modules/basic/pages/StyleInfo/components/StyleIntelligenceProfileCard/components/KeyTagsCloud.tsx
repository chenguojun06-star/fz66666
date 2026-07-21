import React from 'react';
import { Tag } from 'antd';
import type { StyleInfo } from '@/types/style';
import type { DifficultyAssessment, StyleIntelligenceProfileResponse } from '@/services/intelligence/intelligenceApi';
import { difficultyColor, fmtMoney } from '../helpers';

interface KeyTagsCloudProps {
  style: StyleInfo | null;
  activeDifficulty: DifficultyAssessment | null;
  profile: StyleIntelligenceProfileResponse | null;
}

const KeyTagsCloud: React.FC<KeyTagsCloudProps> = ({ style, activeDifficulty, profile }) => {
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-antd)' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>关键标签</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {/* 品类 */}
        {String(style?.category || '').trim() && (
          <Tag
            color="blue"
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            品类：{String(style!.category).trim()}
          </Tag>
        )}
        {/* 价格区间 */}
        {Number(style?.price) > 0 && (
          <Tag
            color="var(--color-warning)"
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            价格：{fmtMoney(Number(style!.price))}
          </Tag>
        )}
        {/* 工艺复杂度（由难度评估映射） */}
        {activeDifficulty?.difficultyLevel && (
          <Tag
            color={difficultyColor(activeDifficulty.difficultyLevel)}
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            工艺复杂度：{activeDifficulty.difficultyLabel}
          </Tag>
        )}
        {/* 二次工艺 */}
        {Boolean(activeDifficulty?.hasSecondaryProcess || (style as any)?.secondaryProcess) && (
          <Tag
            color="purple"
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            含二次工艺
          </Tag>
        )}
        {/* 是否已下单 */}
        {Number(style?.orderCount) > 0 || Number((profile as any)?.production?.orderCount || 0) > 0 ? (
          <Tag
            color="green"
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            已下单 · {Number((profile as any)?.production?.orderCount || style?.orderCount || 0)} 单
          </Tag>
        ) : (
          <Tag
            color="default"
            style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
          >
            未下单
          </Tag>
        )}
      </div>
    </div>
  );
};

export default KeyTagsCloud;
