import React, { useRef, useState } from 'react';
import { App, Button, Card, Dropdown, Select, Tag } from 'antd';
import { useUser } from '@/utils/AuthContext';
import { useSync } from '@/utils/syncManager';
import PageLayout from '@/components/common/PageLayout';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
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

const { Option } = Select;

const MaterialReconciliation: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();

  const {
    reconciliationList, loading, queryLoading, total, queryParams, dateRange,
    smartError, showSmartErrorNotice, financeAudit, auditLoading,
    setQueryParams, setDateRange, fetchList, fetchFinanceAudit,
  } = useMaterialReconData();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reconModal = { visible: false, data: null as MaterialReconType | null, open: (_d?: MaterialReconType | null) => {}, close: () => {} };
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { columns } = useMaterialReconColumns({ user, canPerformAction, approvalSubmitting, updateStatusBatch, openRejectModal: (ids) => { batchReject(); }, openDialog });

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

  return (
    <>
      <PageLayout
        title="物料对账"
        headerContent={showSmartErrorNotice && smartError ? <div style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={fetchList} /></div> : null}
      >
        {showSmartErrorNotice && (
          <Card style={{ marginBottom: 12, background: '#f0f5ff', border: '1px solid #adc6ff' }} styles={{ body: { padding: '8px 12px' } }}
            extra={<Button type="link" loading={auditLoading} onClick={fetchFinanceAudit} style={{ padding: 0 }}>{financeAudit ? '重新分析' : ' AI分析'}</Button>}
            title={<span style={{ fontSize: 13, color: '#1677ff' }}> 智能财务审核助手</span>}
          >
            {!financeAudit ? (
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>点击「AI分析」自动检测对账差异并给出审核建议</span>
            ) : (
              <div style={{ fontSize: 12 }}>
                <div style={{ marginBottom: 4 }}>
                  <Tag color={financeAudit.overallRisk === 'HIGH' ? 'red' : financeAudit.overallRisk === 'MEDIUM' ? 'orange' : 'green'}>
                    整体风险：{financeAudit.overallRisk === 'HIGH' ? '高' : financeAudit.overallRisk === 'MEDIUM' ? '中' : '低'}
                  </Tag>
                  <span style={{ color: '#262626', marginLeft: 8 }}>{financeAudit.suggestion}</span>
                </div>
                {financeAudit.findings?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, color: '#595959' }}>
                    {financeAudit.findings.slice(0, 3).map((f: any, i: number) => <li key={i}>{f.description || f.detail || String(f)}</li>)}
                    {financeAudit.findings.length > 3 && <li style={{ color: '#8c8c8c' }}>...共 {financeAudit.findings.length} 条异常</li>}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        <Card className="filter-card mb-sm">
          <StandardToolbar
            left={
              <>
                <StandardSearchBar
                  searchValue={queryParams.reconciliationNo || ''}
                  onSearchChange={(value) => setQueryParams({ ...queryParams, reconciliationNo: value, page: 1 })}
                  searchPlaceholder="搜索对账单号/供应商/物料"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={queryParams.status || ''}
                  onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  statusOptions={[{ label: '全部', value: '' }, { label: '待审批', value: 'pending' }, { label: '已审批', value: 'approved' }, { label: '已付款', value: 'paid' }, { label: '已驳回', value: 'rejected' }]}
                />
                <Select placeholder="采购来源" style={{ width: 120, marginLeft: 8 }} value={queryParams.sourceType || ''} onChange={(value) => setQueryParams({ ...queryParams, sourceType: value, page: 1 })} allowClear>
                  <Option value="">全部</Option>
                  <Option value="sample">样衣采购</Option>
                  <Option value="order">大货采购</Option>
                  <Option value="batch">批量采购</Option>
                </Select>
              </>
            }
            right={
              <Dropdown trigger={['click']} menu={{
                items: [
                  { key: 'export', label: exporting ? '导出中...' : '导出', disabled: exporting, onClick: exportCsv },
                  { type: 'divider' as const },
                  { key: 'batchApprove', label: approvalSubmitting ? '处理中...' : '批量审批', disabled: approvalSubmitting || !selectedRowKeys.length || !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending'), onClick: batchApprove },
                  { key: 'batchReject', label: approvalSubmitting ? '处理中...' : '批量驳回', disabled: approvalSubmitting || !selectedRowKeys.length || !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'approved' || r.status === 'paid')), onClick: batchReject, danger: true },
                  { type: 'divider' as const },
                  { key: 'create', label: '新增物料对账', onClick: () => openDialog() },
                ],
              }}>
                <Button>操作</Button>
              </Dropdown>
            }
          />
        </Card>

        <ResizableTable
          columns={columns} dataSource={reconciliationList} rowKey="id"
          loading={loading} allowFixedColumns stickyHeader scroll={{ x: 'max-content' }}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys), getCheckboxProps: (record: MaterialReconType) => ({ disabled: record.status === 'paid' }) }}
          pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }) }}
        />
      </PageLayout>

      <ResizableModal
        title={reconModalData ? '物料对账详情' : '新增物料对账'}
        open={reconModalVisible} onCancel={closeDialog}
        onOk={() => { if (!reconModalData && saveFormRef.current) saveFormRef.current(); }}
        okText="保存" cancelText="取消"
        footer={reconModalData ? null : undefined}
        okButtonProps={{ loading: submitLoading }}
        width="60vw" initialHeight={400}
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
