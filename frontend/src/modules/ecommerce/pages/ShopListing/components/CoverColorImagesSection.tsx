import React, { useEffect, useState } from 'react';
import { Alert, Button, Space, Tag, Typography } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
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
  colorImages: Record<string, string>;
  setColorImages: (v: Record<string, string>) => void;
  /** 该款式实际存在的颜色（来自 SKU 列表） */
  colors: string[];
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
  cover, setCover, colorImages, setColorImages, colors,
}) => {
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
          <ImageUploadBox
            value={cover}
            onChange={(v) => { setCover(v); setCoverBad(false); }}
            width={132}
            height={132}
            label="主图"
          />
          <Text type="secondary" className="shop-listing__hint">
            主图：店铺列表卡片与详情页默认大图
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
      </div>

      {!cover ? (
        <Alert
          type="warning"
          showIcon
          className="shop-listing__alert"
          message="还没设置主图"
          description="主图为空时，店铺列表会显示「暂无图片」占位。可上传，或先给某个颜色配图后点「设为主图」。"
        />
      ) : coverBad && blockers.length === 0 ? (
        /* D-778：新的规范体检已能识别占位图，这里避免同一个问题弹两条一模一样的提示 */
        <Alert
          type="warning"
          showIcon
          className="shop-listing__alert"
          message="当前主图是一张占位图（尺寸过小）"
          description="这类图被拉伸后店铺里会变成一整块纯色，看起来像页面坏了。请重新上传一张真实商品图。"
        />
      ) : null}

      {/* D-778：主图规范体检。阻断项与建议项分开说，因为处理方式不同 */}
      {blockers.length > 0 ? (
        <Alert
          type="error"
          showIcon
          className="shop-listing__alert"
          message={`主图不合规（${blockers.length} 项会影响上架/展示）`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {blockers.map((b, i) => (
                <li key={`b-${i}`}>
                  <b>{b.message}</b>；{b.action}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      {analyzing ? (
        <Alert
          type="info"
          showIcon
          className="shop-listing__alert"
          message="正在检测主图规范…"
        />
      ) : null}

      {!analyzing && warnings.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className="shop-listing__alert"
          message={`主图可上架，但有 ${warnings.length} 项会影响点击率`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w, i) => (
                <li key={`w-${i}`}>
                  <b>{w.message}</b>；{w.action}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      {!analyzing && cover && blockers.length === 0 && warnings.length === 0 && coverMeta ? (
        <Alert
          type="success"
          showIcon
          className="shop-listing__alert"
          message="主图符合平台规范"
          description={`${coverMeta.width}×${coverMeta.height}、1:1、体积与格式均达标。`}
        />
      ) : null}

      {/* 机器判不了、但平台明确禁止的项——必须显式告知，不能默默通过 */}
      {cover ? (
        <div className="shop-listing__alert">
          <Text type="secondary" style={{ fontSize: 12 }}>
            以下平台要求机器无法判定，请人工确认：
          </Text>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: '#8c8c8c' }}>
            {manualCoverChecks().map((c, i) => (
              <li key={`m-${i}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default CoverColorImagesSection;