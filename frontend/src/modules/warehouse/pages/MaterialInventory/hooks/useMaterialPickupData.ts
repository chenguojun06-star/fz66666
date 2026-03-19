import { useState, useCallback } from 'react';
import { Form } from 'antd';
import { useModal, useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';

export interface MaterialPickupRecord {
  id: string;
  pickupNo: string;
  pickupType: 'INTERNAL' | 'EXTERNAL';
  orderNo?: string;
  styleNo?: string;
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  specification?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount?: number;
  pickerId?: string;
  pickerName?: string;
  pickupTime?: string;
  auditStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  auditorName?: string;
  auditTime?: string;
  auditRemark?: string;
  financeStatus: 'PENDING' | 'SETTLED';
  financeRemark?: string;
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

  const pagination = useTablePagination(20);

  // 弹窗
  const createModal  = useModal<null>();
  const auditModal   = useModal<MaterialPickupRecord>();
  const financeModal = useModal<MaterialPickupRecord>();

  // 表单
  const [createForm] = Form.useForm();
  const [auditForm]  = Form.useForm();
  const [financeForm] = Form.useForm();

  // 操作状态
  const [creating, setCreating]   = useState(false);
  const [auditing, setAuditing]   = useState(false);
  const [settling, setSettling]   = useState(false);

  // ===== 查询 =====
  const fetchData = useCallback(async (opt?: { silent?: boolean; page?: number }) => {
    if (!opt?.silent) setLoading(true);
    try {
      const res = await api.post('/warehouse/material-pickup/list', {
        page: opt?.page ?? pagination.pagination.current ?? 1,
        pageSize: pagination.pagination.pageSize ?? 20,
        keyword:       keyword       || undefined,
        pickupType:    pickupType    || undefined,
        auditStatus:   auditStatus   || undefined,
        financeStatus: financeStatus || undefined,
        orderNo:       orderNo       || undefined,
        styleNo:       styleNo       || undefined,
      });
      const data = res?.data ?? res;
      setDataSource(Array.isArray(data?.records) ? data.records : []);
      pagination.setTotal?.(Number(data?.total ?? 0));
    } catch {
      message.error('加载领取记录失败');
    } finally {
      if (!opt?.silent) setLoading(false);
    }
  }, [keyword, pickupType, auditStatus, financeStatus, orderNo, styleNo, pagination]);

  // ===== 新建 =====
  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await api.post('/warehouse/material-pickup', values);
      message.success('领取记录创建成功');
      createModal.close();
      createForm.resetFields();
      void fetchData();
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  // ===== 审核 =====
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

  // ===== 财务核算 =====
  const handleFinanceSettle = async () => {
    const values = await financeForm.validateFields();
    if (!financeModal.data) return;
    setSettling(true);
    try {
      await api.post(`/warehouse/material-pickup/${financeModal.data.id}/finance-settle`, values);
      message.success('财务核算完成');
      financeModal.close();
      financeForm.resetFields();
      void fetchData();
    } catch {
      message.error('财务核算操作失败');
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
    // 分页
    pagination,
    // 弹窗
    createModal, auditModal, financeModal,
    // 表单
    createForm, auditForm, financeForm,
    // 加载状态
    creating, auditing, settling,
    // 操作
    handleCreate, handleAudit, handleFinanceSettle, handleCancel,
    fetchData,
  };
}
