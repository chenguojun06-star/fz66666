import React, { useRef, useState, useMemo } from 'react';
import { App, Button, Card, DatePicker, Empty, Select, Space, Statistic, Tag, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import { ExportOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, ReloadOutlined } from '@ant-design/icons';
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
  const { message, modal } = App.useApp();
  const { user } = useUser();

  const {
    reconciliationList, loading, queryLoading, total, queryParams, dateRange,
    smartError, showSmartErrorNotice, financeAudit, auditLoading,
    setQueryParams, setDateRange, fetchList, fetchFinanceAudit,
  } = useMaterialReconData();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [reconModalVisible, setReconModalVisible] = useState(false);
  const [reconModalData, setReconModalData] = useState<MaterialReconType | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  // D-252：补生成存量对账。修复工厂类型判定口径后，历史采购单的对账仍需手动触发一次；
  // 否则修复只对新采购生效，用户看到的依旧是「大货采购全都不在对账里」。
  const [backfilling, setBackfilling] = useState(false);
  const saveFormRef = useRef<(() => void) | null>(null);

  const openDialog = (recon?: MaterialReconType) => { setReconModalData(recon || null); setReconModalVisible(true); };
  const closeDialog = () => { setReconModalVisible(false); setReconModalData(null); };

  const {
    approvalSubmitting, pendingRejectIds, rejectIdsLoading,
    canPerformAction, updateStatusBatch, batchApprove, batchReject,
    handleRejectConfirm,
  } = useMaterialReconActions(reconciliationList, selectedRowKeys, fetchList, user);

  const { exporting, exportCsv } = useMaterialReconExport(queryParams, reconciliationList, selectedRowKeys, user);
  const { columns } = useMaterialReconColumns({ user, canPerformAction, approvalSubmitting, updateStatusBatch, openRejectModal: (_ids) => { batchReject(); }, openDialog });

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
  }, [reconciliationList, total]);

  // 点击统计卡片切换状态筛选（与下方 Tab 联动）
  const handleStatCardClick = (status: string) => {
    setQueryParams({ ...queryParams, status, page: 1 });
  };

  // ==================== 状态筛选（统计卡即筛选，D-140 删冗余Tab） ====================
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

  // D-252：补生成存量物料对账。历史采购单此前因工厂类型判定口径问题（factory_type 为 NULL
  // 被误判成外发）导致对账被整批跳过，修复口径后需由本操作补回，否则用户看到的数据依旧缺失。
  const handleBackfill = () => {
    modal.confirm({
      width: '32vw',
      title: '补生成物料对账',
      content: '将按最新规则重新扫描已到货的采购单，为缺失的对账单补生成。已存在的对账单只更新、不重复创建，可放心执行。',
      okText: '开始补生成',
      cancelText: '取消',
      onOk: async () => {
        setBackfilling(true);
        try {
          const res = await materialReconciliationApi.backfillMaterialReconciliation();
          const d: any = (res as any)?.data;
          // D-272b：后端返回诊断结构 {touched, failed, skipped:{原因:数}, failures:[{purchaseNo,material,error}]}
          // 兼容旧后端纯数字返回
          if (d != null && typeof d === 'object') {
            const touched = Number(d.touched ?? 0) || 0;
            const failed = Number(d.failed ?? 0) || 0;
            const skipped: Record<string, number> = d.skipped || {};
            const failures: any[] = d.failures || [];
            const skippedText = Object.entries(skipped).map(([k, v]) => `${k}：${v} 条`).join('；');
            if (failed > 0) {
              modal.warning({
                width: '52vw',
                title: `补生成完成：成功 ${touched} 条，失败 ${failed} 条`,
                content: (
                  <div style={{ maxHeight: 320, overflow: 'auto' }}>
                    {skippedText && <div style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>跳过：{skippedText}</div>}
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>失败明细（前 {failures.length} 条）：</div>
                    {failures.map((f, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 2 }}>
                        {f.purchaseNo || f.purchaseId} · {f.material}：{f.error}
                      </div>
                    ))}
                  </div>
                ),
              });
            } else if (touched === 0) {
              message.info(`本次没有需要补生成的对账${skippedText ? `（跳过：${skippedText}）` : ''}`);
            } else {
              message.success(`已补生成/更新 ${touched} 条对账单${skippedText ? `；跳过：${skippedText}` : ''}`);
            }
          } else {
            const touched = Number(d ?? 0) || 0;
            message.success(`已补生成/更新 ${touched} 条对账单`);
          }
          fetchList();
        } catch (error) {
          errorHandler.handleError(error, '补生成失败');
        } finally {
          setBackfilling(false);
        }
      },
    });
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
          <Card style={{ marginBottom: 12, background: 'var(--color-primary-bg-light, var(--color-bg-highlight))', border: '1px solid var(--color-primary-border, var(--color-blue-200))' }} styles={{ body: { padding: '8px 12px' } }}
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
                  <span style={{ color: 'var(--color-text)', marginLeft: 8 }}>{financeAudit.suggestion}</span>
                </div>
                {financeAudit.findings?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, color: 'var(--color-text-secondary)' }}>
                    {financeAudit.findings.slice(0, 3).map((f: any, i: number) => <li key={i}>{f.description || f.detail || String(f)}</li>)}
                    {financeAudit.findings.length > 3 && <li style={{ color: 'var(--color-text-tertiary)' }}>...共 {financeAudit.findings.length} 条异常</li>}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ===== 统计卡片 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
          <Card
            size="small"
            hoverable
            onClick={() => handleStatCardClick('pending')}
            style={{ borderRadius: 6, cursor: 'pointer', background: 'var(--color-fill-tertiary)', border: activeTab === 'pending' ? '2px solid var(--color-warning)' : '1px solid var(--color-border-secondary)' }}
            styles={{ body: { padding: '5px 10px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>}
              value={stats.pendingCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            hoverable
            onClick={() => handleStatCardClick('approved')}
            style={{ borderRadius: 6, cursor: 'pointer', background: 'var(--color-fill-tertiary)', border: activeTab === 'approved' ? '2px solid var(--color-primary)' : '1px solid var(--color-border-secondary)' }}
            styles={{ body: { padding: '5px 10px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>}
              value={stats.approvedCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            hoverable
            onClick={() => handleStatCardClick('paid')}
            style={{ borderRadius: 6, cursor: 'pointer', background: 'var(--color-fill-tertiary)', border: activeTab === 'paid' ? '2px solid var(--color-success)' : '1px solid var(--color-border-secondary)' }}
            styles={{ body: { padding: '5px 10px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已付款</span>}
              value={stats.paidCount}
              suffix="条"
              valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            onClick={() => handleStatCardClick('')}
            style={{ borderRadius: 6, cursor: 'pointer', background: 'var(--color-fill-tertiary)', border: activeTab === '' ? '2px solid var(--color-text-secondary)' : '1px solid var(--color-border-secondary)' }}
            styles={{ body: { padding: '5px 10px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额（点击查看全部）</span>}
              value={stats.totalAmount}
              precision={2}
              prefix="¥"
              suffix=""
              valueStyle={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500 }}
            />
          </Card>
        </div>

        {/* ===== 筛选区 ===== */}
        {/* D-140：状态Tab与统计卡功能完全重复（统计卡即可点击筛选），删除冗余Tab压缩页头 */}
        <Card className="filter-card mb-sm" styles={{ body: { padding: '8px 12px' } }}>
          {/* 操作按钮区 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Space size={8} wrap>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 条` : `共 ${stats.total} 条`}
              </span>
              <DatePicker.RangePicker
                value={dateRange as [Dayjs, Dayjs] | null}
                onChange={(v) => { setDateRange(v as [Dayjs, Dayjs] | null); setQueryParams({ ...queryParams, page: 1 }); }}
                allowClear
                placeholder={['开始日期', '结束日期']}
                style={{ width: 240 }}
              />
              {/* D-269：恢复采购类型筛选（大货/样衣/批量）——曾在财务精简重构中被误删，后端 queryPage 一直支持 */}
              <Select
                placeholder="采购类型"
                style={{ width: 120 }}
                value={queryParams.sourceType || undefined}
                onChange={(value) => setQueryParams({ ...queryParams, sourceType: value || '', page: 1 })}
                allowClear
                options={[
                  { value: 'order', label: '大货采购' },
                  { value: 'sample', label: '样衣采购' },
                  { value: 'batch', label: '批量采购' },
                ]}
              />
            </Space>
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
              <Tooltip title="按最新规则重新扫描已到货的采购单，补回缺失的对账单（已存在的只更新、不重复创建）">
                <Button ghost disabled={backfilling} onClick={handleBackfill} icon={<ReloadOutlined />}>
                  补生成对账
                </Button>
              </Tooltip>
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
