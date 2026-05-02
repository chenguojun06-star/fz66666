import React, { useMemo } from 'react';
import { Space, Tag } from 'antd';
import {
  WalletOutlined, BankOutlined, WechatOutlined, AlipayCircleOutlined,
  CreditCardOutlined, TeamOutlined, ShopOutlined, AccountBookOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import {
  wagePaymentApi,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  BIZ_TYPE_MAP,
  type WagePayment,
  type PayableItem,
} from '@/services/finance/wagePaymentApi';
import PaymentAuditPopover from '@/modules/finance/pages/FinanceCenter/PaymentAuditPopover';

// ============================================================
// 图标映射（模块级常量，可被组件直接导入使用）
// ============================================================
export const methodIconMap: Record<string, React.ReactNode> = {
  OFFLINE: <WalletOutlined />,
  BANK: <BankOutlined />,
  WECHAT: <WechatOutlined style={{ color: '#07C160' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: '#1677FF' }} />,
};

export const accountTypeIconMap: Record<string, React.ReactNode> = {
  BANK: <CreditCardOutlined />,
  WECHAT: <WechatOutlined style={{ color: '#07C160' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: '#1677FF' }} />,
};

export const bizTypeIconMap: Record<string, React.ReactNode> = {
  PAYROLL: <TeamOutlined />,
  RECONCILIATION: <ShopOutlined />,
  REIMBURSEMENT: <AccountBookOutlined />,
};

// ============================================================
// Hook 接口
// ============================================================
interface UsePaymentColumnsProps {
  openPayModal: (p?: PayableItem) => void;
  handleRejectPayable: (p: PayableItem) => void;
  openAccountModal: (ownerType: string, ownerId: string, ownerName: string) => void;
  setDetailRecord: (r: WagePayment) => void;
  setDetailOpen: (v: boolean) => void;
  openProofModal: (id: string) => void;
  handleCancel: (r: WagePayment) => void;
  fetchPayments: () => void;
  msg: { error: (s: string) => void; success: (s: string) => void };
  onAmountClick?: (record: PayableItem) => void;
}

// ============================================================
// Hook
// ============================================================
export function usePaymentColumns(props: UsePaymentColumnsProps) {
  const {
    openPayModal, handleRejectPayable, openAccountModal,
    setDetailRecord, setDetailOpen,
    openProofModal, handleCancel, fetchPayments, msg,
    onAmountClick,
  } = props;

  // ---- 待收付款列 ----
  const payableColumns: ColumnsType<PayableItem> = useMemo(
    () => [
      {
        title: '业务类型',
        dataIndex: 'bizType',
        key: 'bizType',
        width: 120,
        render: (v: string) => {
          const t = BIZ_TYPE_MAP[v];
          return t ? <Tag icon={bizTypeIconMap[v]} color={t.color}>{t.text}</Tag> : v;
        },
      },
      {
        title: '单据编号',
        dataIndex: 'bizNo',
        key: 'bizNo',
        width: 180,
        ellipsis: true,
        render: (v: string, record: PayableItem) => (
          <PaymentAuditPopover record={record}>
            <span style={{ cursor: 'pointer', borderBottom: '1px dashed var(--color-border-antd)' }}>{v || '-'}</span>
          </PaymentAuditPopover>
        ),
      },
      {
        title: '收款方',
        key: 'payee',
        width: 160,
        render: (_: unknown, r: PayableItem) => (
          <Space size={4}>
            <Tag color={r.payeeType === 'WORKER' ? 'blue' : 'green'} style={{ fontSize: 11, margin: 0 }}>{r.payeeType === 'WORKER' ? '员工' : '工厂'}</Tag>
            <span style={{ fontWeight: 500 }}>{r.payeeName}</span>
          </Space>
        ),
      },
      {
        title: '应付金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 130,
        align: 'right',
        render: (v: number, record: PayableItem) => (
          <span
            style={{ fontWeight: 600, color: '#cf1322', cursor: 'pointer', textDecoration: 'underline' }}
            title="点击查看明细"
            onClick={() => onAmountClick?.(record)}
          >
            ¥{Number(v).toFixed(2)}
          </span>
        ),
      },
      {
        title: '已付金额',
        dataIndex: 'paidAmount',
        key: 'paidAmount',
        width: 120,
        align: 'right',
        render: (v: number) => <span style={{ color: '#389e0d' }}>¥{Number(v || 0).toFixed(2)}</span>,
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        width: 200,
        ellipsis: true,
      },
      {
        title: '创建时间',
        dataIndex: 'createTime',
        key: 'createTime',
        width: 170,
        render: (v: string) => formatDateTime(v),
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        fixed: 'right' as const,
        render: (_: unknown, record: PayableItem) => {
          const actions: RowAction[] = [
            {
              key: 'pay',
              label: '去付款',
              primary: true,
              onClick: () => openPayModal(record),
            },
            {
              key: 'reject',
              label: '驳回',
              danger: true,
              onClick: () => handleRejectPayable(record),
            },
            {
              key: 'accounts',
              label: '收款账户',
              onClick: () => openAccountModal(record.payeeType, record.payeeId, record.payeeName),
            },
          ];
          return <RowActions actions={actions} />;
        },
      },
    ],
    [openPayModal, handleRejectPayable, openAccountModal],
  );

  // ---- 收支记录列 ----
  const paymentColumns: ColumnsType<WagePayment> = useMemo(
    () => [
      {
        title: '支付单号',
        dataIndex: 'paymentNo',
        key: 'paymentNo',
        width: 180,
        render: (v: string, record: WagePayment) => (
          <a onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>{v}</a>
        ),
      },
      {
        title: '业务类型',
        dataIndex: 'bizType',
        key: 'bizType',
        width: 110,
        render: (v: string) => {
          const t = BIZ_TYPE_MAP[v];
          return t ? <Tag color={t.color}>{t.text}</Tag> : v || '-';
        },
      },
      {
        title: '收款方',
        key: 'payee',
        width: 140,
        render: (_: unknown, r: WagePayment) => (
          <Space size={4}>
            <Tag color={r.payeeType === 'WORKER' ? 'blue' : 'green'} style={{ fontSize: 11, margin: 0 }}>{r.payeeType === 'WORKER' ? '员工' : '工厂'}</Tag>
            <span>{r.payeeName}</span>
          </Space>
        ),
      },
      {
        title: '支付方式',
        dataIndex: 'paymentMethod',
        key: 'paymentMethod',
        width: 120,
        render: (v: string) => (
          <Space>{methodIconMap[v]}{PAYMENT_METHOD_OPTIONS.find(o => o.value === v)?.label ?? v}</Space>
        ),
      },
      {
        title: '金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 120,
        align: 'right',
        render: (v: number) => <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(v).toFixed(2)}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (v: string) => {
          const s = PAYMENT_STATUS_MAP[v];
          return s ? <Tag color={s.color}>{s.text}</Tag> : v;
        },
      },
      {
        title: '业务单号',
        dataIndex: 'bizNo',
        key: 'bizNo',
        width: 160,
        ellipsis: true,
      },
      {
        title: '操作人',
        dataIndex: 'operatorName',
        key: 'operatorName',
        width: 100,
      },
      {
        title: '创建时间',
        dataIndex: 'createTime',
        key: 'createTime',
        width: 170,
        render: (v: string) => formatDateTime(v),
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        fixed: 'right' as const,
        render: (_: unknown, record: WagePayment) => {
          const actions: RowAction[] = [];
          if (record.status === 'pending') {
            actions.push({
              key: 'confirm',
              label: '确认支付',
              primary: true,
              onClick: () => openProofModal(record.id),
            });
            actions.push({
              key: 'cancel',
              label: '取消',
              danger: true,
              onClick: () => handleCancel(record),
            });
          }
          if (record.status === 'success' && !record.confirmTime) {
            actions.push({
              key: 'received',
              label: '确认收款',
              primary: true,
              onClick: async () => {
                try {
                  await wagePaymentApi.confirmReceived(record.id);
                  msg.success('已确认收款');
                  fetchPayments();
                } catch (err: unknown) {
                  msg.error(`确认收款失败: ${err instanceof Error ? err.message : '未知错误'}`);
                }
              },
            });
          }
          actions.push({
            key: 'accounts',
            label: '收款账户',
            onClick: () => openAccountModal(record.payeeType, record.payeeId, record.payeeName),
          });
          return <RowActions actions={actions} />;
        },
      },
    ],
    [fetchPayments, msg, openProofModal, handleCancel, openAccountModal, setDetailRecord, setDetailOpen],
  );

  return { payableColumns, paymentColumns };
}
