import { StarFilled, DeleteOutlined } from '@ant-design/icons';
import { Image, Tooltip } from 'antd';
import type { DisplayImage } from './types';

export interface ThumbnailListProps {
  images: DisplayImage[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  hoverIndex: number | null;
  setHoverIndex: (index: number) => void;
  handleSetCover: (index: number) => void;
  handleDelete: (attachmentId: string | number, localIndex?: number) => void;
  enabled?: boolean;
  isNewMode?: boolean;
}

/**
 * 紧凑横排缩略图（40px 方块）
 * - 点击仅切换主图，不直接打开大图预览（预览入口唯一：主图点击）
 * - 不再显示资产类型徽标（避免"主图主图"重复，徽标只在主图上显示一次）
 * - 悬停显示：设为主图 / 删除
 */
const ThumbnailList: React.FC<ThumbnailListProps> = ({
  images,
  currentIndex,
  setCurrentIndex,
  hoverIndex,
  setHoverIndex,
  handleSetCover,
  handleDelete,
  enabled = true,
  isNewMode = false,
}) => {
  if (images.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        minWidth: 0,
        flex: 1,
      }}
    >
      {images.map((img, index) => {
        const isCurrent = index === currentIndex;
        return (
          <div
            key={img.id ?? img.fileUrl ?? index}
            style={{ position: 'relative', width: 40, height: 40 }}
            onMouseEnter={() => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(-1)}
          >
            <Image
              loading="lazy"
              src={img.fileUrl}
              alt={`缩略图${index + 1}`}
              width={40}
              height={40}
              preview={false}
              onClick={() => setCurrentIndex(index)}
              style={{
                objectFit: 'cover',
                borderRadius: 6,
                cursor: 'pointer',
                padding: 0,
                border: isCurrent ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                opacity: isCurrent ? 1 : 0.75,
              }}
            />
            {hoverIndex === index && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Tooltip title="设为主图">
                  <StarFilled
                    style={{ color: '#faad14', fontSize: 14, cursor: enabled ? 'pointer' : 'not-allowed' }}
                    onClick={() => enabled && handleSetCover(index)}
                  />
                </Tooltip>
                <Tooltip title={isNewMode ? '移除' : '删除'}>
                  <DeleteOutlined
                    style={{ color: '#ff7875', fontSize: 14, cursor: 'pointer' }}
                    onClick={() => handleDelete(img.id ?? '', index)}
                  />
                </Tooltip>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ThumbnailList;
