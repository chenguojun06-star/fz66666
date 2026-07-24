import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Empty, Image, Popconfirm, Spin } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { HistoryOutlined, DeleteOutlined, LeftOutlined, RightOutlined, EyeOutlined } from '@ant-design/icons';
import { orderImageApi } from '@/services/system/remarkApi';
import type { OrderImage } from '@/services/system/remarkApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import { visualAnalyze } from '@/services/intelligence/intelligenceApi';
import { arrowBtnStyle } from './utils';
import ImageHistoryContent from './ImageHistoryContent';
import AIAnalysisContent from './AIAnalysisContent';

interface OrderImageManagerProps {
  orderNo: string;
  editable?: boolean;
  coverUrl?: string | null;
  styleId?: string | number;
  styleNo?: string;
}

const OrderImageManager: React.FC<OrderImageManagerProps> = ({ orderNo, editable = true, coverUrl, styleId, styleNo }) => {
  const { message } = App.useApp();
  const [images, setImages] = useState<OrderImage[]>([]);
  const [styleImages, setStyleImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const allImageUrls = React.useMemo(() => {
    const urls: { url: string; id?: number; isCover?: boolean; isStyle?: boolean }[] = [];
    if (coverUrl) {
      urls.push({ url: getFullAuthedFileUrl(coverUrl), isCover: true });
    }
    styleImages.forEach((url) => {
      urls.push({ url: getFullAuthedFileUrl(url), isStyle: true });
    });
    images.forEach((img) => {
      urls.push({ url: getFullAuthedFileUrl(img.imageUrl), id: img.id });
    });
    return urls;
  }, [coverUrl, images, styleImages]);

  const totalCount = allImageUrls.length;

  useEffect(() => {
    setCurrentIdx(0);
  }, [totalCount]);

  const fetchImages = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res: any = await orderImageApi.list(orderNo);
      if (res && typeof res === 'object' && (res as any).code !== undefined && (res as any).code !== 200) {
        setImages([]);
        setLoading(false);
        return;
      }
      let list: any[] = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && typeof res === 'object') {
        if (Array.isArray((res as any).data)) {
          list = (res as any).data;
        } else if (Array.isArray((res as any).list)) {
          list = (res as any).list;
        }
      }
      setImages(list);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  const fetchStyleImages = useCallback(async () => {
    if (!styleId && !styleNo) return;
    try {
      const res: any = await (await import('@/utils/api')).default.get('/style/attachment/list', {
        params: { styleId: styleId || undefined, styleNo: styleNo || undefined },
      });
      if (res?.code === 200 && Array.isArray(res?.data)) {
        const imgUrls = res.data
          .filter((f: any) => String(f.fileType || '').includes('image'))
          .map((f: any) => f.fileUrl)
          .filter(Boolean) as string[];
        setStyleImages(imgUrls);
      }
    } catch (e) {
      console.error('[OrderImageManager] 加载款式图片失败:', e);
    }
  }, [styleId, styleNo]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  useEffect(() => {
    fetchStyleImages();
  }, [fetchStyleImages]);

  const handleUpload = async (url: string) => {
    try {
      const result: any = await orderImageApi.add(orderNo, url);
      if (result && typeof result === 'object' && (result as any).code !== undefined && (result as any).code !== 200) {
        message.error((result as any).message || '添加图片失败');
        return;
      }
      message.success('图片已添加');
      fetchImages();
    } catch {
      message.error('添加图片失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await orderImageApi.delete(id);
      message.success('图片已删除');
      fetchImages();
    } catch {
      message.error('删除失败');
    }
  };

  const handleViewHistory = async () => {
    setHistoryOpen(true);
    try {
      const res: any = await orderImageApi.snapshots(orderNo);
      if (res && typeof res === 'object' && (res as any).code !== undefined && (res as any).code !== 200) {
        setSnapshots([]);
        return;
      }
      let list: any[] = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && typeof res === 'object') {
        if (Array.isArray((res as any).data)) {
          list = (res as any).data;
        } else if (Array.isArray((res as any).list)) {
          list = (res as any).list;
        }
      }
      setSnapshots(list);
    } catch {
      message.error('加载历史记录失败');
    }
  };

  const goPrev = () => setCurrentIdx((i) => (i > 0 ? i - 1 : totalCount - 1));
  const goNext = () => setCurrentIdx((i) => (i < totalCount - 1 ? i + 1 : 0));

  const currentImg = allImageUrls[currentIdx];
  const currentOrderImg = currentImg && !currentImg.isCover ? images.find((im) => im.id === currentImg.id) : undefined;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 500 }}>
          订单图片 ({images.length}/5)
          {totalCount > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 12 }}>
              共{totalCount}张
            </span>
          )}
        </span>
        {editable && (
          <Button size="small" icon={<HistoryOutlined />} onClick={handleViewHistory}>
            更新历史
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        {totalCount === 0 && !loading ? (
          <Empty description="暂无图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div
            style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden' }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Image.PreviewGroup>
              {allImageUrls.map((item, idx) => (
                <Image
                  key={
                    item.isCover
                      ? `cover-${idx}`
                      : item.isStyle
                        ? `style-${idx}-${item.url}`
                        : `order-${item.id}`
                  }
                  src={item.url}
                  style={{ display: idx === currentIdx ? 'block' : 'none', width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 6, cursor: 'pointer' }}
                  preview={{ cover: '点击预览' }}
                />
              ))}
            </Image.PreviewGroup>

            {totalCount > 1 && (
              <>
                <Button type="text" icon={<LeftOutlined />} onClick={goPrev} style={arrowBtnStyle('left', hovering)} />
                <Button type="text" icon={<RightOutlined />} onClick={goNext} style={arrowBtnStyle('right', hovering)} />
              </>
            )}

            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.45)', color: 'var(--color-bg-base)', fontSize: 11, padding: '1px 8px',
              borderRadius: 10, lineHeight: '18px', pointerEvents: 'none',
            }}>
              {currentIdx + 1}/{totalCount}
            </div>

            {editable && currentOrderImg && (
              <div style={{
                position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4,
                opacity: hovering ? 1 : 0, transition: 'opacity 0.2s ease', zIndex: 2,
              }}>
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  loading={analyzing}
                  style={{
                    minWidth: 22, padding: 0,
                    background: 'rgba(255,255,255,0.85)', borderRadius: 4,
                  }}
                  title="AI视觉分析"
                  onClick={async () => {
                    if (analyzing || !currentImg?.url) return;
                    setAnalyzing(true);
                    try {
                      const res = await visualAnalyze({
                        imageUrl: currentImg.url,
                        taskType: 'STYLE_IDENTIFY',
                      });
                      setAnalysisResult(res);
                    } catch {
                      message.warning('AI分析暂不可用');
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                />
                <Popconfirm title="确定删除这张图片吗？" onConfirm={() => handleDelete(currentOrderImg.id)} okText="确定" cancelText="取消">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    style={{
                      minWidth: 22, padding: 0,
                      background: 'rgba(255,255,255,0.85)', borderRadius: 4,
                    }}
                  />
                </Popconfirm>
              </div>
            )}

            {currentImg?.isCover && (
              <span style={{
                position: 'absolute', top: 4, left: 4, fontSize: 10, padding: '0 5px',
                background: 'rgba(0,0,0,0.5)', color: 'var(--color-bg-base)', borderRadius: 3, lineHeight: '18px',
              }}>
                封面
              </span>
            )}
          </div>
        )}

        {editable && images.length < 5 && (
          <div style={{ marginTop: 12 }}>
            <MultiImageUploadBox
              value={[]}
              onChange={(urls: string[]) => {
                if (urls.length > 0) {
                  handleUpload(urls[urls.length - 1]);
                }
              }}
              maxCount={5 - images.length}
              maxSizeMB={5}
              accept="image/jpeg,image/png"
            />
          </div>
        )}
      </Spin>

      <ResizableModal
        title="图片更新历史"
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width="40vw"
      >
        <ImageHistoryContent snapshots={snapshots} />
      </ResizableModal>

      <ResizableModal
        title="AI视觉分析"
        open={!!analysisResult}
        onCancel={() => setAnalysisResult(null)}
        footer={null}
        width="40vw"
      >
        <AIAnalysisContent analysisResult={analysisResult} />
      </ResizableModal>
    </div>
  );
};

export default OrderImageManager;
