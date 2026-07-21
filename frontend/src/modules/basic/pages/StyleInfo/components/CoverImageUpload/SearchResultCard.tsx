import React from 'react';
import { RightOutlined, SearchOutlined } from '@ant-design/icons';

interface SearchResultCardProps {
  searchResult: any;
  searchExpanded: boolean;
  setSearchExpanded: (v: boolean) => void;
}

/**
 * 以图搜款结果：可折叠卡片
 */
const SearchResultCard: React.FC<SearchResultCardProps> = ({
  searchResult,
  searchExpanded,
  setSearchExpanded,
}) => {
  if (!searchResult) return null;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        marginBottom: 10,
        border: '1px solid var(--color-border-antd)',
        borderRadius: 8,
        background: 'var(--color-bg-container)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setSearchExpanded(!searchExpanded)}
        style={{
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 13,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchOutlined style={{ color: 'var(--primary-color)' }} />
          <span>相似款式推荐</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 12 }}>
            （{searchResult.matchCount} 个）
          </span>
        </div>
        <RightOutlined
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: 10,
            transform: searchExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </div>
      {searchExpanded && (
        <div
          style={{
            padding: '4px 12px 12px 12px',
            borderTop: '1px solid var(--color-border-antd)',
            background: 'var(--color-bg-base)',
          }}
        >
          {searchResult.matches?.map((m: any, i: number) => (
            <div key={i} style={{
              padding: '8px 10px', marginBottom: 6, borderRadius: 6,
              background: 'var(--color-bg-container)', border: '1px solid var(--color-border-antd)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, marginRight: 8 }}>{m.styleNo || '[无款号]'}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                  难度 {m.difficultyScore}/10（{m.difficultyLevel}）
                </span>
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: parseInt(m.similarity) >= 72 ? 'var(--color-success-bg, #f6ffed)' : 'var(--color-bg-container)',
                color: parseInt(m.similarity) >= 72 ? 'var(--color-success, var(--color-success))' : 'var(--color-text-secondary)',
              }}>
                {m.similarity}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--color-text-quaternary)', marginTop: 6 }}>
            相似度≥72%为高相似，可重点关注
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchResultCard;
