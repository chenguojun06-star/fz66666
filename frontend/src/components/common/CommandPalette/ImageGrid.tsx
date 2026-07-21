import React from 'react';
import { PictureOutlined } from '@ant-design/icons';
import SmartImage from '../SmartImage';
import type { ResultItem } from './types';

interface ImageGridProps {
  imageStyles: ResultItem[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  navigateTo: (item: ResultItem) => void;
}

/** imageStyle 数据形态（与 types.ts 中 ResultItem 的 imageStyle 变体一致） */
interface ImageStyleData {
  id: number;
  styleNo: string;
  styleName: string;
  category: string;
  coverUrl: string;
  similarity?: number;
}

/**
 * 图片搜款 Grid 卡片（保留原 similarity 归一化与高/低置信度配色逻辑）
 */
const ImageGrid: React.FC<ImageGridProps> = ({ imageStyles, activeIdx, setActiveIdx, navigateTo }) => {
  if (imageStyles.length === 0) return null;

  return (
    <>
      <div className="cp-group-title"><PictureOutlined style={{ color: '#a855f7' }} /> 相似款式（{imageStyles.length}）</div>
      <div className="cp-grid-wrap">
        {imageStyles.map((it, i) => {
          const s = it.data as ImageStyleData;
          const sim = typeof s.similarity === 'number'
            ? (s.similarity > 1 ? s.similarity : s.similarity * 100)
            : 0;
          const isHigh = sim >= 72;
          return (
            <div
              key={s.id}
              className={'cp-grid-card' + (i === activeIdx ? ' active' : '')}
              onClick={() => navigateTo(it)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div className="cp-grid-card-cover">
                {s.coverUrl ? (
                  <SmartImage src={s.coverUrl} alt={s.styleName} preview={{ cover: <span>预览</span> }} />
                ) : (
                  <PictureOutlined style={{ fontSize: 28, color: 'var(--color-text-quaternary)' }} />
                )}
                {sim > 0 && (
                  <span
                    className={'cp-grid-card-badge' + (isHigh ? ' high' : '')}
                    style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: isHigh ? 'rgba(34,197,94,0.12)' : 'rgba(14,165,233,0.12)',
                      color: isHigh ? '#15803d' : '#0369a1',
                    }}
                  >
                    {Math.round(sim)}%
                  </span>
                )}
              </div>
              <div className="cp-grid-card-body">
                <div className="cp-grid-card-title">{s.styleNo || '—'}</div>
                <div className="cp-grid-card-sub">{s.styleName || ''}{s.category ? ` · ${s.category}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ImageGrid;
