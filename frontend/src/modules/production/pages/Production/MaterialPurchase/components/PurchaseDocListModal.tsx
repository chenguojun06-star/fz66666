import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Empty, Image, Spin, Tag } from 'antd';
import { FileImageOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';

interface PurchaseOrderDoc {
  id: string;
  orderNo?: string;
  imageUrl?: string;
  rawText?: string;
  matchCount?: number;
  totalRecognized?: number;
  uploaderName?: string;
  createTime?: string;
}

interface Props {
  open: boolean;
  orderNo?: string;
  onCancel: () => void;
}

/** 采购单据存档：展示该订单所有上传的采购单/送货单图片（含AI识别摘要） */
const PurchaseDocListModal: React.FC<Props> = ({ open, orderNo, onCancel }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<PurchaseOrderDoc[]>([]);

  const loadDocs = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: PurchaseOrderDoc[] }>(
        '/production/purchase/docs',
        { params: { orderNo } },
      );
      if (res?.code === 200) {
        setDocs(res.data || []);
      }
    } catch {
      message.error('加载采购单据失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo, message]);

  useEffect(() => {
    if (open && orderNo) {
      loadDocs();
    }
  }, [open, orderNo, loadDocs]);

  return (
    <ResizableModal
      open={open}
      title={`采购单据存档（${docs.length} 张）`}
      width="48vw"
      onCancel={onCancel}
      footer={<Button onClick={onCancel}>关闭</Button>}
    >
      <Spin spinning={loading}>
        {docs.length === 0 && !loading ? (
          <Empty
            image={<FileImageOutlined style={{ fontSize: 48, color: 'var(--color-text-quaternary)' }} />}
            description="暂无采购单据，点击「上传采购单」上传供应商送货单/采购单图片"
          />
        ) : (
          <Image.PreviewGroup>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <Image
                    src={doc.imageUrl}
                    alt="采购单据"
                    style={{ width: '100%', height: 140, objectFit: 'contain', background: 'var(--color-fill-quaternary)' }}
                    fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
                  />
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{doc.uploaderName ? `${doc.uploaderName} 上传` : '—'}</span>
                    <span>{formatDateTime(doc.createTime)}</span>
                    <span>
                      {(doc.totalRecognized ?? 0) > 0 ? (
                        <Tag color="processing">识别 {doc.totalRecognized} 项 · 匹配 {doc.matchCount ?? 0} 项</Tag>
                      ) : (
                        <Tag color="default">未识别到物料</Tag>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Image.PreviewGroup>
        )}
      </Spin>
    </ResizableModal>
  );
};

export default PurchaseDocListModal;
