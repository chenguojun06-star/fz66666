import React, { useEffect, useState } from 'react';
import { Descriptions, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import payableApi, { type Payable } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { toMoneyLocale } from '@/utils/format';
import { getStatusConfig } from '../helpers';

/** 应付详情弹窗：根据 payableId 拉取列表后定位详情 */
const PayableDetailModal: React.FC<{
  open: boolean;
  payableId?: string;
  onClose: () => void;
}> = ({ open, payableId, onClose }) => {
  const [, setLoading] = useState(false);
  const [detail, setDetail] = useState<Payable | null>(null);

  useEffect(() => {
    if (!open || !payableId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void payableApi.list({ page: 1, pageSize: 100 })
      .then((res: ApiResult) => {
        const data = (res?.data ?? res) as Record<string, unknown> | undefined;
        const records = (data?.records as Payable[]) ?? [];
        const found = records.find((r: Payable) => r.id === payableId);
        setDetail(found ?? null);
      })
      .catch(() => {
        message.error('加载应付详情失败');
      })
      .finally(() => setLoading(false));
  }, [open, payableId]);

  return (
    <ResizableModal
      title={`应付详情${detail?.payableNo ? ` - ${detail.payableNo}` : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width="56vw"
      destroyOnHidden
    >
      <div style={{ marginTop: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="供应商/对方名称">{detail?.supplierName || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联订单">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源业务">
            {detail?.orderId ? <Tag color="purple">采购订单</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="来源单号">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="应付金额">¥ {toMoneyLocale(detail?.amount)}</Descriptions.Item>
          <Descriptions.Item label="已付金额">¥ {toMoneyLocale(detail?.paidAmount)}</Descriptions.Item>
          <Descriptions.Item label="待付余额">
            ¥ {toMoneyLocale((Number(detail?.amount ?? 0) - Number(detail?.paidAmount ?? 0)))}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {detail?.status ? (() => {
              const cfg = getStatusConfig(detail.status);
              return <Tag color={cfg.color}>{cfg.label}</Tag>;
            })() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="到期日">{detail?.dueDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{detail?.createTime?.substring(0, 16) || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{detail?.description || '-'}</Descriptions.Item>
        </Descriptions>
      </div>
    </ResizableModal>
  );
};

export default PayableDetailModal;
