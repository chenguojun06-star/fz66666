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
      </div>
    </div>
  );
};

export default KeyTagsCloud;
