import React, { useState, useEffect } from 'react';
import { Button, Card, Dropdown, Input, Select, Space, Tag, Form, message, Modal } from 'antd';
import { CheckOutlined, DownloadOutlined, MoreOutlined, PlusOutlined, RollbackOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import MaterialReconModalContent from '@/components/Finance/MaterialReconModalContent';
import { MaterialReconciliation as MaterialReconType, MaterialReconQueryParams } from '@/types/finance';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import errorHandler from '@/utils/errorHandler';
import { formatDateTime } from '@/utils/datetime';
import { unwrapApiData } from '@/utils/api';
import { getMaterialReconStatusConfig, materialReconStatusTransitions } from '@/constants/finance';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/authContext';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';

const { Option } = Select;

const MaterialReconciliation: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // 获取当前用户信息
  const { isMobile, modalWidth } = useViewport();
  const [visible, setVisible] = useState(false);
  const [currentRecon, setCurrentRecon] = useState<MaterialReconType | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryParams, setQueryParams] = useState<MaterialReconQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [filterForm] = Form.useForm();
  const saveFormRef = React.useRef<(() => Promise<void>) | null>(null);

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  // 真实数据状态
  const [reconciliationList, setReconciliationList] = useState<MaterialReconType[]>([]);
  const [loading, setLoading] = useState(false); // 列表加载状态
  const [queryLoading, setQueryLoading] = useState(false); // 查询按钮加载状态
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false); // 表单提交加载状态
  const [approvalSubmitting, setApprovalSubmitting] = useState(false); // 状态更新加载状态
  const [exporting, setExporting] = useState(false);

  const escapeCsvCell = (value: unknown) => {
    const text = String(value ?? '');
    if (/[\r\n",]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fileStamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const buildMaterialReconCsv = (rows: MaterialReconType[]) => {
    const header = ['对账单号', '供应商', '物料编码', '物料名称', '采购单号', '订单号', '款号', '数量', '单价(元)', '总金额(元)', '对账日期', '状态'];
    const lines = [header.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      const st = getMaterialReconStatusConfig((r as Record<string, unknown>)?.status);
      const row = [
        String((r as Record<string, unknown>)?.reconciliationNo || '').trim(),
        String((r as Record<string, unknown>)?.supplierName || '').trim(),
        String((r as Record<string, unknown>)?.materialCode || '').trim(),
        String((r as Record<string, unknown>)?.materialName || '').trim(),
        String((r as Record<string, unknown>)?.purchaseNo || '').trim(),
        String((r as Record<string, unknown>)?.orderNo || '').trim(),
        String((r as Record<string, unknown>)?.styleNo || '').trim(),
        String(Number((r as Record<string, unknown>)?.quantity ?? 0) || 0),
        (r as Record<string, unknown>)?.unitPrice == null ? '' : String(Number((r as Record<string, unknown>)?.unitPrice || 0).toFixed(2)),
        (r as Record<string, unknown>)?.totalAmount == null ? '' : String(Number((r as Record<string, unknown>)?.totalAmount || 0).toFixed(2)),
        String(formatDateTime((r as Record<string, unknown>)?.reconciliationDate) || ''),
        String(st?.text || ''),
      ];
      lines.push(row.map(escapeCsvCell).join(','));
    }
    return `\ufeff${lines.join('\n')}`;
  };

  const fetchAllForExport = async () => {
    const pageSize = 200;
    let page = 1;
    let total = Infinity;
    const all: MaterialReconType[] = [];
    while (all.length < total) {
      const res = await materialReconciliationApi.getMaterialReconciliationList({ ...queryParams, page, pageSize });
      const data = unwrapApiData<unknown>(res, '获取物料对账列表失败');
      const records = (data?.records || []) as MaterialReconType[];
      total = Number(data?.total ?? records.length ?? 0);
      all.push(...records);
      if (!records.length) break;
      if (records.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }
    return all;
  };

  const exportSelectedCsv = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String((r as Record<string, unknown>)?.id)));
    if (!picked.length) {
      message.warning('请先勾选要导出的对账单');
      return;
    }
    const csv = buildMaterialReconCsv(picked);
    downloadTextFile(`物料对账_勾选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportFilteredCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllForExport();
      if (!rows.length) {
        message.info('暂无记录可导出');
        return;
      }
      const csv = buildMaterialReconCsv(rows);
      downloadTextFile(`物料对账_筛选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (e: unknown) {
      errorHandler.handleApiError(e, '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = () => {
    if (selectedRowKeys.length) {
      exportSelectedCsv();
      return;
    }
    exportFilteredCsv();
  };

  const batchAudit = () => {
    const ids = reconciliationList
      .filter((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending')
      .map((r) => String(r.id || ''));
    if (!ids.length) return;
    if (ids.length !== selectedRowKeys.length) message.warning('仅可批量审核状态为“待审核”的对账单');
    updateStatusBatch(ids.map((id) => ({ id, status: 'verified' })), '审核成功');
  };

  const batchSubmit = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'verified' || r.status === 'rejected');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量提交状态为“已验证/已拒绝”的对账单');
    const pairs = eligible.map((r) => ({ id: String(r.id || ''), status: r.status === 'verified' ? 'approved' : 'pending' }));
    await updateStatusBatch(pairs, '提交成功');
    navigate('/finance/payment-approval', { state: { defaultTab: 'material' } });
  };

  const batchReturn = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'verified' || r.status === 'approved' || r.status === 'paid');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量退回状态为“已验证/已批准/已付款”的对账单');
    openReturnModal(eligible.map((r) => String(r.id || '')));
  };

  // 权限判断函数
  const canPerformAction = (action: string) => {
    const permissions = user?.permissions || [];
    if (isSupervisorOrAboveUser(user)) return true;

    // 根据具体操作判断权限
    switch (action) {
      case 'audit':
      case 'submit':
        // 审核和提交操作需要特定权限
        return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      case 'return':
        return false;
      default:
        return true;
    }
  };

  // 使用常量文件中的状态流转规则
  const statusTransitions = materialReconStatusTransitions;

  /**
   * 批量更新物料对账状态
   * @param pairs 状态更新列表，包含id和目标状态
   * @param successText 操作成功提示文本
   */
  const updateStatusBatch = async (pairs: Array<{ id: string; status: string }>, successText: string) => {
    // 标准化处理参数，确保id和status的有效性
    const normalized = pairs
      .map((p) => ({ id: String(p.id || '').trim(), status: String(p.status || '').trim() }))
      .filter((p) => p.id && p.status);
    if (!normalized.length) return;

    // 状态流转校验：检查是否允许从当前状态转换到目标状态
    const invalidTransitions = normalized.filter(p => {
      const record = reconciliationList.find(r => String(r.id) === p.id);
      if (!record) return true; // 找不到记录，视为无效
      const currentStatus = String(record.status || '').trim();
      const allowedTargets = statusTransitions[currentStatus] || [];
      return !allowedTargets.includes(p.status);
    });

    if (invalidTransitions.length) {
      message.error('存在不允许的状态转换，请检查后重试');
      return;
    }

    setApprovalSubmitting(true);
    try {
      // 批量更新状态，使用Promise.allSettled处理部分失败情况
      const settled = await Promise.allSettled(
        normalized.map((p) => materialReconciliationApi.updateMaterialReconciliationStatus(p.id, p.status)),
      );
      // 统计成功和失败数量
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as Record<string, unknown>)?.code === 200).length;
      const failed = normalized.length - okCount;
      if (okCount <= 0) {
        message.error('操作失败');
        return;
      }
      if (failed) message.error(`部分操作失败（${failed}/${normalized.length}）`);
      else message.success(successText);
      // 清除选中的行
      setSelectedRowKeys([]);
      // 刷新物料对账列表
      fetchReconciliationList();
    } catch (e: unknown) {
      errorHandler.handleApiError(e, '操作失败');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const openReturnModal = (ids: string[]) => {
    const normalized = ids.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return;
    let reasonValue = '';
    Modal.confirm({
      title: normalized.length > 1 ? `批量退回（${normalized.length}条）` : '退回',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="退回原因">
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              onChange={(e) => {
                reasonValue = e.target.value;
              }}
            />
          </Form.Item>
        </Form>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reasonValue || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        setApprovalSubmitting(true);
        try {
          const settled = await Promise.allSettled(
            normalized.map((id) => materialReconciliationApi.returnMaterialReconciliation(id, remark)),
          );
          const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as Record<string, unknown>)?.code === 200).length;
          const failed = normalized.length - okCount;
          if (okCount <= 0) {
            message.error('退回失败');
            return;
          }
          if (failed) message.error(`部分退回失败（${failed}/${normalized.length}）`);
          else message.success('退回成功');
          setSelectedRowKeys([]);
          fetchReconciliationList();
        } catch (e: unknown) {
          errorHandler.handleApiError(e, '退回失败');
        } finally {
          setApprovalSubmitting(false);
        }
      },
    });
  };

  /**
   * 获取物料对账列表
   * 从后端API获取物料对账数据，并更新列表状态
   */
  const fetchReconciliationList = async () => {
    setQueryLoading(true);
    setLoading(true);
    try {
      const res = await materialReconciliationApi.getMaterialReconciliationList(queryParams);
      const data = unwrapApiData<unknown>(res, '获取物料对账列表失败');
      setReconciliationList(data.records || []);
      setTotal(data.total || 0);
    } catch (error) {
      const err = error as Record<string, unknown>;
      if (err instanceof Error && err.message) {
        message.error(err.message);
      } else {
        errorHandler.handleApiError(error, '获取物料对账列表失败');
      }
    } finally {
      setLoading(false);
      setQueryLoading(false);
    }
  };

  /**
   * 页面加载或查询参数变化时,获取物料对账列表
   */
  useEffect(() => {
    fetchReconciliationList();
  }, [queryParams]);

  // 实时同步：45秒自动轮询更新物料对账数据
  // 财务对账数据需要及时更新，防止多人操作时数据不一致
  useSync(
    'material-reconciliation-list',
    async () => {
      try {
        const res = await materialReconciliationApi.getMaterialReconciliationList(queryParams);
        const data = unwrapApiData<unknown>(res, '');
        return {
          records: data.records || [],
          total: data.total || 0
        };
      } catch (error) {
        console.error('[实时同步] 获取物料对账列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setReconciliationList(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 物料对账数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 45000, // 45秒轮询，财务数据中等频率
      enabled: !loading && !queryLoading && !visible, // 加载中或弹窗打开时暂停
      pauseOnHidden: true, // 页面隐藏时暂停
      onError: (error) => {
        console.error('[实时同步] 物料对账数据同步错误', error);
      }
    }
  );

  /**
   * 打开物料对账弹窗
   * @param recon 可选，要编辑的物料对账记录，不传则为新增
   */
  const openDialog = (recon?: MaterialReconType) => {
    setCurrentRecon(recon || null);
    setVisible(true);
  };

  /**
   * 关闭物料对账弹窗
   */
  const closeDialog = () => {
    setVisible(false);
    setCurrentRecon(null);
  };

  /**
   * 表单提交处理
   * 处理新增或编辑物料对账的表单提交逻辑
   * @param values 表单提交的值
   */
  const handleSubmit = async (values: any) => {
    try {
      setSubmitLoading(true);
      let response;
      if (currentRecon?.id) {
        // 编辑物料对账：调用PUT接口更新现有记录
        response = await materialReconciliationApi.updateMaterialReconciliation({ ...values, id: currentRecon.id });
      } else {
        // 新增物料对账：调用POST接口创建新记录
        response = await materialReconciliationApi.createMaterialReconciliation(values);
      }

      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        message.success(currentRecon?.id ? '编辑物料对账成功' : '新增物料对账成功');
        // 关闭弹窗
        closeDialog();
        // 刷新物料对账列表
        fetchReconciliationList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      errorHandler.handleError(error, '保存失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  /**
   * 物料缩略图组件
   * 用于表格中显示物料图片，无图片时显示默认占位符
   */
  const MaterialThumb: React.FC = () => {
    return (
      <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-sm)' }}>无图</span>
      </div>
    );
  };

  /**
   * 表格列定义
   * 定义物料对账列表的所有列配置
   */
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: () => <MaterialThumb />,
    },
    {
      title: '对账单号',
      dataIndex: 'reconciliationNo',
      key: 'reconciliationNo',
      width: 140,
      render: (_: any, record: MaterialReconType) => (
        <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </Button>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 100,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      ellipsis: true,
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 120,
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '生产完成数',
      dataIndex: 'productionCompletedQuantity',
      key: 'productionCompletedQuantity',
      width: 110,
      align: 'right' as const,
      render: (v: unknown) => {
        // 将值转换为数字，非数字显示为'-'
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : '-';
      },
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '总金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '已付金额(元)',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '未付金额(元)',
      key: 'unpaidAmount',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const total = Number(record?.totalAmount || 0);
        const paid = Number(record?.paidAmount || 0);
        const unpaid = Math.max(0, total - paid);
        return unpaid.toFixed(2);
      },
    },
    {
      title: '付款进度',
      key: 'paymentProgress',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const total = Number(record?.totalAmount || 0);
        const paid = Number(record?.paidAmount || 0);
        if (total <= 0) return '-';
        const percent = Math.round((paid / total) * 100);
        return `${percent}%`;
      },
    },
    {
      title: '扣款项(元)',
      dataIndex: 'deductionAmount',
      key: 'deductionAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '最终金额(元)',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => <span className="final-amount">{value?.toFixed(2) || '0.00'}</span>,
    },
    {
      title: '对账日期',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '对账周期',
      key: 'reconciliationPeriod',
      width: 200,
      render: (_: any, record: any) => {
        const start = formatDateTime(record?.periodStartDate);
        const end = formatDateTime(record?.periodEndDate);
        if (!start && !end) return '-';
        return `${start || '?'} ~ ${end || '?'}`;
      },
    },
    {
      title: '对账人',
      dataIndex: 'reconciliationOperatorName',
      key: 'reconciliationOperatorName',
      width: 100,
      render: (v: unknown) => v || '-',
    },
    {
      title: '审核人',
      dataIndex: 'auditOperatorName',
      key: 'auditOperatorName',
      width: 100,
      render: (v: unknown) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: MaterialReconType['status']) => {
        const { text, color } = getMaterialReconStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right' as const,
      render: (_: any, record: MaterialReconType) => {
        const id = String(record.id || '').trim();
        const status = String(record.status || '').trim();
        const canAudit = Boolean(id) && status === 'pending' && canPerformAction('audit');
        const canSubmit = Boolean(id) && (status === 'verified' || status === 'rejected') && canPerformAction('submit');
        const canReturn = Boolean(id) && (status === 'verified' || status === 'approved' || status === 'paid') && canPerformAction('return');

        return (
          <RowActions
            className="table-actions"
            maxInline={0}
            actions={[
              {
                key: 'audit',
                label: '审核',
                title: canAudit ? '审核' : '审核(不可用)',
                icon: <CheckOutlined />,
                disabled: !canAudit,
                onClick: () => updateStatusBatch([{ id, status: 'verified' }], '审核成功'),
                primary: true,
              },
              {
                key: 'submit',
                label: '提交',
                title: canSubmit ? '提交' : '提交(不可用)',
                icon: <SendOutlined />,
                disabled: !canSubmit,
                onClick: async () => {
                  const targetStatus = status === 'verified' ? 'approved' : 'pending';
                  await updateStatusBatch([{ id, status: targetStatus }], '提交成功');
                  navigate('/finance/payment-approval', { state: { defaultTab: 'material', defaultStatus: targetStatus } });
                },
                primary: true,
              },
              {
                key: 'more',
                label: '更多',
                children: [
                  {
                    key: 'return',
                    label: '退回',
                    title: canReturn ? '退回' : '退回(不可用)',
                    disabled: !canReturn,
                    onClick: () => openReturnModal([id]),
                    danger: true,
                  },
                ] as Record<string, unknown>,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div>
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">物料对账</h2>
            <Space>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'export',
                      label: exporting ? '导出中...' : '导出',
                      icon: <DownloadOutlined />,
                      disabled: exporting,
                      onClick: exportCsv,
                    },
                    { type: 'divider' as const },
                    {
                      key: 'batchAudit',
                      label: approvalSubmitting ? '处理中...' : '批量审核',
                      icon: <CheckOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending'),
                      onClick: batchAudit,
                    },
                    {
                      key: 'batchSubmit',
                      label: approvalSubmitting ? '处理中...' : '批量提交',
                      icon: <SendOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'verified' || r.status === 'rejected')),
                      onClick: batchSubmit,
                    },
                    {
                      key: 'batchReturn',
                      label: approvalSubmitting ? '处理中...' : '批量退回',
                      icon: <RollbackOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'verified' || r.status === 'approved' || r.status === 'paid')),
                      onClick: batchReturn,
                      danger: true,
                    },
                    { type: 'divider' as const },
                    {
                      key: 'create',
                      label: '新增物料对账',
                      icon: <PlusOutlined />,
                      onClick: () => openDialog(),
                    },
                  ],
                }}
              >
                <Button icon={<MoreOutlined />}>操作</Button>
              </Dropdown>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form form={filterForm} layout="inline" size="small">
              <Form.Item label="对账单号">
                <Input
                  placeholder="请输入对账单号"
                  onChange={(e) => setQueryParams({ ...queryParams, reconciliationNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="供应商">
                <Input
                  placeholder="请输入供应商"
                  onChange={(e) => setQueryParams({ ...queryParams, supplierName: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="物料编码">
                <Input
                  placeholder="请输入物料编码"
                  onChange={(e) => setQueryParams({ ...queryParams, materialCode: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="pending">待审核</Option>
                  <Option value="verified">已验证</Option>
                  <Option value="approved">已批准</Option>
                  <Option value="paid">已付款</Option>
                  <Option value="rejected">已拒绝</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReconciliationList()} loading={queryLoading}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    setQueryParams({ page: 1, pageSize: 10 });
                    fetchReconciliationList();
                  }} loading={queryLoading}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={reconciliationList}
            rowKey="id"
            loading={loading}
            allowFixedColumns
            scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }} // 启用横向滚动，避免列宽挤压
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              getCheckboxProps: (record: MaterialReconType) => ({
                disabled: record.status === 'paid',
              }),
            }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total: total,
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
              showSizeChanger: true, // 允许用户调整每页条数
              pageSizeOptions: ['10', '20', '50', '100'] // 提供多种分页选项
            }}
          />
        </Card>

        {/* 物料对账详情弹窗 */}
        <ResizableModal
          title={currentRecon ? '物料对账详情' : '新增物料对账'}
          open={visible}
          onCancel={closeDialog}
          onOk={() => {
            if (!currentRecon && saveFormRef.current) {
              saveFormRef.current();
            }
          }}
          okText="保存"
          cancelText="取消"
          footer={currentRecon ? null : undefined} // 当是新增模式时，使用默认页脚
          okButtonProps={{ loading: submitLoading }}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
        >
          <MaterialReconModalContent
            currentRecon={currentRecon}
            onSubmit={handleSubmit}
            onSave={(saveFn) => {
              saveFormRef.current = saveFn;
            }}
          />
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default MaterialReconciliation;
