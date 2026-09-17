import React, { useEffect, useState } from 'react';
import { Spin, Tag } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { colorNameToHex } from './MaterialColorItemsModal';
import type { MaterialColorCard, MaterialColorCardItem } from './types';

// ===== 供应商色卡 hover「书本式」速览：首次悬停懒加载该卡前 N 条色号/颜色/图片，模块级缓存 =====
interface ColorCardHoverPreviewProps {
  card: MaterialColorCard;
  limit?: number;
}

// 悬停预览缓存：一次会话内同一张卡只请求一次（卡片级，不涉及跨租户数据）
const previewCache = new Map<string, MaterialColorCardItem[]>();
const PREVIEW_COUNT = 8;

/** M-A01 / F-21 → A01 / 21（悬停卡片上展示布行原色号） */
const shortCode = (code?: string): string => {
  if (!code) return '';
  return code.replace(/^[MLF]-/i, '').replace(/-\d{1,2}$/, '');
};

const ColorCardHoverPreview: React.FC<ColorCardHoverPreviewProps> = ({ card, limit = PREVIEW_COUNT }) => {
  const [items, setItems] = useState<MaterialColorCardItem[]>(() => previewCache.get(card.id) ?? []);
  const [loading, setLoading] = useState<boolean>(!previewCache.has(card.id));

  useEffect(() => {
    let cancelled = false;
    const cached = previewCache.get(card.id);
    if (cached) {
      setItems(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<{ code: number; data: { items?: MaterialColorCardItem[] } }>(`/material-color-card/${card.id}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.code === 200 ? res.data?.items || [] : [];
        previewCache.set(card.id, list);
        setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const top = items.slice(0, limit);

  return (
    <div style={{ width: 330 }}>
      {/* 书眉：像色卡本扉页 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 8,
          marginBottom: 10,
          borderBottom: '2px solid var(--color-border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          <BookOutlined style={{ marginRight: 6, color: 'var(--color-primary)' }} />
          {card.supplierName || '色卡'} · 色卡速览
        </span>
        {card.cardCode && <Tag color="blue" style={{ margin: 0 }}>{card.cardCode}</Tag>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin size="small" />
          <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)', marginTop: 6 }}>正在翻开色卡本…</div>
        </div>
      ) : top.length === 0 ? (
        <div style={{ color: 'var(--color-text-tertiary)', padding: '12px 0' }}>该色卡暂无颜色明细</div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
            }}
          >
            {top.map((it, idx) => {
              const swatch = colorNameToHex(it.color);
              return (
                <div key={it.id || idx} style={{ textAlign: 'center' }}>
                  {it.image ? (
                    <img
                      src={getFullAuthedFileUrl(it.image)}
                      alt={it.color || shortCode(it.materialCode)}
                      loading="lazy"
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid var(--color-border)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: 6,
                        background: swatch ?? 'var(--color-bg-subtle)',
                        border: '1px solid rgba(0,0,0,0.12)',
                      }}
                    />
                  )}
                  <div className="u-fs-12" style={{ fontWeight: 600, marginTop: 4, lineHeight: 1.2 }}>
                    {shortCode(it.materialCode) || `#${idx + 1}`}
                  </div>
                  <div
                    className="u-fs-12"
                    title={it.color || ''}
                    style={{
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {it.color || '-'}
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > limit && (
            <div className="u-fs-12" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>
              共 {items.length} 条颜色，仅展示前 {limit} 条，点击「物料管理」查看全部
            </div>
          )}
        </>
      )}

      {(card.supplierContactPerson || card.supplierContactPhone || card.remark) && (
        <div
          className="u-fs-12"
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px dashed var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {card.supplierContactPerson && <div>联系人：{card.supplierContactPerson}{card.supplierContactPhone ? ` · ${card.supplierContactPhone}` : ''}</div>}
          {card.remark && <div style={{ marginTop: 2 }}>备注：{card.remark}</div>}
        </div>
      )}
    </div>
  );
};

ColorCardHoverPreview.displayName = 'ColorCardHoverPreview';

export default ColorCardHoverPreview;
