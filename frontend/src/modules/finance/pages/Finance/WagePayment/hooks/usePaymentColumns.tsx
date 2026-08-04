import React, { useMemo } from 'react';
import { Space, Tag, Button } from 'antd';
import {
  WalletOutlined, BankOutlined, WechatOutlined, AlipayCircleOutlined,
  CreditCardOutlined, TeamOutlined, ShopOutlined, AccountBookOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
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
  WECHAT: <WechatOutlined style={{ color: 'var(--color-emerald-500)' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: 'var(--color-primary)' }} />,
};

export const accountTypeIconMap: Record<string, React.ReactNode> = {
  BANK: <CreditCardOutlined />,
  WECHAT: <WechatOutlined style={{ color: 'var(--color-emerald-500)' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: 'var(--color-primary)' }} />,
};

export const bizTypeIconMap: Record<string, React.ReactNode> = {
  PAYROLL: <TeamOutlined />,
  RECONCILIATION: <ShopOutlined />,
  REIMBURSEMENT: <AccountBookOutlined />,
};

/**
 * 智能推断收款方类型标签
 * 结合 bizType 和 payeeType 两个字段判断，避免历史脏数据导致误显示
 *
 * 规则：
 * - bizType 为 PAYROLL/PAYROLL_SETTLEMENT → 员工（工资结算的收款方一定是员工）
 * - bizType 为 REIMBURSEMENT → 员工（费用报销的收款方是员工）
 * - bizType 为 BILL_RECEIVABLE → 客户（应收账款的收款方是客户）
 * - payeeType 为 WORKER → 员工
 * - payeeType 为 CUSTOMER → 客户
 * - payeeType 为 SUPPLIER → 供应商
 * - 其他 → 工厂
 */
export function resolvePayeeTag(bizType?: string, payeeType?: string): { text: string; color: string } {
  const bt = (bizType || '').trim().toUpperCase();
  const pt = (payeeType || '').trim().toUpperCase();

  // bizType 优先（业务语义更准确）
  if (bt === 'PAYROLL' || bt === 'PAYROLL_SETTLEMENT') return { text: '员工', color: 'blue' };
  if (bt === 'REIMBURSEMENT') return { text: '员工', color: 'blue' };
  if (bt === 'BILL_RECEIVABLE') return { text: '客户', color: 'purple' };

  // payeeType 兜底
  if (pt === 'WORKER') return { text: '员工', color: 'blue' };
  if (pt === 'CUSTOMER') return { text: '客户', color: 'purple' };
  if (pt === 'SUPPLIER') return { text: '供应商', color: 'orange' };

  // 默认工厂
  return { text: '工厂', color: 'green' };
}

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
          return t ? <Tag icon={bizTypeIconMap[v]} color={t.color}>{t.text}</Tag> : '未知';
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
        render: (_: unknown, r: PayableItem) => {
          const tag = resolvePayeeTag(r.bizType, r.payeeType);
          return (
            <Space size={4}>
              <Tag color={tag.color} style={{ fontSize: 14, margin: 0 }}>{tag.text}</Tag>
              <span style={{ fontWeight: 500 }}>{r.payeeName}</span>
            </Space>
          );
        },
      },
      {
        title: '应付金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 130,
        align: 'right',
        render: (v: number, record: PayableItem) => (
          <span
            style={{ fontWeight: 600, color: 'var(--color-error)', cursor: 'pointer', textDecoration: 'underline' }}
            title="点击查看明细"
            onClick={() => onAmountClick?.(record)}
          >
            {formatMoney(v)}
          </span>
        ),
      },
      {
        title: '已付金额',
        dataIndex: 'paidAmount',
        key: 'paidAmount',
        width: 120,
        align: 'right',
        render: (v: number) => <span style={{ color: 'var(--color-success)' }}>{formatMoney(v || 0)}</span>,
      },
      {
        title: '付款状态',
        dataIndex: 'paymentStatus',
        key: 'paymentStatus',
        width: 110,
        align: 'center',
        render: (v: string) => {
          const map: Record<string, { text: string; color: string }> = {
            unpaid: { text: '未付', color: 'red' },
            partially_paid: { text: '部分已付', color: 'orange' },
            fully_paid: { text: '已付清', color: 'green' },
          };
          const info = map[v];
          return info ? <Tag color={info.color}>{info.text}</Tag> : <Tag>{v || '-'}</Tag>;
        },
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        width: 200,
        ellipsis: true,
        render: (v: string, record: PayableItem) => {
          const count = record.billCount;
          if (count && count > 1) {
            return <span>{v} <Tag color="blue" style={{ marginLeft: 4, fontSize: 14 }}>{count}笔合并</Tag></span>;
          }
          return v || '-';
        },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>{v}</Button>
        ),
      },
      {
        title: '业务类型',
        dataIndex: 'bizType',
        key: 'bizType',
        width: 110,
        render: (v: string) => {
          const t = BIZ_TYPE_MAP[v];
          return t ? <Tag color={t.color}>{t.text}</Tag> : '未知';
        },
      },
      {
        title: '收款方',
        key: 'payee',
        width: 140,
        render: (_: unknown, r: WagePayment) => {
          const tag = resolvePayeeTag(r.bizType, r.payeeType);
          return (
            <Space size={4}>
              <Tag color={tag.color} style={{ fontSize: 14, margin: 0 }}>{tag.text}</Tag>
              <span>{r.payeeName}</span>
            </Space>
          );
        },
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
        render: (v: number) => <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(v)}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (v: string) => {
          const s = PAYMENT_STATUS_MAP[v];
          return s ? <Tag color={s.color}>{s.text}</Tag> : '未知';
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
