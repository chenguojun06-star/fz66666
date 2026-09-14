import React, { useState, useCallback, useEffect } from 'react';
import { App, Button, Empty, Image, Spin, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import PurchaseDocRecognizeModal from './PurchaseDocRecognizeModal';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface PurchaseOrderDoc {
  id: string;
  orderNo?: string;
  styleNo?: string;
  imageUrl?: string;
  rawText?: string;
  matchCount?: number;
  totalRecognized?: number;
  uploaderName?: string;
  createTime?: string;
}

interface PurchaseDocDrawerProps {
  open: boolean;
  orderNo?: string;
  /** 样衣采购无订单号，按款号归属单据（D-360d） */
  styleNo?: string;
  onClose: () => void;
  /** 单据变更（上传/识别成功）后回调，父层刷新到货数量等 */
  onChanged?: () => void;
}

/**
 * 采购单据侧滑抽屉（D-360f）：上传采购单 + 历史单据查看 合并为一个入口，50% 宽度。
 * 点开即见：历史单据缩略图（按订单号/款号归属）+ 「上传新单据」按钮（AI 识别送货单）。
 */
const PurchaseDocDrawer: React.FC<PurchaseDocDrawerProps> = ({ open, orderNo, styleNo, onClose, onChanged }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<PurchaseOrderDoc[]>([]);
  const [recognizeOpen, setRecognizeOpen] = useState(false);

  const loadDocs = useCallback(async () => {
    const ownerOrderNo = String(orderNo || '').trim();
    const ownerStyleNo = String(styleNo || '').trim();
    if (!ownerOrderNo && !ownerStyleNo) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: PurchaseOrderDoc[] }>(
        '/production/purchase/docs',
        { params: ownerOrderNo ? { orderNo: ownerOrderNo } : { styleNo: ownerStyleNo } },
      );
      if (res?.code === 200) setDocs(res.data || []);
    } catch {
      message.error('加载采购单据失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo, styleNo, message]);

  useEffect(() => {
    if (open) void loadDocs();
  }, [open, loadDocs]);

  const handleUploadSuccess = useCallback(() => {
    setRecognizeOpen(false);
    void loadDocs();
    onChanged?.();
  }, [loadDocs, onChanged]);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={`采购单据${docs.length > 0 ? `（${docs.length} 张）` : ''}`}
      width="50%"
    >
      <div className="u-mb-16 u-d-flex u-jc-end">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecognizeOpen(true)}>
          上传新单据
        </Button>
      </div>
      <Spin spinning={loading}>
        {docs.length === 0 ? (
          <Empty
            style={{ marginTop: 48 }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无采购单据。点右上角「上传新单据」上传供应商送货单，AI 识别后自动保存在这里（按订单号/款号归属，可随时回看）。"
          />
        ) : (
          <div className="u-d-flex u-fwrap-wrap u-gap-16">
            {docs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  width: 200,
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 6,
                  padding: 8,
                  background: 'var(--color-bg-container)',
                }}
              >
                <Image
                  src={getFullAuthedFileUrl(doc.imageUrl)}
                  width={184}
                  height={128}
                  className="u-objf-cover u-br-4"
                  preview={{ cover: '预览' }}
                />
                <div className="u-mt-6 u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>
                  <Tooltip title={doc.uploaderName}>
                    <div className="u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>
                      {doc.uploaderName || '未知上传人'}
                    </div>
                  </Tooltip>
                  <div className="u-mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    {doc.createTime ? doc.createTime.slice(0, 16).replace('T', ' ') : ''}
                  </div>
                  <div className="u-mt-2">
                    识别{doc.totalRecognized || 0}条 · 匹配{doc.matchCount || 0}条
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Spin>

      {/* 上传+AI识别（原独立弹窗，合并进抽屉） */}
      <PurchaseDocRecognizeModal
        open={recognizeOpen}
        orderNo={orderNo}
        styleNo={styleNo}
        onCancel={() => setRecognizeOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </SideDrawer>
  );
};

export default PurchaseDocDrawer;
