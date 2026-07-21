import React from 'react';
import { Button, Tag, Descriptions, Divider, Progress } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import type { TenantInfo } from '@/services/tenantService';
import { PLAN_LABELS, BILL_STATUS, CYCLE_LABELS, formatStorageSize } from '../helpers';

export interface OverviewModalProps {
  open: boolean;
  data: TenantInfo | null | undefined;
  overview: any;
  overviewLoading: boolean;
  onClose: () => void;
}

const OverviewModal: React.FC<OverviewModalProps> = ({
  open,
  data,
  overview,
  overviewLoading,
  onClose,
}) => {
  return (
    <ResizableModal
      open={open}
      title={`账单详情 - ${data?.tenantName || ''}`}
      onCancel={onClose}
      width="40vw"
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {overviewLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>加载中...</div>
      ) : overview ? (
        <div>
          <Descriptions column={2} bordered>
            <Descriptions.Item label="套餐类型">
              <Tag color={PLAN_LABELS[overview.planType]?.color || 'default'}>
                {PLAN_LABELS[overview.planType]?.label ?? '未知'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="计费周期">
              <Tag color={overview.billingCycle === 'YEARLY' ? 'blue' : 'default'}>
                {CYCLE_LABELS[overview.billingCycle] || '月付'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="月费">¥{overview.monthlyFee || 0}</Descriptions.Item>
            <Descriptions.Item label="存储配额">
              {formatStorageSize(overview.storageQuotaMb || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="已用存储">
              <Progress
                percent={overview.storageUsedPercent || 0}

                status={(overview.storageUsedPercent || 0) >= 90 ? 'exception' : 'normal'}
                style={{ width: 150, display: 'inline-flex' }}
              />
              <span style={{ marginLeft: 8 }}>
                {formatStorageSize(overview.storageUsedMb || 0)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="最大用户数">{overview.maxUsers}</Descriptions.Item>
            <Descriptions.Item label="当前用户数">{overview.currentUsers}</Descriptions.Item>
            <Descriptions.Item label="付费状态">
              <Tag color={overview.paidStatus === 'PAID' ? 'gold' : 'default'}>
                {overview.paidStatus === 'PAID' ? '已付费' : '免费试用'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="到期时间">
              {overview.expireTime || '永不过期'}
            </Descriptions.Item>
          </Descriptions>

          {overview.recentBills?.length > 0 && (
            <>
              <Divider style={{ marginTop: 24 }}>最近账单</Divider>
              <ResizableTable
                storageKey="customer-billing-overview-bills"
                rowKey="id"
                columns={[
                  { title: '账期', dataIndex: 'billingMonth', width: 90 },
                  { title: '金额', dataIndex: 'totalAmount', width: 80, render: (v: number) => `¥${v}` },
                  { title: '状态', dataIndex: 'status', width: 80,
                    render: (v: string) => <Tag color={BILL_STATUS[v]?.color || 'default'}>{BILL_STATUS[v]?.label || v}</Tag>,
                  },
                  { title: '支付时间', dataIndex: 'paidTime', width: 150 },
                ]}
                dataSource={overview.recentBills}
                emptyDescription="暂无财务数据"
                pagination={false}

              />
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>暂无数据</div>
      )}
    </ResizableModal>
  );
};

export default OverviewModal;
