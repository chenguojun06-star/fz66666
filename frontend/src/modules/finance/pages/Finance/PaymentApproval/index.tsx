import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { CheckOutlined, CloseCircleOutlined, DollarOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';

// 工资结算审批记录类型
interface PayrollApprovalRecord {
  id: string;
  operatorId?: string;
  operatorName: string;
  totalQuantity: number;
  totalAmount: number;
  recordCount: number;
  orderCount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  approvalTime?: string;
  paymentTime?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

interface PayrollApprovalQueryParams {
  operatorName?: string;
  status?: string;
  page: number;
  pageSize: number;
}

type ReconStatus = 'pending' | 'approved' | 'paid' | 'rejected';

const { Option } = Select;

const isAdminUser = (user?: { role?: string; roleName?: string; username?: string } | null) => {
  const role = String(user?.role ?? user?.roleName ?? '').trim();
  const username = String(user?.username ?? '').trim();
  if (username === 'admin') return true;
  if (role === '1') return true;
  const lower = role.toLowerCase();
  return lower.includes('admin') || role.includes('管理员');
};

const toArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

const getStatusConfig = (status: ReconStatus | string | undefined) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审批', color: 'default' },
    approved: { text: '已审批', color: 'success' },
    paid: { text: '已付款', color: 'cyan' },
    rejected: { text: '已驳回', color: 'error' },
  };
  return statusMap[String(status || '')] || { text: '未知', color: 'default' };
};

const canTransition = (from: ReconStatus, to: ReconStatus) => {
  if (from === to) return false;
  if (from === 'pending') return to === 'approved' || to === 'rejected';
  if (from === 'approved') return to === 'paid' || to === 'rejected';
  return false;
};

const getActionIcon = (key: string) => {
  const k = String(key || '').trim();
  if (k === 'approved') return <SafetyCertificateOutlined />;
  if (k === 'paid') return <DollarOutlined />;
  if (k === 'reReview') return <SafetyCertificateOutlined />;
  if (k === 'rejected') return <CloseCircleOutlined />;
  if (k === 'return') return <RollbackOutlined />;
  return undefined;
};

const formatMoney2 = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '-';
};

type ApprovalTablePagination = {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
};

type ApprovalTableProps = {
  columns: unknown[];
  dataSource: PayrollApprovalRecord[];
  loading: boolean;
  pagination: ApprovalTablePagination;
  rowSelection: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[], rows: PayrollApprovalRecord[]) => void;
  };
  onOpenDetail: (record: PayrollApprovalRecord) => void;
  ignoreRowClick: (e: unknown) => boolean;
};

const ApprovalTable: React.FC<ApprovalTableProps> = ({
  columns,
  dataSource,
  loading,
  pagination,
  rowSelection,
  onOpenDetail,
  ignoreRowClick,
}) => {
  return (
    <ResizableTable
      columns={columns as Record<string, unknown>}
      dataSource={dataSource}
      rowKey={(r: Record<string, unknown>) => String(r.id || r.operatorName)}
      onRow={(record: PayrollApprovalRecord) => {
        return {
          onClick: (e: unknown) => {
            if (ignoreRowClick(e)) return;
            onOpenDetail(record);
          },
        } as Record<string, unknown>;
      }}
      rowSelection={rowSelection}
      loading={loading}
      pagination={pagination}
    />
  );
};

type ApprovalActionItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type ApprovalDetailModalProps = {
  open: boolean;
  record: PayrollApprovalRecord | null;
  width: number | string;
  initialHeight: number;
  onClose: () => void;
  buildActionItems: (status: ReconStatus, id: string) => ApprovalActionItem[];
};

const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  open,
  record,
  width,
  initialHeight,
  onClose,
  buildActionItems,
}) => {
  return (
    <ResizableModal
      open={open}
      title="工资付款详情"
      onCancel={onClose}
      footer={
        <div className="modal-footer-actions">
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
      width={width}
      initialHeight={initialHeight}
      scaleWithViewport
      destroyOnHidden
    >
      {record ? (
        <>
          <Card size="small" className="mb-sm">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ width: 84, height: 84, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--neutral-text-disabled)' }}>
                👤
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Tag color="blue">{String(record.operatorName || '').trim() || '-'}</Tag>
                  <Tag>
                    状态：{(() => {
                      const cfg = getStatusConfig(record.status);
                      return cfg.text;
                    })()}
                  </Tag>
                </Space>

                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3, lg: 3 }}>
                  <Descriptions.Item label="人员">{String(record.operatorName || '').trim() || '-'}</Descriptions.Item>
                  <Descriptions.Item label="总数量">{record.totalQuantity?.toLocaleString() || '-'}</Descriptions.Item>
                  <Descriptions.Item label="扫码次数">{record.recordCount?.toLocaleString() || '-'}</Descriptions.Item>
                  <Descriptions.Item label="订单数">{record.orderCount?.toLocaleString() || '-'}</Descriptions.Item>
                  <Descriptions.Item label="总金额(元)">{formatMoney2(record.totalAmount)}</Descriptions.Item>
                  <Descriptions.Item label="审批时间">{formatDateTime(record.approvalTime) || '-'}</Descriptions.Item>
                  <Descriptions.Item label="付款时间">{formatDateTime(record.paymentTime) || '-'}</Descriptions.Item>
                  <Descriptions.Item label="备注">{String(record.remark || '').trim() || '-'}</Descriptions.Item>
                </Descriptions>
              </div>
            </div>
          </Card>

          <Card size="small" title="审核动作">
            <Space wrap>
              {buildActionItems(
                (record.status || 'pending') as ReconStatus,
                String(record.id || record.operatorName || '')
              ).map((a) => {
                return (
                  <Button
                    key={String(a.key)}
                    icon={a.icon}
                    danger={Boolean(a.danger)}
                    disabled={Boolean(a.disabled)}
                    onClick={a.onClick}
                  >
                    {a.label}
                  </Button>
                );
              })}
            </Space>
          </Card>
        </>
      ) : (
        <div style={{ color: 'var(--neutral-text-disabled)' }}>未选择记录</div>
      )}
    </ResizableModal>
  );
};

const PaymentApproval: React.FC = () => {
  const { user } = useAuth();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<PayrollApprovalRecord | null>(null);

  const openDetail = (record: PayrollApprovalRecord) => {
    setDetailRecord(record || null);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailRecord(null);
  };

  const ignoreRowClick = (e: unknown) => {
    const el = e?.target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest('button,a,.ant-checkbox-wrapper,.ant-checkbox,.table-actions,.ant-dropdown,.ant-select,.ant-input,.ant-picker')
    );
  };

  const { modalWidth } = useViewport();
  const detailModalWidth = modalWidth;
  const detailModalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<PayrollApprovalRecord[]>([]);
  const [batchLoading, setBatchLoading] = useState<ReconStatus | null>(null);

  const handleSelectionChange = (keys: React.Key[], rows: PayrollApprovalRecord[]) => {
    setSelectedRowKeys(keys);
    setSelectedRows(rows);
  };

  const [payrollList, setPayrollList] = useState<PayrollApprovalRecord[]>([]);
  const [payrollTotal, setPayrollTotal] = useState(0);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollQuery, setPayrollQuery] = useState<PayrollApprovalQueryParams>({ page: 1, pageSize: 10, status: 'pending' });

  const [modalApi, modalContextHolder] = Modal.useModal();

  const isAdmin = useMemo(() => isAdminUser(user), [user]);

  const buildActionItems = (status: ReconStatus, id: string) => {
    return [
      {
        key: 'approved',
        label: '审批',
        icon: getActionIcon('approved'),
        disabled: !id || !canTransition(status, 'approved'),
        onClick: () => updateStatus(id, 'approved'),
      },
      {
        key: 'paid',
        label: '付款',
        icon: getActionIcon('paid'),
        disabled: !id || !canTransition(status, 'paid'),
        onClick: () => updateStatus(id, 'paid'),
      },
      {
        key: 'reReview',
        label: '重审',
        icon: getActionIcon('reReview'),
        disabled: !isAdmin || !id || status !== 'paid',
        onClick: () => openReReviewModal(id),
      },
      {
        key: 'rejected',
        label: '驳回',
        icon: getActionIcon('rejected'),
        danger: true,
        disabled: !id || status === 'pending' || status === 'rejected',
        onClick: () => openReturnModal(id),
      },
    ];
  };

  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
  }, [payrollQuery]);

  // 获取工资结算审批列表（从工资汇总审批过来的数据）
  const fetchPayrollApprovals = async () => {
    setPayrollLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: PayrollApprovalRecord[]; total: number } }>('/finance/payroll-approval/list', { params: payrollQuery });
      if (res.code === 200) {
        setPayrollList(toArray<PayrollApprovalRecord>(res.data?.records));
        setPayrollTotal(Number(res.data?.total || 0));
      } else {
        message.error(res.message || '获取工资审批付款列表失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取工资审批付款列表失败');
    } finally {
      setPayrollLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollApprovals();
  }, [payrollQuery]);

  const updateStatus = async (id: string, status: ReconStatus) => {
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/payroll-approval/update-status', { id, status });
      if (res.code === 200) {
        message.success('操作成功');
        if (detailOpen && detailRecord && String(detailRecord.id || detailRecord.operatorName || '') === String(id || '')) {
          setDetailRecord((prev) => {
            if (!prev) return prev;
            return { ...prev, status };
          });
        }
        fetchPayrollApprovals();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '操作失败');
    }
  };

  const getBatchStatusLabel = (status: ReconStatus) => {
    if (status === 'approved') return '审批';
    if (status === 'paid') return '付款';
    return status;
  };

  const batchUpdateStatus = async (targetStatus: ReconStatus) => {
    if (!selectedRowKeys.length) {
      message.error('请先勾选需要操作的记录');
      return;
    }

    if (targetStatus !== 'approved' && targetStatus !== 'paid') {
      message.error('不支持的批量操作');
      return;
    }

    const label = getBatchStatusLabel(targetStatus);
    const rowsById = new Map<string, PayrollApprovalRecord>(selectedRows.map((r) => [String(r.id || r.operatorName || ''), r]));
    const keys = selectedRowKeys.map((k) => String(k));

    modalApi.confirm({
      title: `一键${label}`,
      content: `确认对已选 ${keys.length} 条记录执行"${label}"吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setBatchLoading(targetStatus);

        let okCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        const tasks = keys.map(async (id) => {
          const row = rowsById.get(id);
          const fromStatus = (row?.status || '') as ReconStatus;

          if (row && !canTransition(fromStatus, targetStatus)) {
            skippedCount += 1;
            return;
          }

          try {
            const res = await api.post<{ code: number; message: string }>('/finance/payroll-approval/update-status', { id, status: targetStatus });
            if (res.code === 200) {
              okCount += 1;
            } else {
              failCount += 1;
            }
          } catch {
            failCount += 1;
          }
        });

        await Promise.all(tasks);

        setBatchLoading(null);
        setSelectedRowKeys([]);
        setSelectedRows([]);

        fetchPayrollApprovals();

        if (!okCount && !failCount && skippedCount) {
          message.warning(`无可操作记录（已跳过 ${skippedCount} 条）`);
          return;
        }

        const parts = [`成功 ${okCount} 条`];
        if (skippedCount) parts.push(`跳过 ${skippedCount} 条`);
        if (failCount) parts.push(`失败 ${failCount} 条`);
        message.success(`批量${label}完成：${parts.join('，')}`);
      },
    });
  };

  const returnToPrevious = async (id: string, reason: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/payroll-approval/return', { id, reason });
      if (res.code === 200) {
        message.success('退回成功');
        fetchPayrollApprovals();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '退回失败');
    }
  };

  const openReturnModal = (id: string) => {
    let reasonValue = '';
    modalApi.confirm({
      title: '退回',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="退回原因">
            <Input.TextArea rows={4} onChange={(e) => {
              reasonValue = e.target.value;
            }} />
          </Form.Item>
        </Form>
      ),
      okText: '确认退回',
      cancelText: '取消',
      onOk: async () => {
        const reason = String(reasonValue || '').trim();
        if (!reason) {
          message.error('请输入退回原因');
          throw new Error('missing reason');
        }
        await returnToPrevious(id, reason);
      },
    });
  };

  const openReReviewModal = (id: string) => {
    let reasonValue = '';
    modalApi.confirm({
      title: '重审',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="重审原因">
            <Input.TextArea rows={4} onChange={(e) => {
              reasonValue = e.target.value;
            }} />
          </Form.Item>
        </Form>
      ),
      okText: '确认重审',
      cancelText: '取消',
      onOk: async () => {
        const reason = String(reasonValue || '').trim();
        if (!reason) {
          message.error('请输入重审原因');
          throw new Error('missing reason');
        }
        await reReview(id, reason);
      },
    });
  };

  const reReview = async (id: string, reason: string) => {
    if (!isAdmin) {
      message.error('只有管理员可以重审');
      return;
    }

    if (!String(reason || '').trim()) {
      message.error('请输入重审原因');
      return;
    }

    try {
      const res = await api.post<{ code: number; message: string }>('/finance/payroll-approval/return', { id, reason });
      if (res.code === 200) {
        message.success('已重审');
        fetchPayrollApprovals();
      } else {
        message.error(res.message || '重审失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '重审失败');
    }
  };

  const payrollColumns = useMemo(() => {
    return [
      {
        title: '人员',
        dataIndex: 'operatorName',
        key: 'operatorName',
        width: 140,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '总数量',
        dataIndex: 'totalQuantity',
        key: 'totalQuantity',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toLocaleString() : '-';
        },
      },
      {
        title: '总金额(元)',
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        width: 130,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '扫码次数',
        dataIndex: 'recordCount',
        key: 'recordCount',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toLocaleString() : '-';
        },
      },
      {
        title: '订单数',
        dataIndex: 'orderCount',
        key: 'orderCount',
        width: 90,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toLocaleString() : '-';
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: ReconStatus) => {
          const { text, color } = getStatusConfig(status);
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: '审批时间',
        dataIndex: 'approvalTime',
        key: 'approvalTime',
        width: 160,
        render: (v: unknown) => formatDateTime(v) || '-',
      },
      {
        title: '付款时间',
        dataIndex: 'paymentTime',
        key: 'paymentTime',
        width: 160,
        render: (v: unknown) => formatDateTime(v) || '-',
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        width: 180,
        ellipsis: true,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        fixed: 'right' as const,
        render: (_: unknown, record: PayrollApprovalRecord) => {
          const status = record.status as ReconStatus;
          const id = String(record.id || record.operatorName || '');
          const items = buildActionItems(status, id);
          return <RowActions actions={[{ key: 'more', label: '更多', children: items as Record<string, unknown> }]} maxInline={0} />;
        },
      },
    ];
  }, [isAdmin, modalApi]);

  const payrollExtraFilters = (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small" onSubmitCapture={(e) => e.preventDefault()}>
        <Form.Item label="人员">
          <Input
            placeholder="请输入人员姓名"
            onChange={(e) => setPayrollQuery((prev) => ({ ...prev, operatorName: e.target.value, page: 1 }))}
            style={{ width: 160 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select
            value={payrollQuery.status || ''}
            style={{ width: 140 }}
            onChange={(v) => setPayrollQuery((prev) => ({ ...prev, status: v || undefined, page: 1 }))}
          >
            <Option value="">全部</Option>
            <Option value="pending">待审批</Option>
            <Option value="approved">已审批</Option>
            <Option value="paid">已付款</Option>
            <Option value="rejected">已驳回</Option>
          </Select>
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" onClick={fetchPayrollApprovals} loading={payrollLoading}>
              刷新
            </Button>
            <Button
              onClick={() =>
                setPayrollQuery({
                  page: 1,
                  pageSize: 10,
                  status: 'pending',
                })
              }
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );

  const headerActions = (
    <Space>
      <Tag color={selectedRowKeys.length ? 'blue' : 'default'}>已选 {selectedRowKeys.length} 条</Tag>
      <Button
        onClick={() => batchUpdateStatus('approved')}
        disabled={!selectedRowKeys.length}
        loading={batchLoading === 'approved'}
      >
        一键审批
      </Button>
      <Button
        type="primary"
        onClick={() => batchUpdateStatus('paid')}
        disabled={!selectedRowKeys.length}
        loading={batchLoading === 'paid'}
      >
        一键付款
      </Button>
    </Space>
  );

  return (
    <Layout>
      {modalContextHolder}
      <div>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">审批付款</h2>
            {headerActions}
          </div>

          {payrollExtraFilters}

          <ApprovalTable
            columns={payrollColumns as Record<string, unknown>}
            dataSource={payrollList}
            onOpenDetail={openDetail}
            ignoreRowClick={ignoreRowClick}
            rowSelection={{ selectedRowKeys, onChange: handleSelectionChange }}
            loading={payrollLoading}
            pagination={{
              current: payrollQuery.page,
              pageSize: payrollQuery.pageSize,
              total: payrollTotal,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (page, pageSize) => setPayrollQuery((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        </Card>

        <ApprovalDetailModal
          open={detailOpen}
          record={detailRecord}
          width={detailModalWidth}
          initialHeight={detailModalInitialHeight}
          onClose={closeDetail}
          buildActionItems={buildActionItems}
        />
      </div>
    </Layout>
  );
};

export default PaymentApproval;
