import React, { useEffect, useState } from 'react';
import { Alert, Button, Space, Tag, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import { COVER_RECOMMEND_SIZE_PX } from '../coverImageRules';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import {
  analyzeCoverPixels,
  evaluateCoverImage,
  fetchImageBytes,
  formatBytes,
  formatFromUrl,
  manualCoverChecks,
  type CoverImageMeta,
} from '../coverImageRules';
import type { ListingIssue } from '../listingCompliance';

const { Text } = Typography;

interface Props {
  cover: string | null;
  setCover: (v: string | null) => void;
  /**
   * D-800：主图组（最多 5 张，与淘宝/拼多多一致）。
   * **第 1 张即主图**，会同步到 {@link setCover} 供 C 端列表卡片使用；
   * 全部图片存这里供 C 端详情页轮播使用。
   */
  coverList?: string[];
  setCoverList?: (v: string[]) => void;
  colorImages: Record<string, string>;
  setColorImages: (v: Record<string, string>) => void;
  /** 该款式实际存在的颜色（来自 SKU 列表） */
  colors: string[];
  /**
   * D-785：只显示主图（颜色图已挪进详情页的「颜色选择」模块）。
   *
   * <p>同一个内容不能既在这里、又在模块开关旁边 —— 商家改了一处、另一处还是旧值，
   * 是「开关在这里、内容在那边」最常见的来源。
   */
  onlyCover?: boolean;
}

/**
 * 商品图片区（D-768）：
 * - 主图 = 店铺列表卡片 + 详情页默认大图（存 style.cover）
 * - 每个颜色一张图 = 顾客在详情页切换颜色时换的图（存sku_color_image）
 *
 * D-778：主图上传后自动按平台规范体检（尺寸/比例/体积/格式/白底/主体占比），
 * 边选边提示，而不是等上架被平台驳回才发现。
 */
const CoverColorImagesSection: React.FC<Props> = ({
  cover, setCover, coverList, setCoverList, colorImages, setColorImages, colors, onlyCover = false,
}) => {
  /**
   * 主图组：外部没传时退化为「只有 cover 一张」的老行为，保证向后兼容
   * （详情页模块里的颜色图区也复用了本组件）。
   */
  const gallery: string[] = coverList ?? (cover ? [cover] : []);
  const setGallery = (next: string[]) => {
    setCoverList?.(next);
    // 第 1 张同步为主图 —— C 端列表卡片读 style.cover，不能断
    const first = next[0] ?? null;
    if (first !== cover) setCover(first);
  };

  const [coverBad, setCoverBad] = useState(false);
  const [coverMeta, setCoverMeta] = useState<CoverImageMeta | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const probeSrc = cover ? getFullAuthedFileUrl(cover) : '';

  // D-778：主图变化时做一次完整体检（尺寸/体积/白底/主体占比）
  useEffect(() => {
    let cancelled = false;
    if (!cover) {
      setCoverMeta(null);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const img = new Image();
    // 与画布同源分析需要 CORS 头；失败时 analyzeCoverPixels 会返回 null 并跳过对应检查
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const px = analyzeCoverPixels(img);
      void fetchImageBytes(getFullAuthedFileUrl(cover)).then((bytes) => {
        if (cancelled) return;
        setCoverMeta({
          width: img.naturalWidth,
          height: img.naturalHeight,
          bytes,
          format: formatFromUrl(cover),
          ...px,
        });
        setAnalyzing(false);
      });
    };
    img.onerror = () => {
      if (cancelled) return;
      setAnalyzing(false);
    };
    img.src = probeSrc;
    return () => { cancelled = true; };
  }, [cover, probeSrc]);

  const pickAsCover = (color: string) => {
    const url = colorImages[color];
    if (url) setCover(url);
  };

  const issues: ListingIssue[] = evaluateCoverImage(coverMeta);
  const blockers = issues.filter((i) => i.level === 'block');
  const warnings = issues.filter((i) => i.level === 'warn');

  return (
    <div className="shop-edit__block">
      {/* 隐藏探针：识别 1×1 占位图（线上「连衣裙」封面就是 70 字节的 1×1，店铺里会糊成一块纯色） */}
      {probeSrc ? (
        <img
          src={probeSrc}
          alt=""
          className="shop-listing__probe"
          onLoad={(e) => setCoverBad(e.currentTarget.naturalWidth <= 1 || e.currentTarget.naturalHeight <= 1)}
          onError={() => setCoverBad(true)}
        />
      ) : null}

      <div className="shop-listing__imgs">
        <div className="shop-listing__cover">
          {/* D-800：主图 1→5 张。
              淘宝/拼多多商品主图均为 5 张，第 1 张作为搜索结果展示图。
              这里用角标区分「主图 / 图N」，运营一眼知道哪张会被顾客搜到。 */}
          <MultiImageUploadBox
            value={gallery}
            onChange={(v) => { setGallery(v); setCoverBad(false); }}
            maxCount={5}
            size={96}
            label="主图"
            badges={gallery.map((_, i) => (i === 0 ? '主图' : `图${i + 1}`))}
            captions={gallery.map((_, i) => (
              i === 0 ? `最大3MB · 建议${COVER_RECOMMEND_SIZE_PX}×${COVER_RECOMMEND_SIZE_PX}` : ''
            ))}
          />
          <Text type="secondary" className="shop-listing__hint">
            第 1 张是主图（店铺列表卡片与详情页默认大图），淘宝/拼多多均可传 5 张
          </Text>
          {coverMeta ? (
            <Text type="secondary" className="shop-listing__hint">
              {coverMeta.width}×{coverMeta.height}
              {coverMeta.bytes != null ? ` · ${formatBytes(coverMeta.bytes)}` : ''}
              {coverMeta.whiteRatio != null
                ? ` · 白底 ${(coverMeta.whiteRatio * 100).toFixed(0)}%`
                : ''}
              {coverMeta.subjectCoverage != null
                ? ` · 主体 ${(coverMeta.subjectCoverage * 100).toFixed(0)}%`
                : ''}
            </Text>
          ) : null}
        </div>

        {onlyCover ? null : (
        <div className="shop-listing__colors">
          {/* D-513：「每个颜色一张图」的说明已上提到分区副标题，此处不再重复 */}
          {colors.length === 0 ? (
            <Text type="secondary">该款式还没有 SKU（颜色），请先在「款式资料」维护颜色尺码</Text>
          ) : (
            <div className="shop-listing__color-list">
              {colors.map((color) => (
                <div key={color} className="shop-listing__color-row">
                  <ImageUploadBox
                    value={colorImages[color] ?? null}
                    onChange={(v) =>
                      setColorImages({ ...colorImages, [color]: v ?? '' })
                    }
                    width={72}
                    height={72}
                    label={color}
                  />
                  <div className="shop-listing__color-meta">
                    <Tag color="default">{color}</Tag>
                    <Space size={4}>
                      <Button
                        type="link"
                        size="small"
                        disabled={!colorImages[color]}
                        onClick={() => pickAsCover(color)}
                      >
                        设为主图
                      </Button>
                      {colorImages[color] ? (
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={() => setColorImages({ ...colorImages, [color]: '' })}
                        >
                          清除
                        </Button>
                      ) : null}
                    </Space>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {!cover ? (
        <Alert
          type="warning"
          showIcon
          className="shop-listing__alert"
          title="还没设置主图"
          description="主图为空时，店铺列表会显示「暂无图片」占位。可上传，或先给某个颜色配图后点「设为主图」。"
        />
      ) : coverBad && blockers.length === 0 ? (
        /* D-778：新的规范体检已能识别占位图，这里避免同一个问题弹两条一模一样的提示 */
        <Alert
          type="warning"
          showIcon
          className="shop-listing__alert"
          title="当前主图是一张占位图（尺寸过小）"
          description="这类图被拉伸后店铺里会变成一整块纯色，看起来像页面坏了。请重新上传一张真实商品图。"
        />
      ) : null}

      {/* D-778-b：合规只做提示，不限制上传。
       *  此前把「短边低于平台底线」做成红色「影响上架/展示」的阻断式提示，
       *  运营看到的是"系统不让传"，而不是"这样传平台可能不给推荐"。
       *  本店自己展示会裁切/留白，但绝不会因此拦住上传 —— 提示与限制必须分开。*/}
      {/* D-800：建议项收进折叠。
          原来「3 条机器建议 + 6 条人工确认」直接平铺，实测占掉半屏，
          把图片框挤到首屏之外。改为一行摘要 + 点击展开 ——
          「提示」不该在「做事」的主视觉位置长期占位。 */}
      {blockers.length > 0 || warnings.length > 0 || cover ? (
        <details className="shop-listing__alert" style={{ cursor: 'pointer' }}>
          <summary style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            主图合规提示
            {blockers.length + warnings.length > 0
              ? `（${blockers.length + warnings.length} 项建议，不影响上传）`
              : '（含平台无法自动判定的项）'}
            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>▾</span>
          </summary>
          <div style={{ marginTop: 6 }}>
            {[...blockers, ...warnings].length > 0 && (
              <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12 }}>
                {[...blockers, ...warnings].map((b, i) => (
                  <li key={`a-${i}`}>
                    <b>{b.message}</b>；{b.action}
                  </li>
                ))}
              </ul>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              以下平台要求机器无法判定，请人工确认：
            </Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: '#8c8c8c' }}>
              {manualCoverChecks().map((c, i) => (
                <li key={`m-${i}`}>{c}</li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {analyzing ? (
        <div className="shop-listing__analyzing">
          <LoadingOutlined />
          正在检测主图规范…
        </div>
      ) : null}

    </div>
  );
};

export default CoverColorImagesSection;