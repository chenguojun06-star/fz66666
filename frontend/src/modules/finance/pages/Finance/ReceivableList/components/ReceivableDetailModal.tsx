import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { receivableApi, type Receivable, type ReceivableReceiptLog } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { toMoneyLocale } from '@/utils/format';
import { STATUS_CONFIG } from '../helpers';

const ReceivableDetailModal: React.FC<{
  open: boolean;
  receivableId?: string;
  onClose: () => void;
}> = ({ open, receivableId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Receivable | null>(null);
  const [logs, setLogs] = useState<ReceivableReceiptLog[]>([]);

  useEffect(() => {
    if (!open || !receivableId) {
      setDetail(null);
      setLogs([]);
      return;
    }
    setLoading(true);
    void receivableApi.detail(receivableId)
      .then((res: ApiResult) => {
        const data = (res?.data ?? res) as Record<string, unknown> | undefined;
        setDetail((data?.receivable as Receivable | null) ?? null);
        setLogs(Array.isArray(data?.receiptLogs) ? (data.receiptLogs as ReceivableReceiptLog[]) : []);
      })
      .catch(() => {
        message.error('加载应收详情失败');
      })
      .finally(() => setLoading(false));
  }, [open, receivableId]);

  return (
    <ResizableModal
      title={`应收详情${detail?.receivableNo ? ` - ${detail.receivableNo}` : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width="56vw"
      destroyOnHidden
    >
      <div style={{ marginTop: 16 }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="客户名称">{detail?.customerName || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联订单">{detail?.orderNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源业务">
            {detail?.sourceBizType === 'MATERIAL_PICKUP' ? <Tag color="purple">面辅料领取</Tag> : (detail?.sourceBizType || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="来源单号">{detail?.sourceBizNo || '-'}</Descriptions.Item>
          <Descriptions.Item label="应收金额">¥ {toMoneyLocale(detail?.amount)}</Descriptions.Item>
          <Descriptions.Item label="已收金额">¥ {toMoneyLocale(detail?.receivedAmount)}</Descriptions.Item>
          <Descriptions.Item label="待收余款">
            ¥ {toMoneyLocale((Number(detail?.amount ?? 0) - Number(detail?.receivedAmount ?? 0)))}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {detail?.status ? <Tag color={(STATUS_CONFIG[detail.status] ?? { color: 'default' }).color}>{(STATUS_CONFIG[detail.status] ?? { label: detail.status }).label}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="到期日">{detail?.dueDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{detail?.description || '-'}</Descriptions.Item>
        </Descriptions>
        <Card title="回款流水" style={{ marginTop: 16 }}>
          <ResizableTable
            rowKey="id"

            pagination={false}
            loading={loading}
            dataSource={logs}
            scroll={{ x: 720 }}
            locale={{ emptyText: '暂无回款流水' }}
            columns={[
              { title: '回款时间', dataIndex: 'receivedTime', width: 160, render: (v?: string) => v?.replace('T', ' ').substring(0, 16) || '-' },
              { title: '回款金额', dataIndex: 'receivedAmount', width: 120, align: 'right', render: (v?: number) => `¥ ${toMoneyLocale(v)}` },
              { title: '操作人', dataIndex: 'operatorName', width: 120, render: (v?: string) => v || '-' },
              { title: '备注', dataIndex: 'remark', render: (v?: string) => v || '-' },
            ]}
          />
        </Card>
      </div>
    </ResizableModal>
  );
};

export default ReceivableDetailModal;
