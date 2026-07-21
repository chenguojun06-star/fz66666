import React from 'react';
import { Button, Descriptions, Image, Space, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  BIZ_TYPE_MAP,
} from '@/services/finance/wagePaymentApi';
import { methodIconMap } from '../hooks/usePaymentColumns';

interface PaymentDetailModalProps {
  open: boolean;
  onClose: () => void;
  detailRecord: any;
}

const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  open,
  onClose,
  detailRecord,
}) => {
  return (
    <ResizableModal
      open={open}
      title="支付详情"
      onCancel={onClose}
      width="40vw"
      centered
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {detailRecord && (
        <div style={{ padding: '0 8px' }}>
          <Descriptions bordered column={2}>
            <Descriptions.Item label="支付单号">{detailRecord.paymentNo}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {(() => {
                const s = PAYMENT_STATUS_MAP[detailRecord.status];
                return s ? <Tag color={s.color}>{s.text}</Tag> : '未知';
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="业务类型">
              {(() => {
                const t = BIZ_TYPE_MAP[detailRecord.bizType ?? ''];
                return t ? <Tag color={t.color}>{t.text}</Tag> : '未知';
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="业务单号">{detailRecord.bizNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="收款方类型">
              {detailRecord.payeeType === 'WORKER' ? '员工' : '工厂'}
            </Descriptions.Item>
            <Descriptions.Item label="收款方">{detailRecord.payeeName}</Descriptions.Item>
            <Descriptions.Item label="支付方式">
              <Space>
                {methodIconMap[detailRecord.paymentMethod]}
                {PAYMENT_METHOD_OPTIONS.find(o => o.value === detailRecord.paymentMethod)?.label}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="金额">
              <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(detailRecord.amount)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="操作人">{detailRecord.operatorName}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(detailRecord.createTime)}</Descriptions.Item>
            {detailRecord.paymentTime && (
              <Descriptions.Item label="支付时间" span={2}>{formatDateTime(detailRecord.paymentTime)}</Descriptions.Item>
            )}
            {detailRecord.confirmTime && (
              <Descriptions.Item label="确认收款时间" span={2}>{formatDateTime(detailRecord.confirmTime)}</Descriptions.Item>
            )}
            {detailRecord.paymentRemark && (
              <Descriptions.Item label="备注" span={2}>{detailRecord.paymentRemark}</Descriptions.Item>
            )}
          </Descriptions>
          {detailRecord.paymentProof && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>支付凭证</div>
              <Image src={getFullAuthedFileUrl(detailRecord.paymentProof)} width={200} alt="支付凭证" />
            </div>
          )}
        </div>
      )}
    </ResizableModal>
  );
};

export default PaymentDetailModal;
