import React, { useCallback, useMemo, useState } from 'react';
import { useSync } from '@/utils/syncManager';
import AccountManagementModal from './components/AccountManagementModal';
import BillSummaryTab from './components/BillSummaryTab';
import PayModal from './components/PayModal';
import PaymentDetailModal from './components/PaymentDetailModal';
import ProofUploadModal from './components/ProofUploadModal';
import AmountDetailModal from './components/AmountDetailModal';
import StatsCards from './components/StatsCards';
import PendingTabContent from './components/PendingTabContent';
import RecordsTabContent from './components/RecordsTabContent';
import { App, Button, Card, Tabs, Tag } from 'antd';
import {
  CheckCircleOutlined,
  DollarOutlined,
  PayCircleOutlined,
  AccountBookOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { formatMoney } from '@/utils/format';
import {
  BIZ_TYPE_MAP,
  wagePaymentApi,
} from '@/services/finance/wagePaymentApi';
import { usePaymentColumns } from './hooks/usePaymentColumns';
import { usePaymentData } from './hooks/usePaymentData';
import { usePayModal } from './hooks/usePayModal';
import { useAccountModal } from './hooks/useAccountModal';
import { useProofModal } from './hooks/useProofModal';
import { useWagePayment } from './useWagePayment';

// ============================================================
// 主组件 — 收付款中心
// ============================================================
const PaymentCenterPage: React.FC = () => {
  const { message: msg } = App.useApp();

  // ---- 数据与业务逻辑 ----
  const data = usePaymentData({ msg });
  const pay = usePayModal({ msg, fetchPayables: data.fetchPayables, fetchPayments: data.fetchPayments, reportSmartError: data.reportSmartError });
  const acct = useAccountModal({ msg, reportSmartError: data.reportSmartError, showSmartErrorNotice: data.showSmartErrorNotice, setSmartError: data.setSmartError });
  const proof = useProofModal({ msg, reportSmartError: data.reportSmartError, showSmartErrorNotice: data.showSmartErrorNotice, setSmartError: data.setSmartError, fetchPayments: data.fetchPayments, fetchPayables: data.fetchPayables });

  const { detailOpen, setDetailOpen, detailRecord, setDetailRecord } = useWagePayment();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleOpenPayModal = useCallback(() => pay.openPayModal(), [pay.openPayModal]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleClearSelectedPayableKeys = useCallback(() => data.setSelectedPayableKeys([]), [data.setSelectedPayableKeys]);

  // ---- 数据同步（45秒轮询，与 MaterialReconciliation 一致） ----
  useSync(
    'wage-payment-list',
    async () => {
      try {
        if (data.activeTab === 'pending') {
          const res: any = await wagePaymentApi.listPendingPayables(data.payableBizType || undefined);
          return { records: res?.data ?? res ?? [], tab: 'pending' };
        } else {
          const res: any = await wagePaymentApi.listPayments(data.filterValuesRef.current);
          return { records: res?.data ?? res ?? [], tab: 'records' };
        }
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        if (newData.tab === 'pending') {
          void data.fetchPayables();
        } else {
          void data.fetchPayments();
        }
      }
    },
    { interval: 45000, enabled: !data.payablesLoading && !data.paymentsLoading && !pay.payModalOpen && !acct.accountModalOpen, pauseOnHidden: true },
  );

  const [amountDetailOpen, setAmountDetailOpen] = React.useState(false);
  const [amountDetailTarget, setAmountDetailTarget] = React.useState<any>(null);
  const [paymentStatusTab, setPaymentStatusTab] = useState<string>('');

  // ==================== 统计卡片 ====================
  // 待收付款 (payables) 统计
  const pendingStats = useMemo(() => {
    const total = data.payables.length;
    const totalAmount = data.payables.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const reconCount = data.payables.filter((p: any) => p.bizType === 'RECONCILIATION').length;
    const reimbCount = data.payables.filter((p: any) => p.bizType === 'REIMBURSEMENT').length;
    const payrollCount = data.payables.filter((p: any) => p.bizType === 'PAYROLL' || p.bizType === 'PAYROLL_SETTLEMENT').length;
    return { total, totalAmount, reconCount, reimbCount, payrollCount };
  }, [data.payables]);

  // 收支记录 (payments) 统计
  const paymentStats = useMemo(() => {
    const total = data.payments.length;
    const pendingCount = data.payments.filter((p: any) => p.status === 'pending' || p.status === 'processing').length;
    const successCount = data.payments.filter((p: any) => p.status === 'success').length;
    const rejectedCount = data.payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled').length;
    const totalAmount = data.payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const successAmount = data.payments.filter((p: any) => p.status === 'success').reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    return { total, pendingCount, successCount, rejectedCount, totalAmount, successAmount };
  }, [data.payments]);

  // ---- 表格列定义 ----
  const { payableColumns, paymentColumns } = usePaymentColumns({
    openPayModal: pay.openPayModal,
    handleRejectPayable: data.handleRejectPayable,
    openAccountModal: acct.openAccountModal,
    setDetailRecord,
    setDetailOpen,
    openProofModal: proof.openProofModal,
    handleCancel: data.handleCancel,
    fetchPayments: data.fetchPayments,
    msg,
    onAmountClick: (record) => { setAmountDetailTarget(record); setAmountDetailOpen(true); },
  });

  // Tab 切换后的过滤数据
  const statusFilteredPayables = useMemo(() => data.filteredPayables, [data.filteredPayables]);

  const statusFilteredPayments = useMemo(() => {
    if (!paymentStatusTab) return data.payments;
    if (paymentStatusTab === 'pending') return data.payments.filter((p: any) => p.status === 'pending' || p.status === 'processing');
    if (paymentStatusTab === 'success') return data.payments.filter((p: any) => p.status === 'success');
    if (paymentStatusTab === 'failed') return data.payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled');
    return data.payments;
  }, [data.payments, paymentStatusTab]);

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <>
        {data.showSmartErrorNotice && data.smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={data.smartError}
              onFix={() => {
                if (data.activeTab === 'pending') {
                  void data.fetchPayables();
                } else {
                  void data.fetchPayments();
                }
              }}
            />
          </Card>
        ) : null}

        {/* 页头 */}
        <Card className="page-card" size="small" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                <PayCircleOutlined style={{ marginRight: 8 }} />
                收付款中心
              </h2>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                统一处理所有付款：工资结算、外发结算、物料对账、费用报销
              </span>
            </div>
            <Button type="primary" ghost icon={<DollarOutlined />} onClick={handleOpenPayModal}>
              手动发起支付
            </Button>
          </div>
        </Card>

        {/* ===== 统计卡片（顶部统一） ===== */}
        <StatsCards
          activeTab={data.activeTab}
          pendingStats={pendingStats}
          paymentStats={paymentStats}
          selectedPayableKeysLength={data.selectedPayableKeys.length}
        />

        {/* Tab 切换 */}
        <Card className="page-card" style={{ border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
          <Tabs
            activeKey={data.activeTab}
            onChange={data.setActiveTab}
            destroyOnHidden={false}
            size="small"
            items={[
              {
                key: 'pending',
                label: (
                  <span>
                    <AccountBookOutlined /> 待付款 {pendingStats.total > 0 && <Tag color="red">{pendingStats.total}</Tag>}
                  </span>
                ),
                children: (
                  <PendingTabContent
                    payableColumns={payableColumns}
                    statusFilteredPayables={statusFilteredPayables}
                    payablesLoading={data.payablesLoading}
                    payables={data.payables}
                    payableBizType={data.payableBizType}
                    setPayableBizType={data.setPayableBizType}
                    payableDateRange={data.payableDateRange}
                    setPayableDateRange={data.setPayableDateRange}
                    selectedPayableKeys={data.selectedPayableKeys}
                    setSelectedPayableKeys={data.setSelectedPayableKeys}
                    batchPaySubmitting={data.batchPaySubmitting}
                    handleBatchPay={data.handleBatchPay}
                    handleClearSelectedPayableKeys={handleClearSelectedPayableKeys}
                  />
                ),
              },
              {
                key: 'records',
                label: (
                  <span>
                    <CheckCircleOutlined /> 收支记录
                  </span>
                ),
                children: (
                  <RecordsTabContent
                    paymentColumns={paymentColumns}
                    statusFilteredPayments={statusFilteredPayments}
                    paymentsLoading={data.paymentsLoading}
                    payments={data.payments}
                    paymentStatusTab={paymentStatusTab}
                    setPaymentStatusTab={setPaymentStatusTab}
                    filterValuesRef={data.filterValuesRef}
                    fetchPayments={data.fetchPayments}
                  />
                ),
              },
              {
                key: 'receivable',
                label: (
                  <span>
                    <FileTextOutlined /> 应收账单
                  </span>
                ),
                children: <BillSummaryTab defaultBillType="RECEIVABLE" />,
              },
              {
                key: 'payable',
                label: (
                  <span>
                    <FileTextOutlined /> 应付账单
                  </span>
                ),
                children: <BillSummaryTab defaultBillType="PAYABLE" />,
              },
            ]}
          />
        </Card>

        {/* ========================== 发起支付弹窗 ========================== */}
        <PayModal
          payModalOpen={pay.payModalOpen}
          setPayModalOpen={pay.setPayModalOpen}
          currentPayable={pay.currentPayable}
          payForm={pay.payForm}
          paySubmitting={pay.paySubmitting}
          payeeSearching={pay.payeeSearching}
          payeeOptions={pay.payeeOptions}
          selectedMethod={pay.selectedMethod}
          selectedAccount={pay.selectedAccount}
          handlePaySubmit={pay.handlePaySubmit}
          handlePayeeTypeChange={pay.handlePayeeTypeChange}
          handlePayeeSearch={pay.handlePayeeSearch}
          handlePayeeSelect={pay.handlePayeeSelect}
          handleMethodSelect={pay.handleMethodSelect}
          openAccountModal={acct.openAccountModal}
        />

        {/* ========================== 账户管理弹窗 ========================== */}
        <AccountManagementModal
          open={acct.accountModalOpen}
          ownerName={acct.accountOwnerName}
          ownerType={acct.accountOwnerType}
          accounts={acct.accounts}
          accountsLoading={acct.accountsLoading}
          accountForm={acct.accountForm}
          accountDetailOpen={acct.accountDetailOpen}
          editingAccount={acct.editingAccount}
          qrFileList={acct.qrFileList}
          accountSaving={acct.accountSaving}
          onClose={() => acct.setAccountModalOpen(false)}
          setAccountDetailOpen={acct.setAccountDetailOpen}
          setEditingAccount={acct.setEditingAccount}
          setQrFileList={acct.setQrFileList}
          onEditAccount={acct.handleEditAccount}
          onDeleteAccount={acct.handleDeleteAccount}
          onSaveAccount={acct.handleSaveAccount}
          onUploadQrImage={acct.uploadQrImage}
        />

        {/* ========================== 支付详情弹窗 ========================== */}
        <PaymentDetailModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          detailRecord={detailRecord}
        />

        {/* ========================== 上传凭证弹窗 ========================== */}
        <ProofUploadModal
          proofModalOpen={proof.proofModalOpen}
          setProofModalOpen={proof.setProofModalOpen}
          proofForm={proof.proofForm}
          proofSubmitting={proof.proofSubmitting}
          proofFileList={proof.proofFileList}
          setProofFileList={proof.setProofFileList}
          handleConfirmProof={proof.handleConfirmProof}
          uploadProofImage={proof.uploadProofImage}
        />

        {/* ========================== 驳回待收付款弹窗 ========================== */}
        <RejectReasonModal
          open={!!data.pendingRejectPayable}
          title="驳回待收付款"
          description={data.pendingRejectPayable ? `确定驳回 ${data.pendingRejectPayable.payeeName} 的待收付款项？${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType]?.text ? `\n${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType].text} · ${formatMoney(data.pendingRejectPayable.amount)}` : ''}` : undefined}
          onOk={data.handleRejectPayableConfirm}
          onCancel={() => data.setPendingRejectPayable(null)}
          loading={data.rejectPayableLoading}
        />

        {/* ========================== 账单明细弹窗 ========================== */}
        <AmountDetailModal
          open={amountDetailOpen}
          onClose={() => { setAmountDetailOpen(false); setAmountDetailTarget(null); }}
          target={amountDetailTarget}
        />
      </>
  );
};

export default PaymentCenterPage;
