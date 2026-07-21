import React, { useMemo } from 'react';
import { Select, Space, Typography, Divider } from 'antd';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import ResizableTable from '@/components/common/ResizableTable';
import { useBillingTabData } from './billing/hooks/useBillingTabData';
import { getTenantColumns, getBillColumns } from './billing/columns';
import { BILL_STATUS } from './billing/helpers';
import PlanModal from './billing/components/PlanModal';
import OverviewModal from './billing/components/OverviewModal';
import IssueInvoiceModal from './billing/components/IssueInvoiceModal';

// ========== 套餐与收费 Tab ==========
const BillingTab: React.FC = () => {
  const {
    // 租户列表
    tenants,
    loading,
    plans,
    // 套餐弹窗
    planModal,
    planForm,
    planSaving,
    // 概览弹窗
    overviewModal,
    overview,
    overviewLoading,
    // 账单列表
    bills,
    billsTotal,
    billsLoading,
    billParams,
    setBillParams,
    // 减免弹窗
    pendingWaiveBill,
    setPendingWaiveBill,
    waiveBillLoading,
    handleWaiveConfirm,
    // 开票弹窗
    pendingIssueInvoiceBill,
    setPendingIssueInvoiceBill,
    invoiceNoValue,
    setInvoiceNoValue,
    issueInvoiceLoading,
    handleIssueInvoiceConfirm,
    // 事件处理
    handleOpenPlanModal,
    handlePlanTypeChange,
    handleBillingCycleChange,
    handleSavePlan,
    handleOpenOverview,
    handleGenerateBill,
    handleMarkBillPaid,
    handleWaiveBill,
    handleIssueInvoice,
  } = useBillingTabData();

  const tenantColumns = useMemo(() => getTenantColumns({
    handleOpenPlanModal,
    handleOpenOverview,
    handleGenerateBill,
  }), [handleOpenPlanModal, handleOpenOverview, handleGenerateBill]);

  const billColumns = useMemo(() => getBillColumns({
    handleMarkBillPaid,
    handleWaiveBill,
    handleIssueInvoice,
  }), [handleMarkBillPaid, handleWaiveBill, handleIssueInvoice]);

  return (
    <div>
      {/* 租户套餐列表 */}
      <Typography.Title level={5} style={{ marginBottom: 12 }}> 租户套餐一览</Typography.Title>
      <ResizableTable
        storageKey="customer-billing-tenants"
        rowKey="id"
        columns={tenantColumns}
        dataSource={tenants}
        loading={loading}
        emptyDescription="暂无财务数据"
        pagination={false}

      />

      <Divider />

      {/* 账单列表 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}> 账单记录</Typography.Title>
        <Space>
          <Select
            placeholder="筛选租户"
            allowClear
            style={{ width: 160 }}
            onChange={(v) => setBillParams(p => ({ ...p, tenantId: v, page: 1 }))}
            options={tenants.map(t => ({ label: t.tenantName, value: t.id }))}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => setBillParams(p => ({ ...p, status: v || '', page: 1 }))}
            options={Object.entries(BILL_STATUS).map(([k, v]) => ({ label: v.label, value: k }))}
          />
        </Space>
      </div>
      <ResizableTable
        storageKey="customer-billing-records"
        rowKey="id"
        columns={billColumns}
        dataSource={bills}
        loading={billsLoading}
        emptyDescription="暂无财务数据"
        pagination={{
          current: billParams.page, pageSize: billParams.pageSize, total: billsTotal,
          onChange: (p, ps) => setBillParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}

      />

      {/* 设置套餐弹窗 */}
      <PlanModal
        open={planModal.visible}
        data={planModal.data}
        plans={plans}
        form={planForm}
        planSaving={planSaving}
        onCancel={planModal.close}
        onSave={handleSavePlan}
        onPlanTypeChange={handlePlanTypeChange}
        onBillingCycleChange={handleBillingCycleChange}
      />

      {/* 账单详情弹窗 */}
      <OverviewModal
        open={overviewModal.visible}
        data={overviewModal.data}
        overview={overview}
        overviewLoading={overviewLoading}
        onClose={overviewModal.close}
      />

      {/* 开票弹窗 */}
      <IssueInvoiceModal
        bill={pendingIssueInvoiceBill}
        invoiceNoValue={invoiceNoValue}
        loading={issueInvoiceLoading}
        onInvoiceNoChange={setInvoiceNoValue}
        onOk={handleIssueInvoiceConfirm}
        onCancel={() => setPendingIssueInvoiceBill(null)}
      />

      {/* 减免原因弹窗 */}
      <RejectReasonModal
        open={pendingWaiveBill !== null}
        title={`减免账单 ${pendingWaiveBill?.billingNo || ''}`}
        fieldLabel="减免原因"
        required={false}
        okDanger={false}
        okText="确认减免"
        loading={waiveBillLoading}
        onOk={handleWaiveConfirm}
        onCancel={() => setPendingWaiveBill(null)}
      />
    </div>
  );
};

export default BillingTab;
