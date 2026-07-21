/**
 * 我的账单 Tab — 租户用户查看自己的套餐概览、账单记录、申请发票
 * + 我的应用订阅（App Store 开通记录 + 续费到期提醒）
 * 独立组件，在 Profile（个人中心）页面中作为 Tab 使用
 *
 * 拆分说明：业务逻辑在 useMyBillingTabData，列定义在 myBilling/columns，
 *           常量/纯函数在 myBilling/helpers，弹窗/卡片为独立子组件（myBilling/）。
 */
import React from 'react';
import { Card, Space, Button, Empty } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import useMyBillingTabData from './myBilling/useMyBillingTabData';
import { buildBillColumns } from './myBilling/columns';
import ExpiringAppsAlert from './myBilling/ExpiringAppsAlert';
import BillingOverviewCards from './myBilling/BillingOverviewCards';
import MyAppsSubscriptionCard from './myBilling/MyAppsSubscriptionCard';
import PayModal from './myBilling/PayModal';
import InvoiceModal from './myBilling/InvoiceModal';
import InvoiceInfoModal from './myBilling/InvoiceInfoModal';

interface MyBillingTabProps {
  /** 嵌入模式：隐藏与 MyModulesTab 重复的概览卡片和应用订阅表格 */
  embedded?: boolean;
}

const MyBillingTab: React.FC<MyBillingTabProps> = ({ embedded = false }) => {
  const {
    overview,
    bills,
    myApps,
    loading,
    invoiceModalVisible,
    setInvoiceModalVisible,
    invoiceInfoModalVisible,
    setInvoiceInfoModalVisible,
    currentBill,
    payModalVisible,
    setPayModalVisible,
    payingBill,
    invoiceForm,
    invoiceInfoForm,
    invoiceSubmitting,
    invoiceInfoSubmitting,
    expiringApps,
    fetchData,
    handleRequestInvoice,
    handleSubmitInvoice,
    handlePay,
    copyText,
    handleOpenInvoiceInfo,
    handleSaveInvoiceInfo,
  } = useMyBillingTabData();

  const billColumns = buildBillColumns({
    onPay: handlePay,
    onRequestInvoice: handleRequestInvoice,
  });

  return (
    <div>
      {/* ===== 续费到期提醒（30天内到期） ===== */}
      <ExpiringAppsAlert expiringApps={expiringApps} />

      {/* 套餐概览卡片（嵌入模式下隐藏，由 MyModulesTab 展示） */}
      {!embedded && (
        <BillingOverviewCards overview={overview} onOpenInvoiceInfo={handleOpenInvoiceInfo} />
      )}

      {/* ===== 我的应用订阅（嵌入模式下隐藏，由 MyModulesTab 展示） ===== */}
      {!embedded && (
        <MyAppsSubscriptionCard myApps={myApps} loading={loading} onRefresh={fetchData} />
      )}

      {/* ===== 账单记录（平台订阅月账单） ===== */}
      <Card
        title={<Space><AppstoreOutlined />账单记录</Space>}

        extra={<Button type="link" onClick={handleOpenInvoiceInfo}>开票信息设置</Button>}
      >
        <ResizableTable
          storageKey="profile-my-billing"
          rowKey="id"
          dataSource={bills}
          columns={billColumns}
          loading={loading}
          pagination={false}

          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="暂无账单记录" /> }}
        />
      </Card>

      {/* 快捷付款弹窗 */}
      <PayModal
        open={payModalVisible}
        payingBill={payingBill}
        onClose={() => setPayModalVisible(false)}
        onCopy={copyText}
      />

      {/* 申请开票弹窗 */}
      <InvoiceModal
        open={invoiceModalVisible}
        currentBill={currentBill}
        form={invoiceForm}
        submitting={invoiceSubmitting}
        onClose={() => setInvoiceModalVisible(false)}
        onSubmit={handleSubmitInvoice}
      />

      {/* 维护默认开票信息弹窗 */}
      <InvoiceInfoModal
        open={invoiceInfoModalVisible}
        form={invoiceInfoForm}
        submitting={invoiceInfoSubmitting}
        onClose={() => setInvoiceInfoModalVisible(false)}
        onSubmit={handleSaveInvoiceInfo}
      />
    </div>
  );
};

export default MyBillingTab;
