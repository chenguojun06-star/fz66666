import React from 'react';
import { Tag } from 'antd';
import type { StyleInfo } from '@/types/style';
import type { DifficultyAssessment, StyleIntelligenceProfileResponse } from '@/services/intelligence/intelligenceApi';
import { fmtMoney } from '../helpers';

interface KeyTagsCloudProps {
  style: StyleInfo | null;
  activeDifficulty: DifficultyAssessment | null;
  profile: StyleIntelligenceProfileResponse | null;
}

const KeyTagsCloud: React.FC<KeyTagsCloudProps> = ({ style, activeDifficulty: _activeDifficulty, profile: _profile }) => {
  return (
    <div className="u-mt-8 u-p-8px10px u-br-8" style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-antd)' }}>
      <div className="u-fs-12 u-mb-6" style={{ color: 'var(--color-text-tertiary)' }}>关键标签</div>
      <div className="u-d-flex u-fwrap-wrap" style={{ gap: 5 }}>
        {/* 品类 */}
        {String(style?.category || '').trim() && (
          <Tag
            color="blue"
            className="u-m-0 u-fs-12 u-br-10" style={{ lineHeight: '20px', padding: '1px 8px' }}
          >
            品类：{String(style!.category).trim()}
          </Tag>
        )}
        {/* 价格区间 */}
        {Number(style?.price) > 0 && (
          <Tag
            color="var(--color-warning)"
            className="u-m-0 u-fs-12 u-br-10" style={{ lineHeight: '20px', padding: '1px 8px' }}
          >
            价格：{fmtMoney(Number(style!.price))}
          </Tag>
        )}
      </div>
    </div>
  );
};

export default KeyTagsCloud;
