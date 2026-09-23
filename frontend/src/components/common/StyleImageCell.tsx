/**
 * StyleImageCell — 通用款式图单元格组件
 *
 * 用于电商/仓库各表格的「款式图」列。
 *
 * 查图顺序（**不做任何字符串切分猜款号**，真实 SKU 编码没有分隔符）：
 *   1. `styleNo` 命中 `imageMap[styleNo]`（款级封面）
 *   2. `skuCode` 命中 `imageMap[skuCode]`（SKU 颜色图，更精确）
 * 两处都没有 → 显示占位灰块。
 *
 * 用法：
 *   <StyleImageCell skuCode={r.skuCode} imageMap={imageMap} />
 *   <StyleImageCell styleNo={r.styleNo} imageMap={imageMap} />
 */
import React from 'react';
import { Image } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { StyleImageMap } from '@/hooks/useStyleCoverImages';

export interface StyleImageCellProps {
  /** 款号（有则优先按款号查图） */
  styleNo?: string | null;
  /** 商品编码（按 skuCode 查颜色图；与 styleNo 二选一或同时给） */
  skuCode?: string | null;
  /** 款号 / skuCode → 图片 URL 映射 */
  imageMap: StyleImageMap;
  /** 图片尺寸，默认 44 */
  size?: number;
  /** 是否禁用预览，默认 false */
  preview?: boolean;
}

const StyleImageCell: React.FC<StyleImageCellProps> = ({
  styleNo,
  skuCode,
  imageMap,
  size = 44,
  preview = true,
}) => {
  const key1 = (styleNo || '').trim();
  const key2 = (skuCode || '').trim();
  const imgUrl = (key1 ? imageMap[key1] : undefined) ?? (key2 ? imageMap[key2] : undefined);

  if (imgUrl) {
    return (
      <Image
        src={getFullAuthedFileUrl(imgUrl)}
        width={size}
        height={size}
        style={{ objectFit: 'cover', borderRadius: 4 }}
        preview={preview ? { cover: <EyeOutlined style={{ fontSize: 13 }} /> } : false}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: 'var(--color-bg-subtle)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        color: 'var(--color-text-quaternary)',
      }}
    />
  );
};

export default StyleImageCell;
