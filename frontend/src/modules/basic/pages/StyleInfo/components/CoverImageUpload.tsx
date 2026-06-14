import React, { useCallback, useEffect, useState } from 'react';
import { App, Modal, Image } from 'antd';
import { DeleteOutlined, StarFilled, StarOutlined, LeftOutlined, RightOutlined, SearchOutlined, BulbOutlined } from '@ant-design/icons';
import api, { type ApiResult, isApiSuccess, getApiMessage } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { setStyleCoverOverride } from '@/components/StyleAssets';
import { styleSearchByImage, styleParseFromImage, type StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';

interface CoverImageUploadProps {
  styleId?: string | number;
  enabled: boolean;
  isNewMode?: boolean;  // 新建模式
  pendingFiles?: File[];  // 待上传的文件列表
  onPendingFilesChange?: (files: File[]) => void;  // 更新待上传文件
  coverUrl?: string | null;  // 兜底封面URL（选品中心下板时写入cover字段，无附件时展示）
  refreshTrigger?: number;
  onCoverChange?: (url: string | null) => void;
  onStyleParseResult?: (result: StyleFieldParseResult) => void;  // 智能识别结果
  onAutoParseStart?: () => void;           // 自动识别开始回调
  onAutoParseResult?: (result: StyleFieldParseResult) => void; // 自动识别结果回传
  autoParseEnabled?: boolean;               // 是否启用自动识别（默认 true）
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
  onStyleParseResult,
  onAutoParseStart,
  onAutoParseResult,
  autoParseEnabled = true,
}) => {
  const { message } = App.useApp();
  const [images, setImages] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [previewHovered, setPreviewHovered] = useState(false);
  // 本地预览图片URL列表
  const [localPreviewUrls, setLocalPreviewUrls] = useState<string[]>([]);
  // 以图搜款
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);
  // 智能识别
  const [parsing, setParsing] = useState(false);
  const [autoParseAttempted, setAutoParseAttempted] = useState(false);
  const [autoParseError, setAutoParseError] = useState<string | null>(null);
  // 新建模式下最近一次成功识别的置信度，用于状态展示
  const [parseSuccessConfidence, setParseSuccessConfidence] = useState<number | null>(null);

  // 新建模式使用本地预览，否则使用服务器图片
  // 服务器无附件时：若有 coverUrl（来自选品中心下板），合成一条虚拟条目作为细节图1兜底展示
  const displayImages = isNewMode
    ? localPreviewUrls.map((url, i) => ({ fileUrl: url, id: `local-${i}`, isLocal: true, localIndex: i }))
    : images.length > 0
      ? images
      : (coverUrl ? [{ fileUrl: coverUrl, id: 'cover-fallback', isCoverFallback: true as const }] : []);
  const currentImage = displayImages[currentIndex];

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, currentIndex]);

  useEffect(() => {
    if (!isNewMode) {
      fetchImages();
    }
  }, [fetchImages, isNewMode, refreshTrigger]);

  // 统一的识别流程：根据当前图片和模式，自动上传（如需要）并调用 styleParseFromImage
  const runStyleParseFromCurrentImage = useCallback(async (): Promise<StyleFieldParseResult | null> => {
    const current = displayImages[currentIndex];
    if (!current) return null;

    let imgUrl = '';

    // 新建模式：本地图片需要先上传获取服务器URL
    if (isNewMode && current.isLocal && pendingFiles[current.localIndex]) {
      try {
        const file = pendingFiles[current.localIndex];
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 } as any);
        if (isApiSuccess(uploadRes) && uploadRes?.data?.fileUrl) {
          imgUrl = getFullAuthedFileUrl(uploadRes.data.fileUrl);
        } else {
          return null;
        }
      } catch {
        return null;
      }
    } else {
      // 编辑模式：直接使用服务器图片URL
      const fullUrl = getFullAuthedFileUrl(current.fileUrl);
      if (!fullUrl || fullUrl.startsWith('blob:') || fullUrl.startsWith('data:')) {
        return null;
      }
      imgUrl = fullUrl;
    }

    if (!imgUrl) return null;

    try {
      const res = await styleParseFromImage(imgUrl);
      return res;
    } catch {
      return null;
    }
  }, [displayImages, currentIndex, isNewMode, pendingFiles]);

  // 编辑模式下首次加载时自动触发一次识别（保持原有行为）
  useEffect(() => {
    if (isNewMode) return;
    if (!styleId) return;
    if (!enabled) return;
    if (!onStyleParseResult) return;
    if (!autoParseEnabled) return;
    if (autoParseAttempted) return;
    const currentFileUrl = currentImage?.fileUrl;
    if (!currentFileUrl) return;
    if (currentFileUrl.startsWith('blob:') || currentFileUrl.startsWith('data:')) return;

    const imgUrl = getFullAuthedFileUrl(currentFileUrl);
    if (!imgUrl || imgUrl.startsWith('blob:') || imgUrl.startsWith('data:')) return;

    setAutoParseAttempted(true);
    onAutoParseStart?.();
    setParsing(true);
    setAutoParseError(null);
    (async () => {
      try {
        const res = await styleParseFromImage(imgUrl);
        if (res?.available) {
          onStyleParseResult?.(res);
          onAutoParseResult?.(res);
          setParseSuccessConfidence(res.overallConfidence ?? null);
        } else {
          setAutoParseError(res?.errorMessage || '识别失败，请人工填写');
        }
      } catch {
        setAutoParseError('智能识别服务暂不可用');
      } finally {
        setParsing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, enabled, isNewMode, currentImage, autoParseAttempted, autoParseEnabled, onStyleParseResult]);

  // 新建模式下：本地图片加载完成后，自动触发识别（一次）
  useEffect(() => {
    if (!isNewMode) return;
    if (!onStyleParseResult) return;
    if (!autoParseEnabled) return;
    if (autoParseAttempted) return;
    if (parsing) return;
    const current = displayImages[currentIndex];
    if (!current) return;

    setAutoParseAttempted(true);
    onAutoParseStart?.();
    setParsing(true);
    setAutoParseError(null);
    setParseSuccessConfidence(null);
    (async () => {
      const res = await runStyleParseFromCurrentImage();
      if (res?.available) {
        onStyleParseResult?.(res);
        onAutoParseResult?.(res);
        setParseSuccessConfidence(res.overallConfidence ?? null);
      } else {
        setAutoParseError(res?.errorMessage || '识别失败，可手动填写');
      }
      setParsing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewMode, currentImage?.fileUrl, displayImages.length, currentIndex]);

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
      const res = await api.delete<ApiResult<boolean>>(`/style/attachment/${attachmentId}`);
      if (isApiSuccess(res) && res?.data === true) {
        message.success('删除成功');
        const deletedUrl = String((displayImages.find((item) => String(item?.id) === String(attachmentId)) as any)?.fileUrl || '');
        if (deletedUrl === String(coverUrl || '')) {
          const nextCover = (displayImages.find((item) => String(item?.id) !== String(attachmentId) && !(item as any)?.isCoverFallback) as any)?.fileUrl || null;
          onCoverChange?.(nextCover);
          setStyleCoverOverride(styleId, undefined, nextCover);
        }
        fetchImages();
      } else {
        message.error(getApiMessage(res, '删除失败'));
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '删除失败');
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
      const res = await api.post<ApiResult<boolean>>(`/style/attachment/${img.id}/set-cover`);
      if (isApiSuccess(res)) {
        setCurrentIndex(index);
        onCoverChange?.(String(img.fileUrl || ''));
        setStyleCoverOverride(styleId, undefined, String(img.fileUrl || ''));
        message.success('已设置为主图');
      } else {
        message.error(getApiMessage(res, '设置主图失败'));
      }
    } catch {
      message.error('设置主图失败，请重试');
    }
  };

  const resolveAssetMeta = (img: any, index: number) => {
    if (!img) return { label: '', color: 'var(--color-text-tertiary)' };
    if (String(img.fileUrl || '') === String(coverUrl || '')) {
      return { label: '主图', color: 'var(--color-warning)' };
    }
    if ((img as any).isCoverFallback) {
      return { label: '参考图', color: 'var(--color-text-tertiary)' };
    }
    if (String(img.bizType || '').startsWith('color_image::')) {
      return { label: '颜色图', color: '#2563eb' };
    }
    if (isNewMode && index === currentIndex) {
      return { label: '主图', color: 'var(--color-warning)' };
    }
    return { label: '参考图', color: 'var(--color-text-tertiary)' };
  };

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
          border: '1px dashed var(--color-border-antd)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 12,
          overflow: 'hidden',
          background: 'var(--color-bg-container)',
          cursor: 'default',
          position: 'relative',
        }}
        onMouseEnter={() => displayImages.length > 1 && setPreviewHovered(true)}
        onMouseLeave={() => setPreviewHovered(false)}
      >
        {currentImage ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Image loading="lazy" src={getFullAuthedFileUrl(currentImage.fileUrl)} alt="main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', left: 10, top: 10, padding: '3px 8px', borderRadius: 999, background: currentAssetMeta.color, color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {currentAssetMeta.label}
            </div>
            {currentImage && (
              <>
                <div
                  style={{
                    position: 'absolute', right: 10, top: 10,
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
                  }}
                >
                  {parsing && (
                    <div
                      style={{
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(234,88,12,0.95)', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <BulbOutlined style={{ fontSize: 11 }} />
                      正在智能识别...
                    </div>
                  )}
                  {!parsing && parseSuccessConfidence !== null && (
                    <div
                      style={{
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(34,197,94,0.95)', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      ✅ 已识别：置信度 {parseSuccessConfidence}%
                    </div>
                  )}
                  {!parsing && parseSuccessConfidence === null && autoParseError && (
                    <div
                      style={{
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(245,158,11,0.95)', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      ⚠️ 识别失败，可手动填写
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div
                      onClick={async () => {
                        if (parsing || searching) return;
                        setParsing(true);
                        setAutoParseError(null);
                        setParseSuccessConfidence(null);
                        try {
                          const res = await runStyleParseFromCurrentImage();
                          if (res?.available) {
                            message.success(`识别完成（置信度 ${res.overallConfidence}%）`);
                            onStyleParseResult?.(res);
                            onAutoParseResult?.(res);
                            setParseSuccessConfidence(res.overallConfidence ?? null);
                          } else {
                            message.warning(res?.errorMessage || '识别失败，请人工填写');
                            setAutoParseError(res?.errorMessage || '识别失败');
                          }
                        } catch {
                          message.warning('智能识别服务暂不可用');
                          setAutoParseError('智能识别服务暂不可用');
                        } finally {
                          setParsing(false);
                        }
                      }}
                      style={{
                        padding: '3px 8px', borderRadius: 999,
                        background: parsing ? 'rgba(0,0,0,0.3)' : 'rgba(234,88,12,0.85)', color: '#fff',
                        fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'background 0.15s',
                      }}
                      title="智能识别图片中的款式特征并自动填充表单"
                    >
                      <BulbOutlined style={{ fontSize: 11 }} />
                      {parsing ? '识别中...' : '智能识别'}
                    </div>
                    <div
                      onClick={async () => {
                        if (searching) return;
                        let imgUrl = '';

                        // 新建模式：本地图片需要先上传获取服务器URL
                        if (currentImage.isLocal && isNewMode && pendingFiles[currentImage.localIndex]) {
                          setSearching(true);
                          try {
                            const file = pendingFiles[currentImage.localIndex];
                            const formData = new FormData();
                            formData.append('file', file);
                            const uploadRes = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 } as any);
                            if (isApiSuccess(uploadRes) && uploadRes?.data?.fileUrl) {
                              imgUrl = getFullAuthedFileUrl(uploadRes.data.fileUrl);
                            } else {
                              message.error('图片上传失败，无法进行以图搜款');
                              return;
                            }
                          } catch {
                            message.error('图片上传失败，无法进行以图搜款');
                            return;
                          }
                        } else {
                          // 编辑模式：直接使用服务器图片URL
                          const fullUrl = getFullAuthedFileUrl(currentImage.fileUrl);
                          if (!fullUrl || fullUrl.startsWith('blob:') || fullUrl.startsWith('data:')) {
                            message.warning('当前图片不支持以图搜款（需要公网可访问的图片）');
                            return;
                          }
                          imgUrl = fullUrl;
                        }

                        if (!imgUrl) {
                          message.warning('无法获取图片URL，无法进行以图搜款');
                          return;
                        }

                        setSearching(true);
                        try {
                          const res = await styleSearchByImage(imgUrl);
                          if (res.success && res.matchCount > 0) {
                            setSearchResult(res);
                            setSearchExpanded(true);
                          } else {
                            message.info(res.success ? '未找到视觉相似的历史款式' : (res.error || '以图搜款服务暂不可用'));
                          }
                        } catch {
                          message.warning('以图搜款服务暂不可用');
                        } finally {
                          setSearching(false);
                        }
                      }}
                      style={{
                        padding: '3px 8px', borderRadius: 999,
                        background: searching ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.45)', color: '#fff',
                        fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'background 0.15s',
                      }}
                      title="以图搜款：搜索视觉相似的历史款式"
                    >
                      <SearchOutlined style={{ fontSize: 11 }} />
                      {searching ? '搜索中...' : '搜相似'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : coverUrl ? (
          // 无上传附件但有选品中心下板时的参考图（cover字段）
          <Image loading="lazy" src={getFullAuthedFileUrl(coverUrl)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        {displayImages.length > 1 && previewHovered && (
          <>
            <div
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex <= 0 ? displayImages.length - 1 : currentIndex - 1); }}
              style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                width: 28, height: 48, background: 'rgba(0,0,0,0.35)',
                borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.35)'; }}
            >
              <LeftOutlined style={{ color: '#fff', fontSize: 12 }} />
            </div>
            <div
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex >= displayImages.length - 1 ? 0 : currentIndex + 1); }}
              style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                width: 28, height: 48, background: 'rgba(0,0,0,0.35)',
                borderRadius: '6px 0 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.35)'; }}
            >
              <RightOutlined style={{ color: '#fff', fontSize: 12 }} />
            </div>
          </>
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

      {/* 以图搜款结果：可折叠卡片 */}
      {searchResult && (
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            marginBottom: 10,
            border: '1px solid var(--color-border-antd)',
            borderRadius: 8,
            background: 'var(--color-bg-container)',
            overflow: 'hidden',
          }}
        >
          <div
            onClick={() => setSearchExpanded(!searchExpanded)}
            style={{
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SearchOutlined style={{ color: 'var(--primary-color)' }} />
              <span>相似款式推荐</span>
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 12 }}>
                （{searchResult.matchCount} 个）
              </span>
            </div>
            <RightOutlined
              style={{
                color: 'var(--color-text-tertiary)',
                fontSize: 10,
                transform: searchExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          </div>
          {searchExpanded && (
            <div
              style={{
                padding: '4px 12px 12px 12px',
                borderTop: '1px solid var(--color-border-antd)',
                background: 'var(--color-bg-base)',
              }}
            >
              {searchResult.matches?.map((m: any, i: number) => (
                <div key={i} style={{
                  padding: '8px 10px', marginBottom: 6, borderRadius: 6,
                  background: 'var(--color-bg-container)', border: '1px solid var(--color-border-antd)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>{m.styleNo || '[无款号]'}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      难度 {m.difficultyScore}/10（{m.difficultyLevel}）
                    </span>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    background: parseInt(m.similarity) >= 72 ? 'var(--color-success-bg, #f6ffed)' : 'var(--color-bg-container)',
                    color: parseInt(m.similarity) >= 72 ? 'var(--color-success, #52c41a)' : 'var(--color-text-secondary)',
                  }}>
                    {m.similarity}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--color-text-quaternary)', marginTop: 6 }}>
                相似度≥72%为高相似，可重点关注
              </div>
            </div>
          )}
        </div>
      )}

      {/* 自动识别错误提示（静默展示，不打断用户） */}
      {autoParseError && autoParseAttempted && !parsing && (
        <div style={{
          fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6, maxWidth: 400,
        }}>
          自动识别未成功：{autoParseError}（可手动点击"智能识别"重试）
        </div>
      )}
    </div>
  );
};

export default CoverImageUpload;
