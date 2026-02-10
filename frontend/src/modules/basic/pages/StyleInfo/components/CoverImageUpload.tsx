import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Upload } from 'antd';
import { DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import api from '@/utils/api';

interface CoverImageUploadProps {
  styleId?: string | number;
  enabled: boolean;
  isNewMode?: boolean;  // 新建模式
  pendingFiles?: File[];  // 待上传的文件列表
  onPendingFilesChange?: (files: File[]) => void;  // 更新待上传文件
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
  onPendingFilesChange
}) => {
  const { message } = App.useApp();
  const [images, setImages] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState<boolean>(false);
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
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
      if (res.code === 200) {
        const imgs = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
        setImages(imgs);
        if (imgs.length > 0 && currentIndex >= imgs.length) {
          setCurrentIndex(0);
        }
      }
    } catch {
      // 忽略错误
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [styleId, currentIndex]);

  useEffect(() => {
    if (!isNewMode) {
      fetchImages();
    }
  }, [fetchImages, isNewMode]);

  // 新建模式下添加本地文件
  const handleAddLocalFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validFiles: File[] = [];

    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        message.error(`${f.name} 不是图片文件`);
        continue;
      }
      if (f.size > 50 * 1024 * 1024) {
        message.error(`${f.name} 文件过大，最大50MB`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      const newFiles = [...pendingFiles, ...validFiles].slice(0, 20);
      onPendingFilesChange?.(newFiles);
      message.success(`已选择 ${validFiles.length} 张图片`);
    }
  };

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

  const handleUpload = async (file: File, fileList: File[]) => {
    if (isNewMode) {
      // 新建模式：添加到本地预览
      handleAddLocalFiles(fileList);
      return false;
    }

    if (!styleId) {
      message.warning('请先保存基础信息后再上传图片');
      return false;
    }

    // 验证文件
    const filesToUpload = fileList.slice(0, 4); // 最多4张
    for (const f of filesToUpload) {
      if (!f.type.startsWith('image/')) {
        message.error(`${f.name} 不是图片文件`);
        return false;
      }
      if (f.size > 50 * 1024 * 1024) {
        message.error(`${f.name} 文件过大，最大50MB`);
        return false;
      }
    }

    setLoading(true);
    try {
      // 批量上传所有文件
      const uploadPromises = filesToUpload.map(async (f) => {
        const formData = new FormData();
        formData.append('file', f);
        formData.append('styleId', String(styleId));
        return api.post('/style/attachment/upload', formData);
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((res: any) => res.code === 200).length;

      if (successCount > 0) {
        message.success(`成功上传 ${successCount} 张图片`);
        fetchImages();
      } else {
        message.error('上传失败');
      }
    } catch (error: unknown) {
      message.error((error as any)?.message || '上传失败');
    } finally {
      setLoading(false);
    }
    return false;
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
        fetchImages();
      } else {
        message.error((res as any).message || '删除失败');
      }
    } catch (error: unknown) {
      message.error((error as any)?.message || '删除失败');
    }
  };

  const handleSetCover = (index: number) => {
    setCurrentIndex(index);
    if (!isNewMode) {
      message.success('已设置为主图');
    }
  };

  // 新建模式使用本地预览，否则使用服务器图片
  const displayImages = isNewMode
    ? localPreviewUrls.map((url, i) => ({ fileUrl: url, id: `local-${i}`, isLocal: true, localIndex: i }))
    : images;
  const currentImage = displayImages[currentIndex];
  const isUploadEnabled = isNewMode || (enabled && styleId);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>封面图</div>
      {/* 大图 */}
      <div
        style={{
          width: 400,
          height: 400,
          border: '1px solid #e8e8e8',
          background: 'var(--color-bg-container)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        {currentImage ? (
          <img src={currentImage.fileUrl} alt="main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            {isNewMode ? (
              <span style={{ color: 'var(--neutral-text-disabled)' }}>点击下方按钮选择图片</span>
            ) : !styleId ? (
              <>
                <div style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-base)", marginBottom: 4 }}>上传设计稿或款式照片</div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>请先填写上方基础信息并点击"保存基础信息"</div>
              </>
            ) : enabled ? (
              <span style={{ color: 'var(--neutral-text-disabled)' }}>上传设计稿或款式照片</span>
            ) : (
              <>
                <div style={{ color: 'var(--error-color)', fontSize: "var(--font-size-base)", marginBottom: 4 }}>样衣已完成</div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>请联系管理员退回后修改</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 缩略图列表 - 固定4个框，对齐主图宽度400px */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: 400, marginBottom: 12 }}>
        {[0, 1, 2, 3].map((idx) => {
          const img = displayImages[idx];
          const hover = hoverIndex === idx;
          const canOperate = isNewMode || enabled;
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{
                width: '100%',
                aspectRatio: '1',
                border: img && currentIndex === idx ? '2px solid #1890ff' : '1px solid #e8e8e8',
                overflow: 'hidden',
                cursor: img ? 'pointer' : 'default',
                background: 'var(--color-bg-container)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {img ? (
                <>
                  <img
                    src={img.fileUrl}
                    alt={`thumb-${idx}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onClick={() => setCurrentIndex(idx)}
                  />
                  {/* Hover显示操作按钮 */}
                  {hover && canOperate && (
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
                        gap: 8,
                      }}
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetCover(idx);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: currentIndex === idx ? '#faad14' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        title="设置为主图"
                      >
                        {currentIndex === idx ? (
                          <StarFilled style={{ color: 'var(--neutral-white)', fontSize: "var(--font-size-base)" }} />
                        ) : (
                          <StarOutlined style={{ color: 'var(--warning-color)', fontSize: "var(--font-size-base)" }} />
                        )}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(img.id, img.localIndex);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--color-bg-base)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        title="删除图片"
                      >
                        <DeleteOutlined style={{ color: 'var(--error-color)', fontSize: "var(--font-size-base)" }} />
                      </div>
                    </div>
                  )}
                  {/* 主图标记 */}
                  {currentIndex === idx && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: '#faad14',
                        color: 'var(--neutral-white)',
                        fontSize: 10,
                        padding: '2px 6px',
                      }}
                    >
                      主图
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--neutral-border)', fontSize: "var(--font-size-xs)" }}>细节图{idx + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 上传按钮 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Upload
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={!isUploadEnabled}
            multiple
            maxCount={4}
            accept="image/*"
          >
            <Button
              type="primary"
              size="small"
              disabled={!isUploadEnabled}
              loading={loading}
              title={isNewMode ? '选择图片（保存时上传）' : !styleId ? '请先保存基础信息' : !enabled ? '样衣已完成，无法修改' : ''}
            >
              {isNewMode ? '选择图片（最多4张）' : !styleId ? '请先保存' : !enabled ? '已锁定' : '上传图片（最多4张）'}
            </Button>
          </Upload>
          {displayImages.length > 0 && <span style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>共 {displayImages.length} 张{isNewMode ? '（保存时上传）' : ''}</span>}
        </div>
        {isNewMode && pendingFiles.length > 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>💡</span>
            <span>填写上方基础信息并点击"保存基础信息"后，即可上传图片</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverImageUpload;
