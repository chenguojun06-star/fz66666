import { useState, useCallback, useEffect } from 'react';
import { Form } from 'antd';
import { useModal, useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';

export interface PaymentCenterItem {
  factoryName: string;
  factoryType?: string;
  orderBizType?: string;
  totalAmount: number;
  pendingAmount: number;
  settledAmount: number;
  totalCount: number;
  pendingCount: number;
  settledCount: number;
  records: MaterialPickupRecord[];
}

export interface MaterialPickupRecord {
  id: string;
  pickupNo: string;
  pickupType: 'INTERNAL' | 'EXTERNAL';
  movementType?: 'INBOUND' | 'OUTBOUND';
  sourceType?: string;
  usageType?: string;
  sourceDocumentNo?: string;
  orderNo?: string;
  styleNo?: string;
  factoryName?: string;
  factoryType?: string;
  orderBizType?: string;
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  specification?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount?: number;
  pickerId?: string;
  pickerName?: string;
  receiverId?: string;
  receiverName?: string;
  issuerId?: string;
  issuerName?: string;
  warehouseLocation?: string;
  pickupTime?: string;
  auditStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  auditorName?: string;
  auditTime?: string;
  auditRemark?: string;
  financeStatus: 'PENDING' | 'SETTLED';
  financeRemark?: string;
  receivableId?: string;
  receivableNo?: string;
  receivableStatus?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  receivedAmount?: number;
  receivedTime?: string;
  remark?: string;
  createTime?: string;
}

export function useMaterialPickupData() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<MaterialPickupRecord[]>([]);

  // 过滤条件
  const [keyword, setKeyword]           = useState('');
  const [pickupType, setPickupType]     = useState<string>('');
  const [auditStatus, setAuditStatus]   = useState<string>('');
  const [financeStatus, setFinanceStatus] = useState<string>('');
  const [orderNo, setOrderNo]           = useState('');
  const [styleNo, setStyleNo]           = useState('');
  const [factoryName, setFactoryName]   = useState('');
  const [factoryType, setFactoryType]   = useState<string>('');

  const pagination = useTablePagination(20, 'material-pickup-records');
  const { current, pageSize } = pagination.pagination;
  const { setPageSize, setTotal } = pagination;
  const paymentPagination = useTablePagination(20, 'material-payment-center');
  const { pageSize: paymentPageSize } = paymentPagination.pagination;
  const { setPageSize: setPaymentPageSize, setTotal: setPaymentTotal } = paymentPagination;

  useEffect(() => {
    if (pageSize < 20) {
      setPageSize(20);
    }
  }, [pageSize, setPageSize]);

  useEffect(() => {
    if (paymentPageSize < 20) {
      setPaymentPageSize(20);
    }
  }, [paymentPageSize, setPaymentPageSize]);

  // 弹窗
  const auditModal   = useModal<MaterialPickupRecord>();
  const financeModal = useModal<MaterialPickupRecord>();

  // 表单
  const [auditForm]  = Form.useForm();
  const [financeForm] = Form.useForm();

  // 操作状态
  const [auditing, setAuditing]   = useState(false);
  const [settling, setSettling]   = useState(false);

  // ===== 批量审核 =====
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const batchAuditModal = useModal<null>();
  const [batchAuditForm] = Form.useForm();
  const [batchAuditing, setBatchAuditing] = useState(false);

  // ===== 收款中心 =====
  const [paymentCenterData, setPaymentCenterData] = useState<PaymentCenterItem[]>([]);
  const [paymentCenterLoading, setPaymentCenterLoading] = useState(false);
  const [paymentSettling, setPaymentSettling] = useState(false);

  // ===== 查询 =====
  const fetchData = useCallback(async (opt?: { silent?: boolean; page?: number }) => {
    if (!opt?.silent) setLoading(true);
    try {
      const res = await api.post('/warehouse/material-pickup/list', {
        page: opt?.page ?? current ?? 1,
        pageSize: pageSize ?? 20,
        keyword:       keyword       || undefined,
        pickupType:    pickupType    || undefined,
        auditStatus:   auditStatus   || undefined,
        financeStatus: financeStatus || undefined,
        orderNo:       orderNo       || undefined,
        styleNo:       styleNo       || undefined,
        factoryName:   factoryName   || undefined,
        factoryType:   factoryType   || undefined,
      });
      const data = res?.data ?? res;
      setDataSource(Array.isArray(data?.records) ? data.records : []);
      setTotal(Number(data?.total ?? 0));
    } catch {
      message.error('加载领取记录失败');
    } finally {
      if (!opt?.silent) setLoading(false);
    }
  }, [auditStatus, current, factoryName, factoryType, financeStatus, keyword, orderNo, pageSize, pickupType, setTotal, styleNo]);

  useEffect(() => {
    void fetchData({ silent: true });
  }, [fetchData]);

  // ===== 审核（单条）=====
  const handleAudit = async () => {
    const values = await auditForm.validateFields();
    if (!auditModal.data) return;
    setAuditing(true);
    try {
      await api.post(`/warehouse/material-pickup/${auditModal.data.id}/audit`, values);
      message.success(values.action === 'approve' ? '已审核通过' : '已拒绝');
      auditModal.close();
      auditForm.resetFields();
      void fetchData();
    } catch {
      message.error('审核操作失败');
    } finally {
      setAuditing(false);
    }
  };

  // ===== 批量审核 =====
  const handleBatchAudit = async () => {
    const values = await batchAuditForm.validateFields();
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要审核的记录');
      return;
    }
    setBatchAuditing(true);
    try {
      await api.post('/warehouse/material-pickup/batch-audit', {
        ids: selectedRowKeys,
        action: values.action,
        remark: values.remark,
      });
      message.success(`已批量${values.action === 'approve' ? '通过' : '拒绝'} ${selectedRowKeys.length} 条记录`);
      batchAuditModal.close();
      batchAuditForm.resetFields();
      setSelectedRowKeys([]);
      void fetchData();
    } catch {
      message.error('批量审核失败，请重试');
    } finally {
      setBatchAuditing(false);
    }
  };

  // ===== 账单补录/修正 =====
  const handleFinanceSettle = async () => {
    const values = await financeForm.validateFields();
    if (!financeModal.data) return;
    setSettling(true);
    try {
      await api.post(`/warehouse/material-pickup/${financeModal.data.id}/finance-settle`, values);
      message.success('应收账单已同步');
      financeModal.close();
      financeForm.resetFields();
      void fetchData();
    } catch {
      message.error('账单同步失败');
    } finally {
      setSettling(false);
    }
  };

  // ===== 作废 =====
  const handleCancel = async (id: string) => {
    try {
      await api.post(`/warehouse/material-pickup/${id}/cancel`);
      message.success('已作废');
      void fetchData();
    } catch {
      message.error('作废失败');
    }
  };

  // ===== 收款中心 =====
  const fetchPaymentCenter = useCallback(async (params?: object) => {
    setPaymentCenterLoading(true);
    try {
      const res = await api.post('/warehouse/material-pickup/payment-center/list', params ?? {});
      const data = res?.data ?? res;
      const records = Array.isArray(data) ? data : [];
      setPaymentCenterData(records);
      setPaymentTotal(records.length);
    } catch {
      message.error('加载收款中心失败');
    } finally {
      setPaymentCenterLoading(false);
    }
  }, [setPaymentTotal]);

  const handlePaymentSettle = async (ids: string[], remark?: string) => {
    setPaymentSettling(true);
    try {
      await api.post('/warehouse/material-pickup/payment-center/settle', { ids, remark });
      message.success(`已登记 ${ids.length} 条记录的收款`);
      void fetchPaymentCenter();
    } catch {
      message.error('登记收款失败，请重试');
    } finally {
      setPaymentSettling(false);
    }
  };

  return {
    // 数据
    loading, dataSource,
    // 过滤
    keyword, setKeyword,
    pickupType, setPickupType,
    auditStatus, setAuditStatus,
    financeStatus, setFinanceStatus,
    orderNo, setOrderNo,
    styleNo, setStyleNo,
    factoryName, setFactoryName,
    factoryType, setFactoryType,
    // 分页
    pagination, paymentPagination,
    // 弹窗
    auditModal, financeModal, batchAuditModal,
    // 表单
    auditForm, financeForm, batchAuditForm,
    // 加载状态
    auditing, settling, batchAuditing, paymentSettling,
    // 批量选择
    selectedRowKeys, setSelectedRowKeys,
    // 操作
    handleAudit, handleBatchAudit,
    handleFinanceSettle, handleCancel,
    fetchData,
    // 收款中心
    paymentCenterData, paymentCenterLoading,
    fetchPaymentCenter, handlePaymentSettle,
  };
}
