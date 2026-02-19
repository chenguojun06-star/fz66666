import React, { useEffect, useState } from 'react';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface AttachmentThumbProps {
  styleId: string | number;
}

/**
 * 附件缩略图组件（公共组件）
 * 显示款式的第一张图片附件
 *
 * 使用位置：
 * - 款式管理列表
 * - 款式详情页
 */
const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ styleId }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: any[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl((images[0] as any)?.fileUrl || null);
        }
      } catch {
        // 忽略错误
        if (mounted) setUrl(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [styleId]);

  return (
    <div
      style={{
        width: 56,
        height: 56,
        overflow: 'hidden',
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={getFullAuthedFileUrl(url)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)' }}>无图</span>
      )}
    </div>
  );
};

export default AttachmentThumb;
