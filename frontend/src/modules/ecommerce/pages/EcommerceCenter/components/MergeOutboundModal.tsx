import React, { useState, useCallback } from 'react';
import { Form, Input, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import StyleImageCell from '@/components/common/StyleImageCell';
import type { StyleImageMap, SkuBriefMap } from '@/hooks/useStyleCoverImages';
import type { MergeGroup } from '../useEcStock';
import { EXPRESS_COMPANY_OPTIONS } from '../helpers';

export interface MergeOutboundModalProps {
  open: boolean;
  group: MergeGroup | null;
  /** 款号/skuCode → 图片 URL */
  imageMap?: StyleImageMap;
  /** skuCode → 款号/颜色/尺码摘要 */
  briefBySku?: SkuBriefMap;
  onClose: () => void;
  onOk: (orderIds: number[], trackingNo: string, expressCompany: string) => Promise<void>;
}

const MergeOutboundModal: React.FC<MergeOutboundModalProps> = ({
  open, group, imageMap, briefBySku, onClose, onOk,
}) => {
  const [form] = Form.useForm<{ trackingNo: string; expressCompany: string }>();
  const [submitting, setSubmitting] = useState(false);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    if (!group) return;
    setSubmitting(true);
    try {
      await onOk(group.orders.map(o => o.orderId), val.trackingNo, val.expressCompany);
      onClose();
    } finally { setSubmitting(false); }
  }, [form, group, onOk, onClose]);
  return (
    <ResizableModal title="合单发货" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      {group && (
        <div className="u-mb-12">
          <div className="u-fs-13 u-mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            收货人：{group.receiverName} | {group.receiverPhone} | 平台：{group.platform}
          </div>
          <div className="u-fs-13 u-mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            共 {group.orderCount} 笔订单，{group.totalQuantity} 件商品
          </div>
          {/* 合单明细：带款式图，避免只看单号不知道发的是哪些货 */}
          {imageMap && (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {group.orders.map(o => {
                const brief = briefBySku?.[o.skuCode];
                const spec = [brief?.color, brief?.size].filter(Boolean).join(' / ');
                return (
                  <div key={o.orderId} className="u-d-flex u-ai-center u-gap-8" style={{ padding: '4px 0' }}>
                    <StyleImageCell skuCode={o.skuCode} styleNo={brief?.styleNo} imageMap={imageMap} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="u-fs-13 u-fw-600" style={{ fontFamily: 'monospace' }}>
                        {brief?.styleNo || o.skuCode}
                      </div>
                      <div className="u-fs-13" style={{ color: 'var(--color-text-muted)' }}>
                        {o.orderNo}{spec ? ` · ${spec}` : ''} × {o.quantity}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item label="快递单号" name="trackingNo" rules={[{ required: true, message: '请输入快递单号' }]}>
          <Input placeholder="请输入快递单号" />
        </Form.Item>
        <Form.Item label="快递公司" name="expressCompany" rules={[{ required: true, message: '请选择快递公司' }]}>
          <Select placeholder="请选择快递公司" options={EXPRESS_COMPANY_OPTIONS} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default MergeOutboundModal;
