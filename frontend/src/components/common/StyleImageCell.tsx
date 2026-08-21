/**
 * StyleImageCell — 通用款号封面图单元格组件
 *
 * 用于电商各表格的"款式图"列，根据 styleNo 从 imageMap 查找封面图并展示。
 * 无图时显示占位灰块。支持点击预览大图。
 *
 * 用法：
 *   <StyleImageCell styleNo={styleNo} imageMap={imageMap} />
 *   <StyleImageCell skuCode={skuCode} imageMap={imageMap} />
 */
import React, { useMemo } from 'react';
import { Image } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { extractStyleNoFromSkuCode, type StyleImageMap } from '@/hooks/useStyleCoverImages';

export interface StyleImageCellProps {
  /** 款号（优先使用） */
  styleNo?: string;
  /** 商品编码（如果没传 styleNo，则从 skuCode 拆分） */
  skuCode?: string;
  /** 款号 → cover URL 映射 */
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
  const resolvedStyleNo = useMemo(() => {
    const sn = (styleNo || '').trim();
    if (sn) return sn;
    return extractStyleNoFromSkuCode(skuCode);
  }, [styleNo, skuCode]);

  const imgUrl = resolvedStyleNo ? imageMap[resolvedStyleNo] : undefined;

  if (imgUrl) {
    return (
      <Image
        src={getFullAuthedFileUrl(imgUrl)}
        width={size}
        height={size}
        style={{ objectFit: 'contain', borderRadius: 4 }}
        preview={preview ? { cover: <EyeOutlined style={{ fontSize: 12 }} /> } : false}
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
