import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Spin, Empty, Tag, Image } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { HistoryOutlined, DeleteOutlined } from '@ant-design/icons';
import { orderImageApi } from '@/services/system/remarkApi';
import type { OrderImage, OrderImageSnapshot } from '@/services/system/remarkApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';

interface OrderImageManagerProps {
  orderNo: string;
  editable?: boolean;
}

const OrderImageManager: React.FC<OrderImageManagerProps> = ({ orderNo, editable = true }) => {
  const { message, modal } = App.useApp();
  const [images, setImages] = useState<OrderImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<OrderImageSnapshot[]>([]);

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 500 }}>订单图片 ({images.length}/5)</span>
        {editable && (
          <Button size="small" icon={<HistoryOutlined />} onClick={handleViewHistory}>
            更新历史
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        {images.length === 0 && !loading ? (
          <Empty description="暂无图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Image.PreviewGroup>
              {images.map((img) => (
                <div key={img.id} style={{ position: 'relative', width: 100, height: 100 }}>
                  <Image
                    src={getFullAuthedFileUrl(img.imageUrl)}
                    style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                    preview={{ mask: '预览' }}
                  />
                  {editable && (
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ position: 'absolute', top: 2, right: 2, minWidth: 20, padding: 0, background: 'rgba(255,255,255,0.8)' }}
                      onClick={() => handleDelete(img.id)}
                    />
                  )}
                </div>
              ))}
            </Image.PreviewGroup>
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
