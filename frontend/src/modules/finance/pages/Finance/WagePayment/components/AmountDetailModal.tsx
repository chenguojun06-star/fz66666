import React from 'react';
import { Descriptions } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import { BIZ_TYPE_MAP } from '@/services/finance/wagePaymentApi';

interface AmountDetailModalProps {
  open: boolean;
  onClose: () => void;
  target: any;
}

const AmountDetailModal: React.FC<AmountDetailModalProps> = ({
  open,
  onClose,
  target,
}) => {
  return (
    <ResizableModal
      title="账单明细"
      open={open}
      onCancel={onClose}
      footer={null}
      width="40vw"
    >
      {target && (
        <Descriptions column={2} bordered>
          <Descriptions.Item label="业务类型">
            {BIZ_TYPE_MAP[target.bizType]?.text ?? '未知'}
          </Descriptions.Item>
          <Descriptions.Item label="单据编号">{target.bizNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="收款方">{target.payeeName}</Descriptions.Item>
          <Descriptions.Item label="收款方类型">
            {target.payeeType === 'WORKER' ? '员工' : '工厂/供应商'}
          </Descriptions.Item>
          <Descriptions.Item label="应付金额">
            <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(target.amount)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="已付金额">
            <span style={{ color: '#389e0d' }}>{formatMoney(target.paidAmount || 0)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>{target.description || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>{formatDateTime(target.createTime)}</Descriptions.Item>
          {target.bizType === 'RECONCILIATION' && (
            <Descriptions.Item label="关联信息" span={2}>
              此为工厂对账单汇总金额，可在「加工厂汇总」点击总金额查看逐笔订单明细。
            </Descriptions.Item>
          )}
        </Descriptions>
      )}
    </ResizableModal>
  );
};

export default AmountDetailModal;
