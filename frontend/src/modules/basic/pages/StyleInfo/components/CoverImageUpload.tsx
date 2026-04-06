import React, { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import { DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { setStyleCoverOverride } from '@/components/StyleAssets';

interface CoverImageUploadProps {
  styleId?: string | number;
  enabled: boolean;
  isNewMode?: boolean;  // 新建模式
  pendingFiles?: File[];  // 待上传的文件列表
  onPendingFilesChange?: (files: File[]) => void;  // 更新待上传文件
  coverUrl?: string | null;  // 兜底封面URL（选品中心下板时写入cover字段，无附件时展示）
  refreshTrigger?: number;
  onCoverChange?: (url: string | null) => void;
}

/**
 * 封面图片上传组件
 * 支持新建时本地预览和编辑时直接上传
 */
const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  styleId,
  enabled,
  isNewMode = false,
  pendingFiles = [],
  onPendingFilesChange,
  coverUrl,
  refreshTrigger = 0,
  onCoverChange,
}) => {
  const { message } = App.useApp();
  const [images, setImages] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // 本地预览图片URL列表
  const [localPreviewUrls, setLocalPreviewUrls] = useState<string[]>([]);

  // 生成本地预览URL
  useEffect(() => {
    if (isNewMode && pendingFiles.length > 0) {
      const urls = pendingFiles.map(file => URL.createObjectURL(file));
      setLocalPreviewUrls(urls);
      // 清理旧的URL
      return () => {
        urls.forEach(url => URL.revokeObjectURL(url));
      };
    } else {
      setLocalPreviewUrls([]);
    }
  }, [isNewMode, pendingFiles]);

  const fetchImages = useCallback(async () => {
    if (!styleId) return;
    try {
      const res = await api.get<{ code: number; data: any[] }>(`/style/attachment/list?styleId=${styleId}`);
      if (res.code === 200) {
        const imgs = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
        const sorted = coverUrl
          ? [...imgs].sort((a, b) => {
              const aCover = String(a?.fileUrl || '') === String(coverUrl || '');
              const bCover = String(b?.fileUrl || '') === String(coverUrl || '');
              if (aCover === bCover) return 0;
              return aCover ? -1 : 1;
            })
          : imgs;
        setImages(sorted);
        if (sorted.length > 0) {
          const coverIndex = coverUrl ? sorted.findIndex((item: any) => String(item?.fileUrl || '') === String(coverUrl || '')) : -1;
          if (coverIndex >= 0) setCurrentIndex(coverIndex);
          else if (currentIndex >= sorted.length) setCurrentIndex(0);
        }
      }
    } catch {
      // 忽略错误
      setImages([]);
    }
  }, [styleId, currentIndex]);

  useEffect(() => {
    if (!isNewMode) {
      fetchImages();
    }
  }, [fetchImages, isNewMode, refreshTrigger]);



  // 删除本地预览图片
  const handleRemoveLocalFile = (index: number) => {
    const newFiles = pendingFiles.filter((_, i) => i !== index);
    onPendingFilesChange?.(newFiles);
    if (currentIndex >= newFiles.length && newFiles.length > 0) {
      setCurrentIndex(newFiles.length - 1);
    } else if (newFiles.length === 0) {
      setCurrentIndex(0);
    }
  };

  const handleDelete = async (attachmentId: string | number, localIndex?: number) => {
    // 新建模式下删除本地文件
    if (isNewMode && localIndex !== undefined) {
      handleRemoveLocalFile(localIndex);
      return;
    }
    if (!enabled) return;
    try {
      const res = await api.delete(`/style/attachment/${attachmentId}`);
      if ((res as any).code === 200 && (res as any).data === true) {
        message.success('删除成功');
        const deletedUrl = String((displayImages.find((item) => String(item?.id) === String(attachmentId)) as any)?.fileUrl || '');
        if (deletedUrl === String(coverUrl || '')) {
          const nextCover = (displayImages.find((item) => String(item?.id) !== String(attachmentId) && !(item as any)?.isCoverFallback) as any)?.fileUrl || null;
          onCoverChange?.(nextCover);
          setStyleCoverOverride(styleId, undefined, nextCover);
        }
        fetchImages();
      } else {
        message.error((res as any).message || '删除失败');
      }
    } catch (error: any) {
      message.error((error as any)?.message || '删除失败');
    }
  };

  const handleSetCover = async (index: number) => {
    const img = displayImages[index];
    if (!img) return;
    if (isNewMode) {
      // 新建模式：仅本地切换预览，无需 API
      setCurrentIndex(index);
      return;
    }
    // 兜底封面（选品中心 Google 图）不是真实附件，无法设为封面
    if ((img as any).isCoverFallback) {
      message.warning('请先上传图片，再设置主图');
      return;
    }
    try {
      const res = await api.post(`/style/attachment/${img.id}/set-cover`);
      if ((res as any)?.code === 200 || res === true || (res as any)?.data === true) {
        setCurrentIndex(index);
        onCoverChange?.(String(img.fileUrl || ''));
        setStyleCoverOverride(styleId, undefined, String(img.fileUrl || ''));
        message.success('已设置为主图');
      } else {
        message.error((res as any)?.message || '设置主图失败');
      }
    } catch {
      message.error('设置主图失败，请重试');
    }
  };

  const resolveAssetMeta = (img: any, index: number) => {
    if (!img) return { label: '', color: '#94a3b8' };
    if (String(img.fileUrl || '') === String(coverUrl || '')) {
      return { label: '主图', color: 'var(--color-warning)' };
    }
    if ((img as any).isCoverFallback) {
      return { label: '参考图', color: '#64748b' };
    }
    if (String(img.bizType || '').startsWith('color_image::')) {
      return { label: '颜色图', color: '#2563eb' };
    }
    if (isNewMode && index === currentIndex) {
      return { label: '主图', color: 'var(--color-warning)' };
    }
    return { label: '参考图', color: '#64748b' };
  };

  // 新建模式使用本地预览，否则使用服务器图片
  // 服务器无附件时：若有 coverUrl（来自选品中心下板），合成一条虚拟条目作为细节图1兜底显示
  const displayImages = isNewMode
    ? localPreviewUrls.map((url, i) => ({ fileUrl: url, id: `local-${i}`, isLocal: true, localIndex: i }))
    : images.length > 0
      ? images
      : (coverUrl ? [{ fileUrl: coverUrl, id: 'cover-fallback', isCoverFallback: true as const }] : []);
  const currentImage = displayImages[currentIndex];
  const currentAssetMeta = resolveAssetMeta(currentImage, currentIndex);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>图片资产</div>
      {/* 大图（缩小版预览） */}
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          aspectRatio: '1 / 1',
          border: '1px dashed #d9d9d9',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 12,
          overflow: 'hidden',
          background: '#fafafa',
          cursor: 'default',
        }}
      >
        {currentImage ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img src={getFullAuthedFileUrl(currentImage.fileUrl)} alt="main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', left: 10, top: 10, padding: '3px 8px', borderRadius: 999, background: currentAssetMeta.color, color: '#fff', fontSize: 12, fontWeight: 600 }}>
              {currentAssetMeta.label}
            </div>
          </div>
        ) : coverUrl ? (
          // 无上传附件但有选品中心下板时的参考图（cover字段）
          <img src={getFullAuthedFileUrl(coverUrl)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            {isNewMode ? (
              <span style={{ color: 'var(--neutral-text-disabled)' }}>请在下方颜色/尺码表上传图片</span>
            ) : !styleId ? (
              <>
                <div style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-base)", marginBottom: 4 }}>上传设计稿或款式照片</div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>请先填写上方基础信息并点击"保存基础信息"</div>
              </>
            ) : enabled ? (
              <span style={{ color: 'var(--neutral-text-disabled)' }}>上传设计稿或款式照片</span>
            ) : (
              <>
                <div style={{ color: 'var(--color-danger)', fontSize: "var(--font-size-base)", marginBottom: 4 }}>样衣已完成</div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>请联系管理员退回后修改</div>
              </>
            )}
          </div>
        )}
      </div>

      {displayImages.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, width: '100%', maxWidth: 400, marginBottom: 10 }}>
          {displayImages.map((img, idx) => {
            const hover = hoverIndex === idx;
            const canOperate = isNewMode || enabled;
            const isCoverFallback = !!(img as any)?.isCoverFallback;
            const assetMeta = resolveAssetMeta(img, idx);
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  border: currentIndex === idx ? '2px solid var(--color-warning)' : '1px solid #d9d9d9',
                  borderRadius: 6,
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: (isNewMode || enabled) ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f0f0f0',
                }}
              >
                <img
                  src={getFullAuthedFileUrl(img.fileUrl)}
                  alt={`thumb-${idx}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onClick={() => setCurrentIndex(idx)}
                />
                {/* Hover显示操作按钮（兜底参考图不可编辑） */}
                {hover && canOperate && !isCoverFallback && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: 6,
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetCover(idx);
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: currentIndex === idx ? 'var(--color-warning)' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      title="设置为主图"
                    >
                      {currentIndex === idx ? (
                        <StarFilled style={{ color: 'var(--neutral-white)', fontSize: 12 }} />
                      ) : (
                        <StarOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
                      )}
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(img.id, img.localIndex);
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'var(--color-bg-base)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      title="删除图片"
                    >
                      <DeleteOutlined style={{ color: 'var(--color-danger)', fontSize: 12 }} />
                    </div>
                  </div>
                )}
                {/* 主图/参考图标记 */}
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: assetMeta.color,
                    color: 'var(--neutral-white)',
                    fontSize: 9,
                    padding: '1px 4px',
                    borderRadius: 2,
                  }}
                >
                  {assetMeta.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {displayImages.length > 0 && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>
          共 {displayImages.length} 张{isNewMode ? '（保存时上传）' : ''} · 在下方颜色/尺码表可上传图片
        </div>
      )}
    </div>
  );
};

export default CoverImageUpload;
