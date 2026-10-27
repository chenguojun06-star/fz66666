import React from 'react';
import { Image, Tooltip, Button } from 'antd';
import { PictureOutlined, SyncOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface SkuColorImageCellProps {
  imageUrl?: string | null;
  color?: string;
  /** 无图时是否提供「从开发样衣同步」入口 */
  canSync?: boolean;
  syncing?: boolean;
  onSync?: (color: string) => void;
}

/** SKU 行颜色图片单元格：有图展示缩略图，无图给「同步」入口（从开发样衣颜色图取，无需重复上传） */
const SkuColorImageCell: React.FC<SkuColorImageCellProps> = ({
  imageUrl, color, canSync, syncing, onSync,
}) => {
  if (imageUrl) {
    return (
      <Image
        src={getFullAuthedFileUrl(imageUrl)}
        alt="商品图片"
        width={32}
        height={32}
        style={{ objectFit: 'contain', borderRadius: 4, cursor: 'pointer', background: 'var(--color-bg-subtle)' }}
        preview={{ mask: <span className="u-fs-10">查看</span> }}
      />
    );
  }

  const colorKey = String(color || '').trim();
  const showSync = canSync && !!colorKey && !!onSync;

  return (
    <Tooltip title={showSync ? `从开发样衣同步「${colorKey}」颜色图片` : '该颜色暂无图片'}>
      <div style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-subtle)',
        borderRadius: 4, color: 'var(--color-text-quaternary)',
      }}>
        {showSync ? (
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined />}
            loading={syncing}
            onClick={(e) => { e.stopPropagation(); onSync?.(colorKey); }}
            style={{ width: 32, height: 32, padding: 0, color: 'var(--color-primary)' }}
          />
        ) : (
          <PictureOutlined style={{ fontSize: 15 }} />
        )}
      </div>
    </Tooltip>
  );
};

export default SkuColorImageCell;
