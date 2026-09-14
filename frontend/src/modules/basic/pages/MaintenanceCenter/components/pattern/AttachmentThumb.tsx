import React from 'react';
import api from '@/utils/api';
import SmartImage from '@/components/common/SmartImage';

export const AttachmentThumb: React.FC<{ styleId?: string | number; cover?: string | null }> = ({ styleId, cover }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId) { setUrl(cover || null); return () => { mounted = false; }; }
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl((images[0] as any)?.fileUrl || cover || null);
          return;
        }
        if (mounted) setUrl(cover || null);
      } catch {
        if (mounted) setUrl(cover || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [styleId, cover]);

  return (
    <div className="u-ov-hidden u-d-flex u-ai-center u-jc-center" style={{ width: 56, height: 56, background: 'var(--color-bg-subtle)' }}>
      {loading ? (
        <span className="u-fs-var--font-size-sm" style={{ color: 'var(--neutral-text-secondary)' }}>...</span>
      ) : url ? (
        <SmartImage src={url || ''} alt="cover" className="u-w-full u-h-full u-objf-cover" preview={{ cover: <span>预览</span> }} />
      ) : (
        <span className="u-fs-var--font-size-sm" style={{ color: 'var(--neutral-text-disabled)' }}>无图</span>
      )}
    </div>
  );
};
