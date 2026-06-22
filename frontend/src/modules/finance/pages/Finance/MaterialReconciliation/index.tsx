import React, { useRef, useState, useMemo } from 'react';
import { App, Button, Card, Empty, Space, Statistic, Tabs, Tag } from 'antd';
import { ExportOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { useUser } from '@/utils/AuthContext';
import { useSync } from '@/utils/syncManager';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import MaterialReconModalContent from '@/components/Finance/MaterialReconModalContent';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import { errorHandler } from '@/utils/errorHandling';
import type { MaterialReconType } from '@/types/finance';
import { useMaterialReconData } from './hooks/useMaterialReconData';
import { useMaterialReconActions } from './hooks/useMaterialReconActions';
import { useMaterialReconExport } from './hooks/useMaterialReconExport';
import { useMaterialReconColumns } from './hooks/useMaterialReconColumns';

const MaterialReconciliation: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();

  const {
    reconciliationList, loading, queryLoading, total, queryParams,
    smartError, showSmartErrorNotice, financeAudit, auditLoading,
    setQueryParams, fetchList, fetchFinanceAudit,
  } = useMaterialReconData();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [reconModalVisible, setReconModalVisible] = useState(false);
  const [reconModalData, setReconModalData] = useState<MaterialReconType | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const saveFormRef = useRef<(() => void) | null>(null);

  const openDialog = (recon?: MaterialReconType) => { setReconModalData(recon || null); setReconModalVisible(true); };
  const closeDialog = () => { setReconModalVisible(false); setReconModalData(null); };

  const {
    approvalSubmitting, pendingRejectIds, rejectIdsLoading,
    canPerformAction, updateStatusBatch, batchApprove, batchReject,
    handleRejectConfirm,
  } = useMaterialReconActions(reconciliationList, selectedRowKeys, fetchList, user);

  const { exporting, exportCsv } = useMaterialReconExport(queryParams, reconciliationList, selectedRowKeys, user);
  const { columns } = useMaterialReconColumns({ user, canPerformAction, approvalSubmitting, updateStatusBatch, openRejectModal: (ids) => { batchReject(); }, openDialog });

  // ==================== 统计卡片 ====================
  const stats = useMemo(() => {
    const pending = reconciliationList.filter(r => r.status === 'pending' || r.status === 'verified');
    const approved = reconciliationList.filter(r => r.status === 'approved');
    const paid = reconciliationList.filter(r => r.status === 'paid');
    const totalAmount = reconciliationList.reduce((sum, r) => sum + (r.finalAmount || 0), 0);
    const pendingCount = pending.length;
    const approvedCount = approved.length;
    const paidCount = paid.length;
    return { pendingCount, approvedCount, paidCount, totalAmount, total };
  }, [reconciliationList]);

  // ==================== 状态Tab ====================
  const statusTabs = [
    { key: '', label: '全部' },
    { key: 'pending', label: '待审批', color: '#faad14' },
    { key: 'approved', label: '已审批', color: '#1890ff' },
    { key: 'paid', label: '已付款', color: '#52c41a' },
    { key: 'rejected', label: '已驳回', color: '#ff4d4f' },
  ];
  const activeTab = queryParams.status || '';

  useSync(
    'material-reconciliation-list',
    async () => {
      try {
        const res = await materialReconciliationApi.getMaterialReconciliationList(queryParams);
        const data = (res as any)?.data || res;
        return { records: data?.records || [], total: data?.total || 0 };
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        fetchList(false);
      }
    },
    { interval: 45000, enabled: !loading && !queryLoading && !reconModalVisible, pauseOnHidden: true },
  );

  const handleSubmit = async (values: any) => {
    try {
      setSubmitLoading(true);
      let response;
      if (reconModalData?.id) {
        response = await materialReconciliationApi.updateMaterialReconciliation({ ...values, id: reconModalData.id });
      } else {
        response = await materialReconciliationApi.createMaterialReconciliation(values);
      }
      const result = response as any;
      if (result.code === 200) {
        message.success(reconModalData?.id ? '编辑物料对账成功' : '新增物料对账成功');
        closeDialog();
        fetchList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      errorHandler.handleError(error, '保存失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  // 当前选中的待审批数量
  const selectedPendingCount = useMemo(() => {
    return reconciliationList.filter(r => selectedRowKeys.includes(String(r.id)) && (r.status === 'pending' || r.status === 'verified')).length;
  }, [reconciliationList, selectedRowKeys]);

  return (
    <>
      <PageLayout
        title="物料对账"
        headerContent={showSmartErrorNotice && smartError ? <div style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={fetchList} /></div> : null}
      >
        {/* ===== AI审核助手 ===== */}
        {showSmartErrorNotice && (
          <Card style={{ marginBottom: 12, background: '#f0f5ff', border: '1px solid #adc6ff' }} styles={{ body: { padding: '8px 12px' } }}
            extra={<Button type="link" loading={auditLoading} onClick={fetchFinanceAudit} style={{ padding: 0 }}>{financeAudit ? '重新分析' : ' AI分析'}</Button>}
            title={<span style={{ fontSize: 14, color: 'var(--color-primary)' }}> 智能财务审核助手</span>}
          >
            {!financeAudit ? (
              <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>点击「AI分析」自动检测对账差异并给出审核建议</span>
            ) : (
              <div style={{ fontSize: 14 }}>
                <div style={{ marginBottom: 4 }}>
                  <Tag color={financeAudit.overallRisk === 'HIGH' ? 'red' : financeAudit.overallRisk === 'MEDIUM' ? 'orange' : 'green'}>
                    整体风险：{financeAudit.overallRisk === 'HIGH' ? '高' : financeAudit.overallRisk === 'MEDIUM' ? '中' : '低'}
                  </Tag>
                  <span style={{ color: '#262626', marginLeft: 8 }}>{financeAudit.suggestion}</span>
                </div>
                {financeAudit.findings?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, color: '#595959' }}>
                    {financeAudit.findings.slice(0, 3).map((f: any, i: number) => <li key={i}>{f.description || f.detail || String(f)}</li>)}
                    {financeAudit.findings.length > 3 && <li style={{ color: 'var(--color-text-tertiary)' }}>...共 {financeAudit.findings.length} 条异常</li>}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ===== 统计卡片 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>}
              value={stats.pendingCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-warning)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>}
              value={stats.approvedCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-primary)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已付款</span>}
              value={stats.paidCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-success)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>}
              value={stats.totalAmount}
              precision={2}
              prefix="¥"
              suffix=""
              valueStyle={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
        </div>

        {/* ===== 筛选区 ===== */}
        <Card className="filter-card mb-sm" styles={{ body: { padding: '12px 16px' } }}>
          {/* 状态Tab */}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setQueryParams({ ...queryParams, status: key, page: 1 })}
            items={statusTabs}
            size="small"
            style={{ marginBottom: 0 }}
          />

          {/* 操作按钮区 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 条` : `共 ${stats.total} 条`}
            </span>
            <Space size={8}>
              <Button
                type="primary"
                ghost
                disabled={approvalSubmitting || selectedPendingCount === 0}
                onClick={batchApprove}
              >
                批量审批{selectedPendingCount > 0 ? ` (${selectedPendingCount})` : ''}
              </Button>
              <Button
                ghost
                danger
                disabled={approvalSubmitting || selectedRowKeys.length === 0}
                onClick={batchReject}
              >
                批量驳回
              </Button>
              <Button ghost disabled={exporting} onClick={exportCsv} icon={<ExportOutlined />}>
                导出
              </Button>
            </Space>
          </div>
        </Card>

        {/* ===== 数据表格 ===== */}
        <ResizableTable
          columns={columns} dataSource={reconciliationList} rowKey="id"
          loading={loading} allowFixedColumns stickyHeader scroll={{ x: 'max-content' }}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys), getCheckboxProps: (record: MaterialReconType) => ({ disabled: record.status === 'paid' }) }}
          pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }) }}
          locale={{ emptyText: <Empty description="暂无对账记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </PageLayout>

      <ResizableModal
        title={reconModalData ? '物料对账详情' : '新增物料对账'}
        open={reconModalVisible} onCancel={closeDialog}
        onOk={() => { if (!reconModalData && saveFormRef.current) saveFormRef.current(); }}
        okText="保存" cancelText="取消"
        footer={reconModalData ? null : undefined}
        okButtonProps={{ loading: submitLoading }}
        width="85vw" initialHeight={400}
        minWidth={320} scaleWithViewport
      >
        <MaterialReconModalContent currentRecon={reconModalData} onSubmit={handleSubmit} onSave={(saveFn) => { saveFormRef.current = saveFn; }} />
      </ResizableModal>

      <RejectReasonModal
        open={!!pendingRejectIds}
        title={pendingRejectIds && pendingRejectIds.length > 1 ? `批量驳回（${pendingRejectIds.length}条）` : '驳回'}
        onOk={handleRejectConfirm}
        onCancel={() => {}}
        loading={rejectIdsLoading}
      />
    </>
  );
};

export default MaterialReconciliation;
