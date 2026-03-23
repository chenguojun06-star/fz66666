import React, { useEffect, useState } from 'react';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface AttachmentThumbProps {
  styleId: string | number;
  src?: string | null;
}

/**
 * 附件缩略图组件（公共组件）
 * 显示款式的第一张图片附件
 *
 * 使用位置：
 * - 款式管理列表
 * - 款式详情页
 */
const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ styleId, src }) => {
  const [url, setUrl] = useState<string | null>(src || null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setUrl(src || null);
  }, [src]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: any[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const firstImage = (images[0] as any)?.fileUrl || null;
          if (mounted && firstImage) setUrl(firstImage);
        }
      } catch {
        // 忽略错误
        if (mounted && !src) setUrl(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [styleId, src]);

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 4,
        overflow: 'hidden',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        e.stopPropagation();
        const validUrl = getFullAuthedFileUrl(url);
        if (validUrl) {
          window.open(validUrl, '_blank');
        }
      }}
    >
      {loading ? (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>...</span>
      ) : url ? (
        <img src={getFullAuthedFileUrl(url)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => setUrl(null)} />
      ) : (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
      )}
    </div>
  );
};

export default AttachmentThumb;
