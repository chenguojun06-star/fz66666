/**
 * CustomerPreview — 顾客端实时预览
 *
 * <h3>为什么必须有这个</h3>
 * 调研发现上架流程最严重的体验缺陷是：<b>改图、改详情、改模块顺序，PC 端全程看不到顾客端效果</b>，
 * 只能保存后跳到店铺首页自己找那一款。这导致「上架前不知道顾客会看到什么」，
 * 也让 D-785「开关在哪内容就在哪」的改动无法被肉眼验证。
 *
 * <h3>实现取舍</h3>
 * 直接 iframe 真实门店页（`/shop/index.html?s={slug}#/p/{styleId}`），
 * 而不是另写一套渲染器 —— 预览与线上**同一个页面**，杜绝「预览好看、上线不一样」。
 * 这与 ShopManage 店铺配置页的既有做法一致。
 *
 * <h3>刷新策略</h3>
 * 用 {@code key} 强制重建 iframe 而不是改 src：改 src 会留下历史记录、
 * 部分浏览器不重新加载静态资源。`key` 变化即整页重载，最可靠。
 */
import React, { useEffect, useState } from 'react';
import { Button, Empty, Spin, Tooltip } from 'antd';
import { ReloadOutlined, ExpandOutlined } from '@ant-design/icons';

export interface CustomerPreviewProps {
  /** 店铺 slug，为空时不渲染 */
  slug?: string | null;
  /** 款式 id（详情页路由 #/p/{id}）；为空时退化为店铺首页 */
  styleId?: number | string | null;
  /** 任何值变化都触发预览刷新（保存成功后自增即可） */
  refreshKey?: number;
  width?: number;
  height?: number;
}

const buildUrl = (slug: string, styleId?: number | string | null): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}/shop/index.html?s=${encodeURIComponent(slug)}`;
  if (styleId == null || styleId === '') return base;
  return `${base}#/p/${encodeURIComponent(String(styleId))}`;
};

const CustomerPreview: React.FC<CustomerPreviewProps> = ({
  slug, styleId, refreshKey = 0, width = 340, height = 600,
}) => {
  const [loaded, setLoaded] = useState(false);
  const url = slug ? buildUrl(slug, styleId) : '';

  useEffect(() => {
    setLoaded(false);
  }, [url, refreshKey]);

  if (!slug) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未配置店铺，无法预览" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          顾客端预览{styleId ? '（商品详情页）' : '（店铺首页）'}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <Tooltip title="刷新预览">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setLoaded(false)}>
              刷新
            </Button>
          </Tooltip>
          <Tooltip title="在新窗口打开（360×780）">
            <Button
              size="small"
              icon={<ExpandOutlined />}
              onClick={() => window.open(url, 'customerPreview', 'width=390,height=800,left=200,top=60')}
            >
              新窗口
            </Button>
          </Tooltip>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width,
            height,
            border: '6px solid #1d1d1f',
            borderRadius: 16,
            overflow: 'hidden',
            background: 'var(--color-bg-card)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {!loaded && (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-bg-container)', zIndex: 2,
              }}
            >
              <Spin size="small" />
            </div>
          )}
          <iframe
            key={`${styleId ?? 'home'}-${refreshKey}`}
            src={url}
            title="顾客端预览"
            onLoad={() => setLoaded(true)}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </div>
      </div>

      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        预览的是线上真实门店页面，保存后点「刷新」查看最新效果
      </span>
    </div>
  );
};

export default CustomerPreview;
