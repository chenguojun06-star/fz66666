import React, { useState, useEffect } from 'react';
import { Button, Card, Dropdown, Input, Select, Tag, Form, message, Modal } from 'antd';

import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import MaterialReconModalContent from '@/components/Finance/MaterialReconModalContent';
import { MaterialReconciliation as MaterialReconType, MaterialReconQueryParams } from '@/types/finance';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import { errorHandler } from '@/utils/errorHandling';
import { formatDateTime } from '@/utils/datetime';
import { unwrapApiData } from '@/utils/api';
import { getMaterialReconStatusConfig, materialReconStatusTransitions } from '@/constants/finance';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal } from '@/hooks';
import type { Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { Option } = Select;

const MaterialReconciliation: React.FC = () => {
  const _navigate = useNavigate();
  const { user } = useAuth(); // 获取当前用户信息
  const { isMobile, modalWidth } = useViewport();
  const reconModal = useModal<MaterialReconType>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryParams, setQueryParams] = useState<MaterialReconQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [_filterForm] = Form.useForm();
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
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

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
    const header = ['对账单号', '供应商', '物料编码', '物料名称', '采购单号', '采购类型', '订单号', '款号', '实到数量', '单位', '采购单价', '采购汇总', '采购完成', '采购员', '入库日期', '库区', '状态'];
    const lines = [header.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      const st = getMaterialReconStatusConfig((r as any)?.status);
      const sourceTypeText = (r as any)?.sourceType === 'sample' ? '样衣采购' : '批量采购';
      const quantity = Number((r as any)?.quantity ?? 0) || 0;
      const unitPrice = Number((r as any)?.unitPrice ?? 0) || 0;
      const totalAmount = quantity * unitPrice;
      const row = [
        String((r as any)?.reconciliationNo || '').trim(),
        String((r as any)?.supplierName || '').trim(),
        String((r as any)?.materialCode || '').trim(),
        String((r as any)?.materialName || '').trim(),
        String((r as any)?.purchaseNo || '').trim(),
        sourceTypeText,
        String((r as any)?.orderNo || '').trim(),
        String((r as any)?.styleNo || '').trim(),
        String(quantity),
        String((r as any)?.unit || '').trim(),
        canViewPrice(user) ? unitPrice.toFixed(2) : '***',
        canViewPrice(user) ? totalAmount.toFixed(2) : '***',
        String(formatDateTime((r as any)?.reconciliationDate) || ''),
        String((r as any)?.purchaserName || '').trim(),
        String(formatDateTime((r as any)?.inboundDate) || ''),
        String((r as any)?.warehouseLocation || '').trim(),
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
      const records = ((data as any)?.records || []) as MaterialReconType[];
      total = Number((data as any)?.total ?? records.length ?? 0);
      all.push(...records);
      if (!records.length) break;
      if (records.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }
    return all;
  };

  const exportSelectedCsv = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String((r as any)?.id)));
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
    } catch (e: any) {
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

  // 批量审核功能已删除（流程简化）

  const batchApprove = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'pending');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量审批状态为"待审批"的对账单');
    const pairs = eligible.map((r) => ({ id: String(r.id || ''), status: 'approved' }));
    await updateStatusBatch(pairs, '审批成功');
  };

  const batchReject = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'approved' || r.status === 'paid');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量驳回状态为"已审批/已付款"的对账单');
    openRejectModal(eligible.map((r) => String(r.id || '')));
  };

  // 权限判断函数
  const canPerformAction = (action: string) => {
    const permissions = user?.permissions || [];
    if (isSupervisorOrAboveUser(user)) return true;

    // 根据具体操作判断权限
    switch (action) {
      case 'approve':
        // 审批操作需要特定权限
        return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      case 'reject':
        return false; // 驳回仅主管及以上
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
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as any)?.code === 200).length;
      const failed = normalized.length - okCount;
      if (okCount <= 0) {
        message.error('操作失败：所有记录状态更新均未成功');
        return;
      }
      if (failed) message.error(`部分操作失败（${failed}/${normalized.length}）`);
      else message.success(successText);
      // 清除选中的行
      setSelectedRowKeys([]);
      // 刷新物料对账列表
      fetchReconciliationList();
    } catch (e: any) {
      errorHandler.handleApiError(e, '操作失败');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const openRejectModal = (ids: string[]) => {
    const normalized = ids.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return;
    let reasonValue = '';
    Modal.confirm({
      title: normalized.length > 1 ? `批量驳回（${normalized.length}条）` : '驳回',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="驳回原因">
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              placeholder="请输入驳回原因"
              onChange={(e) => {
                reasonValue = e.target.value;
              }}
            />
          </Form.Item>
        </Form>
      ),
      okText: '确认驳回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reasonValue || '').trim();
        if (!remark) {
          message.error('请输入驳回原因');
          return Promise.reject(new Error('请输入驳回原因'));
        }
        setApprovalSubmitting(true);
        try {
          // 驳回操作：将状态改为 rejected
          const settled = await Promise.allSettled(
            normalized.map((id) => materialReconciliationApi.updateMaterialReconciliationStatus(id, 'rejected')),
          );
          const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as any)?.code === 200).length;
          const failed = normalized.length - okCount;
          if (okCount <= 0) {
            message.error('驳回失败');
            return;
          }
          if (failed) message.error(`部分驳回失败（${failed}/${normalized.length}）`);
          else message.success('驳回成功');
          setSelectedRowKeys([]);
          fetchReconciliationList();
        } catch (e: any) {
          errorHandler.handleApiError(e, '驳回失败');
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
      setReconciliationList((data as any).records || []);
      setTotal((data as any).total || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      const err = error as any;
      reportSmartError('物料对账加载失败', String(err?.message || '请检查网络连接后重试'), 'FIN_MR_LIST_LOAD_FAILED');
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
          records: (data as any).records || [],
          total: (data as any).total || 0
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
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 45000, // 45秒轮询，财务数据中等频率
      enabled: !loading && !queryLoading && !reconModal.visible, // 加载中或弹窗打开时暂停
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
    reconModal.open(recon || null);
  };

  /**
   * 关闭物料对账弹窗
   */
  const closeDialog = () => {
    reconModal.close();
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
      if (reconModal.data?.id) {
        // 编辑物料对账：调用PUT接口更新现有记录
        response = await materialReconciliationApi.updateMaterialReconciliation({ ...values, id: reconModal.data.id });
      } else {
        // 新增物料对账：调用POST接口创建新记录
        response = await materialReconciliationApi.createMaterialReconciliation(values);
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(reconModal.data?.id ? '编辑物料对账成功' : '新增物料对账成功');
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
  const MaterialThumb: React.FC<{ imageUrl?: string }> = ({ imageUrl }) => {
    return (
      <div style={{ width: 48, height: 48, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
        {imageUrl ? (
          <img src={getFullAuthedFileUrl(imageUrl)} alt="物料" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)' }}>无图</span>
        )}
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
      render: (_: any, record: MaterialReconType) => <MaterialThumb imageUrl={record.materialImageUrl} />,
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
      title: '采购类型',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 100,
      render: (value: string) => {
        if (value === 'sample') return <Tag color="purple">样衣采购</Tag>;
        return <Tag color="green">批量采购</Tag>;
      },
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
      title: '实到数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (value: number, record: any) => {
        const unit = record?.unit || '';
        return `${value || 0}${unit ? ' ' + unit : ''}`;
      },
    },
    {
      title: '采购单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 110,
      align: 'right' as const,
      render: (value: number, record: any) => {
        if (!canViewPrice(user)) return '***';
        const unit = record?.unit || '';
        const price = value?.toFixed(2) || '0.00';
        return `¥${price}${unit ? '/' + unit : ''}`;
      },
    },
    {
      title: '采购汇总',
      key: 'purchaseTotal',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: any) => {
        if (!canViewPrice(user)) return '***';
        const quantity = Number(record?.quantity || 0);
        const unitPrice = Number(record?.unitPrice || 0);
        const total = quantity * unitPrice;
        return <span style={{ color: total > 0 ? 'var(--primary-color)' : undefined }}>¥{total.toFixed(2)}</span>;
      },
    },
    {
      title: '采购完成',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '采购员',
      dataIndex: 'purchaserName',
      key: 'purchaserName',
      width: 100,
      render: (value: string) => value || '-',
    },
    {
      title: '入库日期',
      dataIndex: 'inboundDate',
      key: 'inboundDate',
      width: 110,
      render: (value: unknown) => formatDateTime(value) || '-',
    },
    {
      title: '库区',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      render: (value: string) => value || '-',
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
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: MaterialReconType) => {
        const id = String(record.id || '').trim();
        const status = String(record.status || '').trim();
        const canApprove = Boolean(id) && status === 'pending' && canPerformAction('approve');
        const canPay = Boolean(id) && status === 'approved';
        const canReject = Boolean(id) && (status === 'approved' || status === 'paid') && canPerformAction('reject');
        const canResubmit = Boolean(id) && status === 'rejected';

        return (
          <RowActions
            className="table-actions"
            maxInline={1}
            actions={[
              {
                key: 'approve',
                label: '审批',
                disabled: !canApprove,
                onClick: () => updateStatusBatch([{ id, status: 'approved' }], '审批成功'),
                primary: true,
              },
              {
                key: 'pay',
                label: '付款',
                disabled: !canPay,
                onClick: () => updateStatusBatch([{ id, status: 'paid' }], '付款成功'),
                primary: true,
              },
              {
                key: 'resubmit',
                label: '重新提交',
                disabled: !canResubmit,
                onClick: () => updateStatusBatch([{ id, status: 'pending' }], '已重新提交'),
              },
              {
                key: 'reject',
                label: '驳回',
                disabled: !canReject,
                onClick: () => openRejectModal([id]),
                danger: true,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">物料对账</h2>
          </div>

          {showSmartErrorNotice && smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchReconciliationList} />
            </div>
          ) : null}

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <>
                  <StandardSearchBar
                    searchValue={queryParams.reconciliationNo || ''}
                    onSearchChange={(value) => setQueryParams({ ...queryParams, reconciliationNo: value, page: 1 })}
                    searchPlaceholder="搜索对账单号/供应商/物料"
                    dateValue={dateRange}
                    onDateChange={setDateRange}
                    statusValue={queryParams.status || ''}
                    onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                    statusOptions={[
                      { label: '全部', value: '' },
                      { label: '待审批', value: 'pending' },
                      { label: '已审批', value: 'approved' },
                      { label: '已付款', value: 'paid' },
                      { label: '已驳回', value: 'rejected' },
                    ]}
                  />
                  <Select
                    placeholder="采购来源"
                    style={{ width: 120, marginLeft: 8 }}
                    value={queryParams.sourceType || ''}
                    onChange={(value) => setQueryParams({ ...queryParams, sourceType: value, page: 1 })}
                    allowClear
                  >
                    <Option value="">全部</Option>
                    <Option value="sample">样衣采购</Option>
                    <Option value="batch">批量采购</Option>
                  </Select>
                </>
              )}
              right={(
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'export',
                        label: exporting ? '导出中...' : '导出',
                        disabled: exporting,
                        onClick: exportCsv,
                      },
                      { type: 'divider' as const },
                      {
                        key: 'batchApprove',
                        label: approvalSubmitting ? '处理中...' : '批量审批',
                        disabled:
                          approvalSubmitting ||
                          !selectedRowKeys.length ||
                          !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending'),
                        onClick: batchApprove,
                      },
                      {
                        key: 'batchReject',
                        label: approvalSubmitting ? '处理中...' : '批量驳回',
                        disabled:
                          approvalSubmitting ||
                          !selectedRowKeys.length ||
                          !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'approved' || r.status === 'paid')),
                        onClick: batchReject,
                        danger: true,
                      },
                      { type: 'divider' as const },
                      {
                        key: 'create',
                        label: '新增物料对账',
                        onClick: () => openDialog(),
                      },
                    ],
                  }}
                >
                  <Button>操作</Button>
                </Dropdown>
              )}
            />
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={reconciliationList}
            rowKey="id"
            loading={loading}
            allowFixedColumns
            scroll={{ x: 'max-content' }} // 启用横向滚动，自适应高度
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
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
            }}
          />
        </Card>

        {/* 物料对账详情弹窗 */}
        <ResizableModal
          title={reconModal.data ? '物料对账详情' : '新增物料对账'}
          open={reconModal.visible}
          onCancel={closeDialog}
          onOk={() => {
            if (!reconModal.data && saveFormRef.current) {
              saveFormRef.current();
            }
          }}
          okText="保存"
          cancelText="取消"
          footer={reconModal.data ? null : undefined} // 当是新增模式时，使用默认页脚
          okButtonProps={{ loading: submitLoading }}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
        >
          <MaterialReconModalContent
            currentRecon={reconModal.data}
            onSubmit={handleSubmit}
            onSave={(saveFn) => {
              saveFormRef.current = saveFn;
            }}
          />
        </ResizableModal>
    </Layout>
  );
};

export default MaterialReconciliation;
