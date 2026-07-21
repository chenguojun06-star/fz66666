/**
 * MyBillingTab 业务逻辑 Hook
 * 集中管理：账单概览/账单记录/我的应用订阅数据加载、申请开票、快捷付款、维护默认开票信息
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Form } from 'antd';
import tenantService from '@/services/tenantService';
import { appStoreService } from '@/services/system/appStore';
import type { MyAppInfo } from '@/services/system/appStore';
import { daysUntilExpiry } from './helpers';

const useMyBillingTabData = () => {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<MyAppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceInfoModalVisible, setInvoiceInfoModalVisible] = useState(false);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [invoiceForm] = Form.useForm();
  const [invoiceInfoForm] = Form.useForm();
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payingBill, setPayingBill] = useState<any>(null);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceInfoSubmitting, setInvoiceInfoSubmitting] = useState(false);

  /** 30天内即将到期（含已过期）的应用，用于顶部提醒 */
  const expiringApps = useMemo(() =>
    (Array.isArray(myApps) ? myApps : []).filter(app => {
      if (!app.endTime) return false;          // 永久有效，无需提醒
      const days = daysUntilExpiry(app.endTime);
      return days !== null && days <= 30;
    }),
    [myApps],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, billsRes, appsRes]: any[] = await Promise.all([
        tenantService.getMyBilling(),
        tenantService.listMyBills({ page: 1, pageSize: 50 }),
        appStoreService.getMyApps().catch(() => []),   // 失败不影响主账单
      ]);
      setOverview(overviewRes?.data || overviewRes);
      const billData = billsRes?.data || billsRes;
      setBills(Array.isArray(billData) ? billData : (billData?.records || []));
      const appsData = Array.isArray(appsRes) ? appsRes : (appsRes?.records || appsRes?.data || []);
      setMyApps(appsData);
    } catch {
      message.error('加载账单数据失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---------- 申请开票 ----------
  const handleRequestInvoice = (record: any) => {
    setCurrentBill(record);
    const defaults = overview?.invoiceDefaults || {};
    invoiceForm.setFieldsValue({
      invoiceTitle: record.invoiceTitle || defaults.invoiceTitle || '',
      invoiceTaxNo: record.invoiceTaxNo || defaults.invoiceTaxNo || '',
      invoiceBankName: record.invoiceBankName || defaults.invoiceBankName || '',
      invoiceBankAccount: record.invoiceBankAccount || defaults.invoiceBankAccount || '',
      invoiceAddress: record.invoiceAddress || defaults.invoiceAddress || '',
      invoicePhone: record.invoicePhone || defaults.invoicePhone || '',
    });
    setInvoiceModalVisible(true);
  };

  const handleSubmitInvoice = async () => {
    setInvoiceSubmitting(true);
    try {
      const values = await invoiceForm.validateFields();
      await tenantService.requestInvoice(currentBill.id, values);
      message.success('发票申请已提交');
      setInvoiceModalVisible(false);
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '申请失败');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  // ---------- 快捷付款 ----------
  const handlePay = (record: any) => {
    setPayingBill(record);
    setPayModalVisible(true);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(`${label}已复制到剪贴板`);
    }).catch(() => {
      message.error('复制失败，请手动复制');
    });
  };

  // ---------- 默认开票信息 ----------
  const handleOpenInvoiceInfo = () => {
    const defaults = overview?.invoiceDefaults || {};
    invoiceInfoForm.setFieldsValue(defaults);
    setInvoiceInfoModalVisible(true);
  };

  const handleSaveInvoiceInfo = async () => {
    setInvoiceInfoSubmitting(true);
    try {
      const values = await invoiceInfoForm.validateFields();
      await tenantService.updateMyInvoiceInfo(values);
      message.success('开票信息已保存');
      setInvoiceInfoModalVisible(false);
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setInvoiceInfoSubmitting(false);
    }
  };

  return {
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
  };
};

export type MyBillingTabData = ReturnType<typeof useMyBillingTabData>;

export default useMyBillingTabData;
