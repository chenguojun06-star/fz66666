import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import api, { type ApiResult, isApiSuccess, getApiMessage } from '@/utils/api';
import { getFullAuthedFileUrl, isSameFileUrl } from '@/utils/fileUrl';
import { isFailedParseText } from '../StyleBasicInfoForm/styleFeature';
import { setStyleCoverOverride } from '@/components/StyleAssets';
import { styleSearchByImage, styleParseFromImage, type StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';
import type { CoverImageUploadProps, DisplayImage } from './types';

/**
 * 封面图片上传组件业务逻辑 Hook
 * 从原 CoverImageUpload.tsx 抽离，所有 state / API 调用 / 事件处理逻辑保持原样
 */
export const useCoverImageUpload = (props: CoverImageUploadProps) => {
  const {
    styleId,
    styleNo,
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
  } = props;

  const { message, modal } = App.useApp();
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
  const [autoParseError, setAutoParseError] = useState<string | null>(null);
  // 新建模式下最近一次成功识别的置信度，用于状态展示
  const [parseSuccessConfidence, setParseSuccessConfidence] = useState<number | null>(null);

  // 新建模式使用本地预览，否则使用服务器图片
  // 服务器无附件时：若有 coverUrl（来自选品中心下板），合成一条虚拟条目作为细节图1兜底展示
  // 展示 URL 附 token：兼容 tenant-download 需认证的环境（避免 <img> 直连 401）
  const displayImages: DisplayImage[] = useMemo(() => isNewMode
    ? localPreviewUrls.map((url, i) => ({ fileUrl: url, id: `local-${i}`, isLocal: true, localIndex: i }))
    : images.length > 0
      ? images.map((img) => (img.fileUrl && !img.fileUrl.startsWith('blob:') ? { ...img, fileUrl: getFullAuthedFileUrl(img.fileUrl) } : img))
      : (coverUrl ? [{ fileUrl: getFullAuthedFileUrl(coverUrl), id: 'cover-fallback', isCoverFallback: true as const }] : []), [isNewMode, localPreviewUrls, images, coverUrl]);
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
    if (!styleId) return [];
    try {
      const res = await api.get<{ code: number; data: any[] }>(`/style/attachment/list?styleId=${styleId}`);
      if (res.code === 200) {
        // D-225：只显示款式图片，纸样/放码/色卡类附件归各自 tab（此前纸样图片混进主图区）
        const PATTERN_BIZ = ['pattern', 'pattern_final', 'pattern_grading', 'pattern_grading_final', 'colorway', 'size_table'];
        const imgs = (res.data || []).filter((f: any) =>
          String(f.fileType || '').includes('image')
          && !PATTERN_BIZ.includes(String(f.bizType || '').trim().toLowerCase())
          && !String(f.bizType || '').toLowerCase().startsWith('pattern'));
        const sorted = coverUrl
          ? [...imgs].sort((a, b) => {
              // 剥离 token 等查询参数再比：附件裸路径与历史存的带参 cover 也能对上
              const aCover = isSameFileUrl(a?.fileUrl, coverUrl);
              const bCover = isSameFileUrl(b?.fileUrl, coverUrl);
              if (aCover === bCover) return 0;
              return aCover ? -1 : 1;
            })
          : imgs;
        setImages(sorted);
        if (sorted.length > 0) {
          const coverIndex = coverUrl ? sorted.findIndex((item: any) => isSameFileUrl(item?.fileUrl, coverUrl)) : -1;
          if (coverIndex >= 0) setCurrentIndex(coverIndex);
          else if (currentIndex >= sorted.length) setCurrentIndex(0);
        }
        return sorted;
      }
    } catch {
      // 忽略错误
      setImages([]);
    }
    return [];
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
    const localIdx = current.localIndex;
    if (isNewMode && current.isLocal && localIdx !== undefined && pendingFiles[localIdx]) {
      try {
        const file = pendingFiles[localIdx];
        const formData = new FormData();
        formData.append('file', file);
        if (styleId) formData.append('styleId', String(styleId));
        if (styleNo) formData.append('styleNo', styleNo);
        const uploadRes = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 });
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
  }, [displayImages, currentIndex, isNewMode, pendingFiles, styleId, styleNo]);

  // 统一样式搜：根据当前图片，调用以图搜款
  const runStyleSearchByImage = useCallback(async () => {
    if (searching) return;
    const current = displayImages[currentIndex];
    if (!current) return;
    let imgUrl = '';
    const localIdx = current.localIndex;

    if (current.isLocal && isNewMode && localIdx !== undefined && pendingFiles[localIdx]) {
      setSearching(true);
      try {
        const file = pendingFiles[localIdx];
        const formData = new FormData();
        formData.append('file', file);
        if (styleId) formData.append('styleId', String(styleId));
        if (styleNo) formData.append('styleNo', styleNo);
        const uploadRes = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 });
        if (isApiSuccess(uploadRes) && uploadRes?.data?.fileUrl) {
          imgUrl = getFullAuthedFileUrl(uploadRes.data.fileUrl);
        } else {
          message.error('图片上传失败，无法进行以图搜款');
          setSearching(false);
          return;
        }
      } catch {
        message.error('图片上传失败，无法进行以图搜款');
        setSearching(false);
        return;
      }
    } else {
      const fullUrl = getFullAuthedFileUrl(current.fileUrl);
      if (!fullUrl || fullUrl.startsWith('blob:') || fullUrl.startsWith('data:')) {
        message.warning('当前图片不支持以图搜款');
        return;
      }
      imgUrl = fullUrl;
    }

    if (!imgUrl) {
      message.warning('无法获取图片URL');
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
  }, [displayImages, currentIndex, isNewMode, pendingFiles, searching, styleId, styleNo, message]);

  // 统一的识别触发：当前选中图的 URL 变化（首次加载/上传新图/切换主图）时各解析一次。
  // D-264：原实现用 autoParseAttempted 一次性开关——首次解析失败后上传的第二张图
  // 永远不会再触发识别，用户看来"要上传第二次才填充信息"。
  const lastParsedUrlRef = useRef<string>('');

  useEffect(() => {
    if (isNewMode) return;
    if (!styleId) return;
    if (!enabled) return;
    if (!onStyleParseResult) return;
    if (!autoParseEnabled) return;
    if (parsing) return;
    const currentFileUrl = currentImage?.fileUrl;
    if (!currentFileUrl) return;
    if (currentFileUrl.startsWith('blob:') || currentFileUrl.startsWith('data:')) return;

    const imgUrl = getFullAuthedFileUrl(currentFileUrl);
    if (!imgUrl || imgUrl.startsWith('blob:') || imgUrl.startsWith('data:')) return;
    if (lastParsedUrlRef.current === imgUrl) return;
    lastParsedUrlRef.current = imgUrl;

    onAutoParseStart?.();
    setParsing(true);
    setAutoParseError(null);
    (async () => {
      try {
        const res = await styleParseFromImage(imgUrl);
        // 失败残留（"图片无法访问…"）按识别失败处理，不给表单填充垃圾
        if (res?.available && !isFailedParseText(res.summary)) {
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
  }, [styleId, enabled, isNewMode, currentImage, autoParseEnabled, onStyleParseResult, parsing]);

  // 新建模式下：本地图片（blob 预览）加载后自动识别
  useEffect(() => {
    if (!isNewMode) return;
    if (!onStyleParseResult) return;
    if (!autoParseEnabled) return;
    if (parsing) return;
    const current = displayImages[currentIndex];
    if (!current) return;

    const parseKey = String(current.fileUrl || `local-${current.localIndex ?? currentIndex}`);
    if (lastParsedUrlRef.current === parseKey) return;
    lastParsedUrlRef.current = parseKey;

    onAutoParseStart?.();
    setParsing(true);
    setAutoParseError(null);
    setParseSuccessConfidence(null);
    (async () => {
      const res = await runStyleParseFromCurrentImage();
      // 失败残留（"图片无法访问…"）按识别失败处理，不给表单填充垃圾
      if (res?.available && !isFailedParseText(res.summary)) {
        onStyleParseResult?.(res);
        onAutoParseResult?.(res);
        setParseSuccessConfidence(res.overallConfidence ?? null);
      } else {
        setAutoParseError(res?.errorMessage || '识别失败，可手动填写');
      }
      setParsing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewMode, currentImage?.fileUrl, displayImages.length, currentIndex, autoParseEnabled, onStyleParseResult, parsing]);

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

  const handleDelete = (attachmentId: string | number, localIndex?: number) => {
    // 新建模式下删除本地文件（未保存到后端，无需确认）
    if (isNewMode && localIndex !== undefined) {
      handleRemoveLocalFile(localIndex);
      return;
    }
    if (!enabled) return;
    modal.confirm({
      title: '确认删除',
      content: '确定要删除该图片吗？此操作不可恢复。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.delete<ApiResult<boolean>>(`/style/attachment/${attachmentId}`);
          if (isApiSuccess(res) && res?.data === true) {
            message.success('删除成功');
            const deletedUrl = String(displayImages.find((item) => String(item?.id) === String(attachmentId))?.fileUrl || '');
            if (!deletedUrl || deletedUrl === currentImage?.fileUrl) {
              const nextCover = displayImages.find((item) => String(item?.id) !== String(attachmentId) && !(item as { isCoverFallback?: boolean })?.isCoverFallback)?.fileUrl || null;
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
      },
    });
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
    if ((img as { isCoverFallback?: boolean }).isCoverFallback) {
      message.warning('请先上传图片，再设置主图');
      return;
    }
    try {
      const res = await api.post<ApiResult<boolean>>(`/style/attachment/${img.id}/set-cover`);
      if (isApiSuccess(res)) {
        // 展示列表已把 fileUrl 换成带 token 的地址，回写 cover 必须用附件裸 URL，
        // 否则带 token 的链接会被存进款式数据，过期后 401
        const rawUrl = String(images.find((item) => String(item?.id) === String(img.id))?.fileUrl || img.fileUrl || '');
        // 本地把新主图排到第一位：列表顺序与徽标立即变化，不用等刷新
        setImages((prev) => {
          const target = prev.find((item) => String(item?.id) === String(img.id));
          if (!target) return prev;
          return [target, ...prev.filter((item) => String(item?.id) !== String(img.id))];
        });
        setCurrentIndex(0);
        onCoverChange?.(rawUrl);
        setStyleCoverOverride(styleId, undefined, rawUrl);
        message.success('已设置为主图');
      } else {
        message.error(getApiMessage(res, '设置主图失败'));
      }
    } catch {
      message.error('设置主图失败，请重试');
    }
  };

  // 统一的识别触发器（供工具栏按钮调用）
  const handleParseClick = async () => {
    if (parsing || searching) return;
    setParsing(true);
    setAutoParseError(null);
    setParseSuccessConfidence(null);
    try {
      const res = await runStyleParseFromCurrentImage();
      // 失败残留（"图片无法访问…"）按识别失败处理
      if (res?.available && !isFailedParseText(res.summary)) {
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
  };

  // 上传图片（新建模式加入待上传列表；编辑模式直接上传到附件库）
  const [uploading, setUploading] = useState(false);
  const handleUploadFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) return;
    if (isNewMode) {
      const firstNewIndex = pendingFiles.length;
      onPendingFilesChange?.([...pendingFiles, ...valid]);
      // 选中第一张新加的本地图，触发自动识别（识别跟随当前选中图）
      setCurrentIndex(firstNewIndex);
      message.success(`已添加 ${valid.length} 张图片，保存后生效`);
      return;
    }
    if (!styleId) {
      message.warning('请先保存基础信息后再上传图片');
      return;
    }
    setUploading(true);
    try {
      let lastUploadedUrl = '';
      for (const file of valid) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('styleId', String(styleId));
        if (styleNo) formData.append('styleNo', styleNo);
        const uploadRes = await api.post<ApiResult<{ fileUrl?: string }>>('/style/attachment/upload', formData, { timeout: 60000 });
        if (!isApiSuccess(uploadRes) || !uploadRes?.data?.fileUrl) {
          throw new Error(`图片 ${file.name} 上传失败`);
        }
        lastUploadedUrl = uploadRes.data.fileUrl;
      }
      message.success(`成功上传 ${valid.length} 张图片`);
      const sorted = await fetchImages();
      // D-264：选中刚上传的图——识别跟随当前选中图，不切过去就永远不识别
      //（此前列表按主图排序后选中图还停在老主图，用户看来"只有设为主图才识别"）
      if (lastUploadedUrl && sorted.length > 0) {
        const idx = sorted.findIndex((item: any) => isSameFileUrl(item?.fileUrl, lastUploadedUrl));
        if (idx >= 0) setCurrentIndex(idx);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }, [isNewMode, pendingFiles, onPendingFilesChange, styleId, styleNo, fetchImages, message]);

  return {
    currentIndex,
    setCurrentIndex,
    hoverIndex,
    setHoverIndex,
    previewHovered,
    setPreviewHovered,
    searching,
    searchResult,
    searchExpanded,
    setSearchExpanded,
    parsing,
    autoParseError,
    parseSuccessConfidence,
    displayImages,
    currentImage,
    runStyleSearchByImage,
    handleDelete,
    handleSetCover,
    handleParseClick,
    handleUploadFiles,
    uploading,
    fetchImages,
  };
};
