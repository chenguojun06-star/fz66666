import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Spin, Empty, Tag, Image } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { HistoryOutlined, DeleteOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { orderImageApi } from '@/services/system/remarkApi';
import type { OrderImage, OrderImageSnapshot } from '@/services/system/remarkApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';

interface OrderImageManagerProps {
  orderNo: string;
  editable?: boolean;
  coverUrl?: string | null;
}

const OrderImageManager: React.FC<OrderImageManagerProps> = ({ orderNo, editable = true, coverUrl }) => {
  const { message, modal } = App.useApp();
  const [images, setImages] = useState<OrderImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<OrderImageSnapshot[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hovering, setHovering] = useState(false);

  const allImageUrls = React.useMemo(() => {
    const urls: { url: string; id?: number; isCover?: boolean }[] = [];
    if (coverUrl) {
      urls.push({ url: getFullAuthedFileUrl(coverUrl), isCover: true });
    }
    images.forEach((img) => {
      urls.push({ url: getFullAuthedFileUrl(img.imageUrl), id: img.id });
    });
    return urls;
  }, [coverUrl, images]);

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

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

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

  const handleDelete = (id: number) => {
    modal.confirm({
      title: '确认删除',
      content: '确定要删除这张图片吗？',
      onOk: async () => {
        try {
          await orderImageApi.delete(id);
          message.success('图片已删除');
          fetchImages();
        } catch {
          message.error('删除失败');
        }
      },
    });
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

  const parseUrls = (urls?: string): string[] => {
    if (!urls) return [];
    try {
      const parsed = JSON.parse(urls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const snapshotTypeMap: Record<string, { text: string; color: string }> = {
    ADD: { text: '新增', color: 'green' },
    DELETE: { text: '删除', color: 'red' },
    REORDER: { text: '排序', color: 'blue' },
    UPDATE: { text: '更新', color: 'orange' },
  };

  const goPrev = () => setCurrentIdx((i) => (i > 0 ? i - 1 : totalCount - 1));
  const goNext = () => setCurrentIdx((i) => (i < totalCount - 1 ? i + 1 : 0));

  const currentImg = allImageUrls[currentIdx];
  const currentOrderImg = currentImg && !currentImg.isCover ? images.find((im) => im.id === currentImg.id) : undefined;

  const arrowBtnStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    [side]: 4,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    border: 'none',
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: hovering ? 1 : 0,
    transition: 'opacity 0.2s ease',
    cursor: 'pointer',
    zIndex: 2,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 500 }}>
          订单图片 ({images.length}/5)
          {coverUrl && totalCount > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 12 }}>
              含封面共{totalCount}张
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
                  key={item.isCover ? 'cover' : item.id}
                  src={item.url}
                  style={{ display: idx === currentIdx ? 'block' : 'none', width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 6, cursor: 'pointer' }}
                  preview={{ mask: '点击预览' }}
                />
              ))}
            </Image.PreviewGroup>

            {totalCount > 1 && (
              <>
                <Button type="text" icon={<LeftOutlined />} onClick={goPrev} style={arrowBtnStyle('left')} />
                <Button type="text" icon={<RightOutlined />} onClick={goNext} style={arrowBtnStyle('right')} />
              </>
            )}

            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '1px 8px',
              borderRadius: 10, lineHeight: '18px', pointerEvents: 'none',
            }}>
              {currentIdx + 1}/{totalCount}
            </div>

            {editable && currentOrderImg && (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                style={{
                  position: 'absolute', top: 4, right: 4, minWidth: 22, padding: 0,
                  background: 'rgba(255,255,255,0.85)', borderRadius: 4,
                  opacity: hovering ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                  zIndex: 2,
                }}
                onClick={() => handleDelete(currentOrderImg.id)}
              />
            )}

            {currentImg?.isCover && (
              <span style={{
                position: 'absolute', top: 4, left: 4, fontSize: 10, padding: '0 5px',
                background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 3, lineHeight: '18px',
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
        {snapshots.length === 0 ? (
          <Empty description="暂无更新记录" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {snapshots.map((s) => {
              const typeInfo = snapshotTypeMap[s.snapshotType] || { text: s.snapshotType, color: 'default' };
              const beforeUrls = parseUrls(s.beforeUrls);
              const afterUrls = parseUrls(s.afterUrls);
              return (
                <div key={s.id} style={{ padding: 12, border: '1px solid var(--color-border-light)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span>
                      <Tag color={typeInfo.color}>{typeInfo.text}</Tag>
                      <span style={{ marginLeft: 8 }}>{s.operatorName || '系统'}</span>
                    </span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                      {s.createTime ? s.createTime.replace('T', ' ').substring(0, 16) : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {beforeUrls.length > 0 && (
                      <div>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>变更前</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {beforeUrls.map((url, idx) => (
                            <Image key={idx} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {afterUrls.length > 0 && (
                      <div>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>变更后</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {afterUrls.map((url, idx) => (
                            <Image key={idx} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ResizableModal>
    </div>
  );
};

export default OrderImageManager;
