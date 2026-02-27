import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Upload,
} from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  WalletOutlined,
  AlipayCircleOutlined,
  WechatOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  PayCircleOutlined,
  TeamOutlined,
  ShopOutlined,
  AccountBookOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import {
  wagePaymentApi,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  ACCOUNT_TYPE_OPTIONS,
  OWNER_TYPE_OPTIONS,
  BIZ_TYPE_OPTIONS,
  BIZ_TYPE_MAP,
  type WagePayment,
  type PaymentAccount,
  type PaymentQueryRequest,
  type PayableItem,
} from '@/services/finance/wagePaymentApi';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { RangePicker } = DatePicker;

// ============================================================
// 图标映射
// ============================================================
const methodIconMap: Record<string, React.ReactNode> = {
  OFFLINE: <WalletOutlined />,
  BANK: <BankOutlined />,
  WECHAT: <WechatOutlined style={{ color: '#07C160' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: '#1677FF' }} />,
};

const accountTypeIconMap: Record<string, React.ReactNode> = {
  BANK: <CreditCardOutlined />,
  WECHAT: <WechatOutlined style={{ color: '#07C160' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: '#1677FF' }} />,
};

const bizTypeIconMap: Record<string, React.ReactNode> = {
  PAYROLL: <TeamOutlined />,
  RECONCILIATION: <ShopOutlined />,
  REIMBURSEMENT: <AccountBookOutlined />,
};

// ============================================================
// 主组件 — 统一付款中心
// ============================================================
const PaymentCenterPage: React.FC = () => {
  const { message: msg } = App.useApp();

  const [activeTab, setActiveTab] = useState<string>('pending');
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  }, [showSmartErrorNotice]);

  // ---- 待付款列表 ----
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(true);
  const [payableBizType, setPayableBizType] = useState<string>('');

  // ---- 支付记录列表 ----
  const [payments, setPayments] = useState<WagePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [filterForm] = Form.useForm();

  // ---- 发起支付弹窗 ----
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [payAccounts, setPayAccounts] = useState<PaymentAccount[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [currentPayable, setCurrentPayable] = useState<PayableItem | null>(null);

  // ---- 账户管理弹窗 ----
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountOwnerType, setAccountOwnerType] = useState<string>('');
  const [accountOwnerId, setAccountOwnerId] = useState<string>('');
  const [accountOwnerName, setAccountOwnerName] = useState<string>('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [accountDetailOpen, setAccountDetailOpen] = useState(false);

  // ---- 支付详情弹窗 ----
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<WagePayment | null>(null);

  // ---- 上传凭证弹窗 ----
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofForm] = Form.useForm();
  const [proofPaymentId, setProofPaymentId] = useState<string>('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofFileList, setProofFileList] = useState<any[]>([]);

  // ---- QR码上传 ----
  const [qrFileList, setQrFileList] = useState<any[]>([]);

  // ============================================================
  //  数据加载
  // ============================================================

  /** 加载待付款单据 */
  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res: any = await wagePaymentApi.listPendingPayables(payableBizType || undefined);
      setPayables(res?.data ?? res ?? []);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (err: any) {
      reportSmartError('待付款数据加载失败', err?.message || '网络异常或服务不可用，请稍后重试', 'WAGE_PAYABLES_LOAD_FAILED');
      msg.error(`加载待付款数据失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setPayablesLoading(false);
    }
  }, [payableBizType, msg, reportSmartError, showSmartErrorNotice]);

  /** 加载支付记录 */
  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const values = filterForm.getFieldsValue();
      const query: PaymentQueryRequest = {};
      if (values.payeeName) query.payeeName = values.payeeName;
      if (values.status) query.status = values.status;
      if (values.paymentMethod) query.paymentMethod = values.paymentMethod;
      if (values.bizType) query.bizType = values.bizType;
      if (values.dateRange?.[0]) query.startTime = values.dateRange[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss');
      if (values.dateRange?.[1]) query.endTime = values.dateRange[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const res: any = await wagePaymentApi.listPayments(query);
      setPayments(res?.data ?? res ?? []);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (err: any) {
      reportSmartError('支付记录加载失败', err?.message || '网络异常或服务不可用，请稍后重试', 'WAGE_PAYMENTS_LOAD_FAILED');
      msg.error(`加载支付记录失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setPaymentsLoading(false);
    }
  }, [filterForm, msg, reportSmartError, showSmartErrorNotice]);

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPayables();
    } else {
      fetchPayments();
    }
  }, [activeTab, fetchPayables, fetchPayments]);

  // ============================================================
  //  发起支付（从待付款项目触发，或手动发起）
  // ============================================================
  const openPayModal = (payable?: PayableItem) => {
    payForm.resetFields();
    setSelectedMethod('');
    setSelectedAccount(null);
    setPayAccounts([]);
    setCurrentPayable(payable ?? null);

    if (payable) {
      payForm.setFieldsValue({
        payeeType: payable.payeeType,
        payeeId: payable.payeeId,
        payeeName: payable.payeeName,
        amount: Number(payable.amount) - Number(payable.paidAmount || 0),
        bizType: payable.bizType,
        bizId: payable.bizId,
        bizNo: payable.bizNo,
      });
      loadPayeeAccounts(payable.payeeType, payable.payeeId);
    }
    setPayModalOpen(true);
  };

  const loadPayeeAccounts = async (ownerType: string, ownerId: string) => {
    try {
      const res: any = await wagePaymentApi.listAccounts(ownerType, ownerId);
      setPayAccounts(res?.data ?? res ?? []);
    } catch {
      // ignore
    }
  };

  const handlePayeeChange = () => {
    const payeeType = payForm.getFieldValue('payeeType');
    const payeeId = payForm.getFieldValue('payeeId');
    if (payeeType && payeeId) {
      loadPayeeAccounts(payeeType, payeeId);
    }
  };

  const handleMethodSelect = (method: string) => {
    setSelectedMethod(method);
    payForm.setFieldsValue({ paymentMethod: method });
    if (method !== 'OFFLINE') {
      const matchAccounts = payAccounts.filter(a => a.accountType === method);
      const defaultOne = matchAccounts.find(a => a.isDefault === 1) ?? matchAccounts[0];
      setSelectedAccount(defaultOne ?? null);
      payForm.setFieldsValue({ paymentAccountId: defaultOne?.id });
    } else {
      setSelectedAccount(null);
      payForm.setFieldsValue({ paymentAccountId: undefined });
    }
  };

  const handlePaySubmit = async () => {
    try {
      const values = await payForm.validateFields();
      setPaySubmitting(true);

      const hasBiz = values.bizType && values.bizId;
      const apiCall = hasBiz ? wagePaymentApi.initiateWithCallback : wagePaymentApi.initiatePayment;

      const res: any = await apiCall({
        payeeType: values.payeeType,
        payeeId: values.payeeId,
        payeeName: values.payeeName,
        paymentAccountId: values.paymentAccountId,
        paymentMethod: values.paymentMethod,
        amount: values.amount,
        bizType: values.bizType,
        bizId: values.bizId,
        bizNo: values.bizNo,
        remark: values.remark,
      });
      const payment = res?.data ?? res;
      if (payment) {
        msg.success(`支付已发起，单号：${payment.paymentNo}`);
        setPayModalOpen(false);
        fetchPayables();
        fetchPayments();
      }
    } catch (err: any) {
      if (err?.message) msg.error(err.message);
    } finally {
      setPaySubmitting(false);
    }
  };

  // ============================================================
  //  账户管理
  // ============================================================
  const openAccountModal = (ownerType: string, ownerId: string, ownerName: string) => {
    setAccountOwnerType(ownerType);
    setAccountOwnerId(ownerId);
    setAccountOwnerName(ownerName);
    setEditingAccount(null);
    setAccountDetailOpen(false);
    accountForm.resetFields();
    setQrFileList([]);
    setAccountModalOpen(true);
    loadAccounts(ownerType, ownerId);
  };

  const loadAccounts = async (ownerType: string, ownerId: string) => {
    setAccountsLoading(true);
    try {
      const res: any = await wagePaymentApi.listAccounts(ownerType, ownerId);
      setAccounts(res?.data ?? res ?? []);
    } catch (err: any) {
      msg.error(`加载收款账户失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    try {
      const values = await accountForm.validateFields();
      setAccountSaving(true);
      const payload: PaymentAccount = {
        ...editingAccount,
        ownerType: accountOwnerType as 'WORKER' | 'FACTORY',
        ownerId: accountOwnerId,
        ownerName: accountOwnerName,
        accountType: values.accountType,
        accountName: values.accountName,
        accountNo: values.accountNo,
        bankName: values.bankName,
        bankBranch: values.bankBranch,
        qrCodeUrl: values.qrCodeUrl,
        isDefault: values.isDefault ? 1 : 0,
      };
      await wagePaymentApi.saveAccount(payload);
      msg.success('保存成功');
      setAccountDetailOpen(false);
      setEditingAccount(null);
      accountForm.resetFields();
      setQrFileList([]);
      loadAccounts(accountOwnerType, accountOwnerId);
    } catch (err: any) {
      if (err?.message) msg.error(err.message);
    } finally {
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await wagePaymentApi.removeAccount(id);
      msg.success('已删除');
      loadAccounts(accountOwnerType, accountOwnerId);
    } catch (err: any) {
      msg.error(`删除账户失败: ${err?.message || '未知错误'}`);
    }
  };

  const handleEditAccount = (account: PaymentAccount) => {
    setEditingAccount(account);
    accountForm.setFieldsValue({
      accountType: account.accountType,
      accountName: account.accountName,
      accountNo: account.accountNo,
      bankName: account.bankName,
      bankBranch: account.bankBranch,
      qrCodeUrl: account.qrCodeUrl,
      isDefault: account.isDefault === 1,
    });
    if (account.qrCodeUrl) {
      setQrFileList([{ uid: '-1', name: '二维码', status: 'done', url: account.qrCodeUrl }]);
    } else {
      setQrFileList([]);
    }
    setAccountDetailOpen(true);
  };

  const uploadQrImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res: any = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res?.data ?? res;
      if (url) {
        accountForm.setFieldsValue({ qrCodeUrl: url });
        setQrFileList([{ uid: '-1', name: file.name, status: 'done', url }]);
        msg.success('上传成功');
      }
    } catch (err: any) {
      msg.error(`上传二维码失败: ${err?.message || '请检查文件格式'}`);
    }
  };

  // ============================================================
  //  确认线下支付（上传凭证）
  // ============================================================
  const openProofModal = (paymentId: string) => {
    setProofPaymentId(paymentId);
    proofForm.resetFields();
    setProofFileList([]);
    setProofModalOpen(true);
  };

  const uploadProofImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res: any = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res?.data ?? res;
      if (url) {
        proofForm.setFieldsValue({ proofUrl: url });
        setProofFileList([{ uid: '-1', name: file.name, status: 'done', url }]);
      }
    } catch (err: any) {
      msg.error(`上传凭证失败: ${err?.message || '请检查文件格式'}`);
    }
  };

  const handleConfirmProof = async () => {
    try {
      setProofSubmitting(true);
      const values = proofForm.getFieldsValue();
      await wagePaymentApi.confirmOfflineWithCallback(proofPaymentId, values.proofUrl, values.remark);
      msg.success('已确认支付');
      setProofModalOpen(false);
      fetchPayments();
      fetchPayables();
    } catch (err: any) {
      msg.error(err?.message || '操作失败');
    } finally {
      setProofSubmitting(false);
    }
  };

  // ============================================================
  //  取消支付
  // ============================================================
  const handleCancel = (record: WagePayment) => {
    Modal.confirm({
      title: '确认取消',
      content: `确定取消支付单 ${record.paymentNo} 吗？`,
      onOk: async () => {
        try {
          await wagePaymentApi.cancelPayment(record.id, '手动取消');
          msg.success('已取消');
          fetchPayments();
        } catch (err: any) {
          msg.error(`取消支付失败: ${err?.message || '未知错误'}`);
        }
      },
    });
  };

  // ============================================================
  //  驳回待付款项
  // ============================================================
  const handleRejectPayable = (record: PayableItem) => {
    let reason = '';
    Modal.confirm({
      title: '驳回待付款',
      content: (
        <div>
          <p>确定驳回 <strong>{record.payeeName}</strong> 的待付款项？</p>
          <p style={{ fontSize: 12, color: '#999' }}>
            {BIZ_TYPE_MAP[record.bizType]?.text} · ¥{Number(record.amount).toFixed(2)}
          </p>
          <Input.TextArea
            placeholder="请输入驳回原因（必填）"
            rows={2}
            onChange={(e) => { reason = e.target.value; }}
          />
        </div>
      ),
      okText: '确认驳回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!reason.trim()) {
          msg.warning('请填写驳回原因');
          throw new Error('请填写驳回原因');
        }
        try {
          await wagePaymentApi.rejectPayable({
            bizType: record.bizType,
            bizId: record.bizId,
            reason: reason.trim(),
          });
          msg.success('已驳回');
          fetchPayables();
        } catch (err: any) {
          if (err?.message !== '请填写驳回原因') {
            msg.error(err?.message || '驳回失败');
          }
          throw err;
        }
      },
    });
  };

  // ============================================================
  //  表格列定义 — 待付款
  // ============================================================
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
      },
      {
        title: '收款方',
        key: 'payee',
        width: 160,
        render: (_: unknown, r: PayableItem) => (
          <Space orientation="vertical" size={0}>
            <span style={{ fontWeight: 500 }}>{r.payeeName}</span>
            <Tag style={{ fontSize: 11 }}>{r.payeeType === 'WORKER' ? '员工' : '工厂/供应商'}</Tag>
          </Space>
        ),
      },
      {
        title: '应付金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 130,
        align: 'right',
        render: (v: number) => <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(v).toFixed(2)}</span>,
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
        fixed: 'right',
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
    [],
  );

  // ============================================================
  //  表格列定义 — 支付记录
  // ============================================================
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
          <Space orientation="vertical" size={0}>
            <span>{r.payeeName}</span>
            <Tag style={{ fontSize: 11 }}>{r.payeeType === 'WORKER' ? '员工' : '工厂'}</Tag>
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
        fixed: 'right',
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
                } catch (err: any) { msg.error(`确认收款失败: ${(err as any)?.message || '未知错误'}`); }
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
    [fetchPayments, msg],
  );

  // ============================================================
  //  统计
  // ============================================================
  const pendingStats = useMemo(() => {
    const total = payables.length;
    const totalAmount = payables.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const reconCount = payables.filter(p => p.bizType === 'RECONCILIATION').length;
    const reimbCount = payables.filter(p => p.bizType === 'REIMBURSEMENT').length;
    const payrollCount = payables.filter(p => p.bizType === 'PAYROLL' || p.bizType === 'PAYROLL_SETTLEMENT').length;
    const orderCount = payables.filter(p => p.bizType === 'ORDER_SETTLEMENT').length;
    return { total, totalAmount, reconCount, reimbCount, payrollCount, orderCount };
  }, [payables]);

  const paymentStats = useMemo(() => {
    const total = payments.length;
    const successCount = payments.filter(p => p.status === 'success').length;
    const totalAmount = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const successAmount = payments.filter(p => p.status === 'success').reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return { total, successCount, totalAmount, successAmount };
  }, [payments]);

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <Layout>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                if (activeTab === 'pending') {
                  void fetchPayables();
                } else {
                  void fetchPayments();
                }
              }}
            />
          </Card>
        ) : null}

        {/* 页头 */}
        <Card className="page-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>
                <PayCircleOutlined style={{ marginRight: 8 }} />
                统一付款中心
              </h2>
              <span style={{ color: '#999', fontSize: 13 }}>
                集中管理员工工资、工厂对账、费用报销的付款操作
              </span>
            </div>
            <Button type="primary" icon={<DollarOutlined />} onClick={() => openPayModal()}>
              手动发起支付
            </Button>
          </div>
        </Card>

        {/* Tab 切换 */}
        <Card className="page-card">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'pending',
                label: (
                  <span>
                    <AccountBookOutlined /> 待付款 {pendingStats.total > 0 && <Tag color="red">{pendingStats.total}</Tag>}
                  </span>
                ),
                children: (
                  <>
                    {/* 统计行 */}
                    <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                      <Statistic title="待付款总额" value={pendingStats.totalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 18, color: '#cf1322' }} />
                      <Statistic title="工厂对账" value={pendingStats.reconCount} suffix="笔" valueStyle={{ fontSize: 18 }} />
                      <Statistic title="费用报销" value={pendingStats.reimbCount} suffix="笔" valueStyle={{ fontSize: 18 }} />
                      <Statistic title="员工工资" value={pendingStats.payrollCount} suffix="笔" valueStyle={{ fontSize: 18 }} />
                    </div>

                    {/* 过滤 */}
                    <div style={{ marginBottom: 16 }}>
                      <Space>
                        <span style={{ color: '#666' }}>业务类型：</span>
                        {BIZ_TYPE_OPTIONS.map(opt => (
                          <Button
                            key={opt.value}
                            type={payableBizType === opt.value ? 'primary' : 'default'}
                            size="small"
                            onClick={() => setPayableBizType(opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </Space>
                    </div>

                    {/* 待付款表格 */}
                    <ResizableTable
                      columns={payableColumns}
                      dataSource={payables}
                      rowKey={(r) => `${r.bizType}-${r.bizId}`}
                      loading={payablesLoading}
                      scroll={{ x: 1200 }}
                      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                    />
                  </>
                ),
              },
              {
                key: 'records',
                label: (
                  <span>
                    <CheckCircleOutlined /> 支付记录
                  </span>
                ),
                children: (
                  <>
                    {/* 统计行 */}
                    <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                      <Statistic title="支付总额" value={paymentStats.totalAmount} precision={2} prefix="¥" />
                      <Statistic title="已付金额" value={paymentStats.successAmount} precision={2} prefix="¥" styles={{ content: { color: '#389e0d' } }} />
                      <Statistic title="总笔数" value={paymentStats.total} suffix="笔" />
                      <Statistic title="成功" value={paymentStats.successCount} suffix="笔" styles={{ content: { color: '#389e0d' } }} />
                    </div>

                    {/* 过滤器 */}
                    <Form form={filterForm} layout="inline" onFinish={fetchPayments} style={{ marginBottom: 16 }}>
                      <Form.Item name="payeeName">
                        <Input placeholder="收款方姓名" allowClear prefix={<SearchOutlined />} style={{ width: 150 }} />
                      </Form.Item>
                      <Form.Item name="bizType">
                        <Select placeholder="业务类型" allowClear style={{ width: 130 }}>
                          {BIZ_TYPE_OPTIONS.filter(o => o.value).map(o => (
                            <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item name="status">
                        <Select placeholder="状态" allowClear style={{ width: 120 }}>
                          {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
                            <Select.Option key={k} value={k}>{v.text}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item name="paymentMethod">
                        <Select placeholder="支付方式" allowClear style={{ width: 130 }}>
                          {PAYMENT_METHOD_OPTIONS.map(o => (
                            <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item name="dateRange">
                        <RangePicker style={{ width: 240 }} />
                      </Form.Item>
                      <Form.Item>
                        <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
                      </Form.Item>
                    </Form>

                    {/* 支付记录表格 */}
                    <ResizableTable
                      columns={paymentColumns}
                      dataSource={payments}
                      rowKey="id"
                      loading={paymentsLoading}
                      scroll={{ x: 1400 }}
                      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                    />
                  </>
                ),
              },
            ]}
          />
        </Card>

        {/* ========================== 发起支付弹窗 ========================== */}
        <ResizableModal
          open={payModalOpen}
          title={currentPayable
            ? `付款 — ${BIZ_TYPE_MAP[currentPayable.bizType]?.text ?? ''} · ${currentPayable.bizNo}`
            : '手动发起支付'
          }
          onCancel={() => setPayModalOpen(false)}
          width="40vw"
          centered
          footer={
            <Space>
              <Button onClick={() => setPayModalOpen(false)}>取消</Button>
              <Button type="primary" loading={paySubmitting} onClick={handlePaySubmit} icon={<DollarOutlined />}>
                确认支付
              </Button>
            </Space>
          }
        >
          <div style={{ padding: '0 8px' }}>
            {/* 业务信息提示 */}
            {currentPayable && (
              <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="业务类型">
                    <Tag color={BIZ_TYPE_MAP[currentPayable.bizType]?.color}>
                      {BIZ_TYPE_MAP[currentPayable.bizType]?.text}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="单据编号">{currentPayable.bizNo}</Descriptions.Item>
                  <Descriptions.Item label="收款方">{currentPayable.payeeName}</Descriptions.Item>
                  <Descriptions.Item label="应付金额">
                    <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(currentPayable.amount).toFixed(2)}</span>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            <Form form={payForm} layout="vertical" requiredMark="optional">
              {!currentPayable && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                    <Form.Item label="收款方类型" name="payeeType" rules={[{ required: true, message: '请选择收款方类型' }]}>
                      <Select options={OWNER_TYPE_OPTIONS} onChange={handlePayeeChange} placeholder="选择员工或工厂" />
                    </Form.Item>
                    <Form.Item label="收款方ID" name="payeeId" rules={[{ required: true, message: '请输入收款方ID' }]}>
                      <Input placeholder="员工/工厂ID" onBlur={handlePayeeChange} />
                    </Form.Item>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                    <Form.Item label="收款方名称" name="payeeName" rules={[{ required: true, message: '请输入收款方名称' }]}>
                      <Input placeholder="姓名/工厂名" />
                    </Form.Item>
                    <Form.Item label="业务类型" name="bizType">
                      <Select allowClear placeholder="可选">
                        {BIZ_TYPE_OPTIONS.filter(o => o.value).map(o => (
                          <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                </>
              )}

              <Form.Item label="支付金额" name="amount" rules={[{ required: true, message: '请输入支付金额' }]}>
                <InputNumber prefix="¥" min={0.01} precision={2} style={{ width: '100%' }} placeholder="支付金额" />
              </Form.Item>

              {/* 支付方式选择卡片 */}
              <Form.Item label="选择支付方式" name="paymentMethod" rules={[{ required: true, message: '请选择支付方式' }]}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {PAYMENT_METHOD_OPTIONS.map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => handleMethodSelect(opt.value)}
                      style={{
                        border: `2px solid ${selectedMethod === opt.value ? 'var(--primary-color, #1677ff)' : '#d9d9d9'}`,
                        borderRadius: 8,
                        padding: '16px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        background: selectedMethod === opt.value ? 'rgba(22,119,255,0.04)' : '#fff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{methodIconMap[opt.value]}</div>
                      <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    </div>
                  ))}
                </div>
              </Form.Item>

              {/* 显示选中的收款账户信息 */}
              {selectedMethod && selectedMethod !== 'OFFLINE' && (
                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>
                    收款账户
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        const pt = payForm.getFieldValue('payeeType');
                        const pi = payForm.getFieldValue('payeeId');
                        const pn = payForm.getFieldValue('payeeName');
                        if (pt && pi) openAccountModal(pt, pi, pn || '');
                      }}
                    >
                      管理账户
                    </Button>
                  </div>
                  {selectedAccount ? (
                    <div>
                      {selectedAccount.accountType === 'BANK' ? (
                        <Space orientation="vertical" size={2}>
                          <span>{accountTypeIconMap[selectedAccount.accountType]} {selectedAccount.bankName}</span>
                          <span style={{ fontFamily: 'monospace' }}>
                            {selectedAccount.accountNo?.replace(/(\d{4})(?=\d)/g, '$1 ')}
                          </span>
                          <span style={{ color: '#999' }}>{selectedAccount.accountName}</span>
                        </Space>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          {selectedAccount.qrCodeUrl ? (
                            <Image src={selectedAccount.qrCodeUrl} width={200} alt="收款二维码" />
                          ) : (
                            <span style={{ color: '#ff4d4f' }}>该账户未上传收款二维码</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#faad14' }}>
                      收款方暂无{selectedMethod === 'BANK' ? '银行卡' : selectedMethod === 'WECHAT' ? '微信' : '支付宝'}账户，
                      <a onClick={() => {
                        const pt = payForm.getFieldValue('payeeType');
                        const pi = payForm.getFieldValue('payeeId');
                        const pn = payForm.getFieldValue('payeeName');
                        if (pt && pi) openAccountModal(pt, pi, pn || '');
                      }}>点击添加</a>
                    </span>
                  )}
                </div>
              )}

              <Form.Item name="paymentAccountId" hidden><Input /></Form.Item>
              {currentPayable && <Form.Item name="bizType" hidden><Input /></Form.Item>}
              <Form.Item name="bizId" hidden><Input /></Form.Item>
              <Form.Item name="bizNo" hidden><Input /></Form.Item>
              {currentPayable && (
                <>
                  <Form.Item name="payeeType" hidden><Input /></Form.Item>
                  <Form.Item name="payeeId" hidden><Input /></Form.Item>
                  <Form.Item name="payeeName" hidden><Input /></Form.Item>
                </>
              )}

              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="支付备注" />
              </Form.Item>
            </Form>
          </div>
        </ResizableModal>

        {/* ========================== 账户管理弹窗 ========================== */}
        <ResizableModal
          open={accountModalOpen}
          title={`收款账户管理 — ${accountOwnerName}`}
          onCancel={() => setAccountModalOpen(false)}
          width="40vw"
          centered
          footer={<Button onClick={() => setAccountModalOpen(false)}>关闭</Button>}
        >
          <div style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ color: '#999' }}>
                {accountOwnerType === 'WORKER' ? '员工' : '工厂'}：{accountOwnerName}
              </span>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingAccount(null);
                  accountForm.resetFields();
                  setQrFileList([]);
                  setAccountDetailOpen(true);
                }}
              >
                添加账户
              </Button>
            </div>

            {/* 账户列表 */}
            {accounts.map(acc => (
              <Card
                key={acc.id}
                size="small"
                style={{ marginBottom: 8, border: acc.isDefault === 1 ? '2px solid var(--primary-color, #1677ff)' : undefined }}
                extra={
                  <Space>
                    <Button type="link" size="small" onClick={() => handleEditAccount(acc)}>编辑</Button>
                    <Button type="link" size="small" danger onClick={() => acc.id && handleDeleteAccount(acc.id)}>
                      <DeleteOutlined />
                    </Button>
                  </Space>
                }
              >
                <Space>
                  <span style={{ fontSize: 20 }}>{accountTypeIconMap[acc.accountType]}</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {ACCOUNT_TYPE_OPTIONS.find(o => o.value === acc.accountType)?.label}
                      {acc.isDefault === 1 && <Tag color="blue" style={{ marginLeft: 8 }}>默认</Tag>}
                    </div>
                    {acc.accountType === 'BANK' ? (
                      <span style={{ color: '#666' }}>{acc.bankName} {acc.accountNo}</span>
                    ) : (
                      <span style={{ color: '#666' }}>{acc.accountName || '已上传二维码'}</span>
                    )}
                  </div>
                </Space>
              </Card>
            ))}
            {!accountsLoading && accounts.length === 0 && (
              <div style={{ textAlign: 'center', color: '#999', padding: 32 }}>暂无收款账户，请点击"添加账户"</div>
            )}

            {/* 添加/编辑账户表单 */}
            {accountDetailOpen && (
              <Card title={editingAccount ? '编辑账户' : '添加账户'} size="small" style={{ marginTop: 16 }}>
                <Form form={accountForm} layout="vertical" requiredMark="optional">
                  <Form.Item label="账户类型" name="accountType" rules={[{ required: true, message: '请选择' }]}>
                    <Select options={ACCOUNT_TYPE_OPTIONS} placeholder="选择账户类型" />
                  </Form.Item>
                  <Form.Item label="收款户名" name="accountName">
                    <Input placeholder="收款人姓名" />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.accountType !== cur.accountType}>
                    {({ getFieldValue }) =>
                      getFieldValue('accountType') === 'BANK' ? (
                        <>
                          <Form.Item label="银行卡号" name="accountNo" rules={[{ required: true, message: '请输入' }]}>
                            <Input placeholder="银行卡号" />
                          </Form.Item>
                          <Form.Item label="开户银行" name="bankName" rules={[{ required: true, message: '请选择' }]}>
                            <Input placeholder="如：中国工商银行" />
                          </Form.Item>
                          <Form.Item label="开户支行" name="bankBranch">
                            <Input placeholder="选填" />
                          </Form.Item>
                        </>
                      ) : getFieldValue('accountType') ? (
                        <>
                          <Form.Item label="收款二维码" name="qrCodeUrl" rules={[{ required: true, message: '请上传二维码' }]}>
                            <Input placeholder="自动填充" disabled />
                          </Form.Item>
                          <Upload
                            accept="image/*"
                            listType="picture-card"
                            maxCount={1}
                            fileList={qrFileList}
                            onRemove={() => { accountForm.setFieldsValue({ qrCodeUrl: undefined }); setQrFileList([]); return true; }}
                            beforeUpload={(file) => { void uploadQrImage(file as File); return Upload.LIST_IGNORE; }}
                          >
                            {qrFileList.length === 0 && (
                              <div><UploadOutlined /><div style={{ marginTop: 8 }}>上传二维码</div></div>
                            )}
                          </Upload>
                        </>
                      ) : null
                    }
                  </Form.Item>
                  <Form.Item name="isDefault" valuePropName="checked">
                    <Select
                      options={[{ label: '是', value: true }, { label: '否', value: false }]}
                      placeholder="设为默认账户"
                    />
                  </Form.Item>
                  <Space>
                    <Button type="primary" loading={accountSaving} onClick={handleSaveAccount}>保存</Button>
                    <Button onClick={() => { setAccountDetailOpen(false); setEditingAccount(null); }}>取消</Button>
                  </Space>
                </Form>
              </Card>
            )}
          </div>
        </ResizableModal>

        {/* ========================== 支付详情弹窗 ========================== */}
        <ResizableModal
          open={detailOpen}
          title="支付详情"
          onCancel={() => setDetailOpen(false)}
          width="40vw"
          centered
          footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        >
          {detailRecord && (
            <div style={{ padding: '0 8px' }}>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="支付单号">{detailRecord.paymentNo}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {(() => {
                    const s = PAYMENT_STATUS_MAP[detailRecord.status];
                    return s ? <Tag color={s.color}>{s.text}</Tag> : detailRecord.status;
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="业务类型">
                  {(() => {
                    const t = BIZ_TYPE_MAP[detailRecord.bizType ?? ''];
                    return t ? <Tag color={t.color}>{t.text}</Tag> : detailRecord.bizType || '-';
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
                  <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(detailRecord.amount).toFixed(2)}</span>
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
                  <Image src={detailRecord.paymentProof} width={200} alt="支付凭证" />
                </div>
              )}
            </div>
          )}
        </ResizableModal>

        {/* ========================== 上传凭证弹窗 ========================== */}
        <ResizableModal
          open={proofModalOpen}
          title="确认线下支付"
          onCancel={() => setProofModalOpen(false)}
          width="30vw"
          centered
          footer={
            <Space>
              <Button onClick={() => setProofModalOpen(false)}>取消</Button>
              <Button type="primary" loading={proofSubmitting} onClick={handleConfirmProof}>确认</Button>
            </Space>
          }
        >
          <div style={{ padding: '0 8px' }}>
            <Form form={proofForm} layout="vertical">
              <Form.Item label="上传支付凭证" name="proofUrl">
                <Input placeholder="自动填充" disabled />
              </Form.Item>
              <Upload
                accept="image/*"
                listType="picture-card"
                maxCount={1}
                fileList={proofFileList}
                onRemove={() => { proofForm.setFieldsValue({ proofUrl: undefined }); setProofFileList([]); return true; }}
                beforeUpload={(file) => { void uploadProofImage(file as File); return Upload.LIST_IGNORE; }}
              >
                {proofFileList.length === 0 && (
                  <div><UploadOutlined /><div style={{ marginTop: 8 }}>上传凭证</div></div>
                )}
              </Upload>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="选填" />
              </Form.Item>
            </Form>
          </div>
        </ResizableModal>
    </Layout>
  );
};

export default PaymentCenterPage;
