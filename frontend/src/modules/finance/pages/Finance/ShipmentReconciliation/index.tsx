import React, { useMemo, useState } from 'react';
import { App, Button, Card, Dropdown, Empty, Radio, RadioChangeEvent, Space, Statistic, Tabs, Tag } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, MoreOutlined } from '@ant-design/icons';
import { useUser } from '@/utils/AuthContext';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ShipmentReconDetailModal from './components/ShipmentReconDetailModal';
import { useShipmentReconData } from './hooks/useShipmentReconData';
import { useShipmentReconColumns } from './hooks/useShipmentReconColumns';
import { useShipmentReconActions } from './hooks/useShipmentReconActions';
import type { ShipmentReconciliation } from '@/types/finance';
import dayjs from 'dayjs';

const ShipmentReconciliationPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();

  const {
    reconciliationList, loading, total, queryParams, dateRange,
    smartError, showSmartErrorNotice,
    setQueryParams, setDateRange, fetchList,
  } = useShipmentReconData();

  const {
    actionSubmitting, canPerformAction,
    handleStatusUpdate, handleBatchStatusUpdate,
    handleReturn, handleDelete, handleBackfill,
  } = useShipmentReconActions(fetchList, user);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ShipmentReconciliation | null>(null);
  const openDetail = (record: ShipmentReconciliation) => { setDetailRecord(record); setDetailVisible(true); };
  const closeDetail = () => { setDetailVisible(false); setDetailRecord(null); };

  // 编辑弹窗（复用详情弹窗，后续可扩展为独立编辑表单）
  const [editVisible, setEditVisible] = useState(false);
  const [editRecord, setEditRecord] = useState<ShipmentReconciliation | null>(null);
  const openEdit = (record: ShipmentReconciliation) => { setEditRecord(record); setEditVisible(true); };
  const closeEdit = () => { setEditVisible(false); setEditRecord(null); };

  // 扣款弹窗
  const [deductionVisible, setDeductionVisible] = useState(false);
  const [deductionRecord, setDeductionRecord] = useState<ShipmentReconciliation | null>(null);
  const openDeduction = (record: ShipmentReconciliation) => { setDeductionRecord(record); setDeductionVisible(true); };
  const closeDeduction = () => { setDeductionVisible(false); setDeductionRecord(null); };

  const { columns } = useShipmentReconColumns({
    user, canPerformAction, actionSubmitting,
    onStatusUpdate: handleStatusUpdate,
    onReturn: handleReturn,
    onBackfill: handleBackfill,
    onViewDetail: openDetail,
    onEdit: openEdit,
    onDelete: handleDelete,
    onViewDeduction: openDeduction,
  });

  // ==================== 统计卡片 ====================
  const stats = useMemo(() => {
    const pending = reconciliationList.filter(r => r.status === 'pending' || r.status === 'verified');
    const approved = reconciliationList.filter(r => r.status === 'approved');
    const paid = reconciliationList.filter(r => r.status === 'paid');
    const totalAmount = reconciliationList.reduce((sum, r) => sum + ((r as any).totalAmount || (r as any).reconAmount || 0), 0);
    return { pendingCount: pending.length, approvedCount: approved.length, paidCount: paid.length, totalAmount, total };
  }, [reconciliationList, total]);

  // ==================== 快捷日期 ====================
  const [presetValue, setPresetValue] = useState<string>('');
  const handlePresetChange = (e: RadioChangeEvent) => {
    const val = e.target.value;
    setPresetValue(val);
    const today = dayjs();
    switch (val) {
      case 'today': setDateRange([today.startOf('day'), today.endOf('day')]); break;
      case 'week': setDateRange([today.startOf('week'), today.endOf('week')]); break;
      case 'month': setDateRange([today.startOf('month'), today.endOf('month')]); break;
      case 'year': setDateRange([today.startOf('year'), today.endOf('year')]); break;
      default: setDateRange(null);
    }
  };

  // ==================== 状态Tab ====================
  const statusTabs = [
    { key: '', label: '全部' },
    { key: 'pending', label: '待核实' },
    { key: 'verified', label: '已核实' },
    { key: 'approved', label: '已审批' },
    { key: 'paid', label: '已付款' },
    { key: 'rejected', label: '已驳回' },
  ];
  const activeTab = queryParams.status || '';

  // ==================== 批量操作 ====================
  const batchApprove = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'pending' || r.status === 'verified');
    if (!eligible.length) { message.warning('请选择状态为"待核实"或"已核实"的记录'); return; }
    handleBatchStatusUpdate(eligible, 'approved', '批量审批成功');
  };
  const batchReject = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status !== 'paid' && r.status !== 'rejected');
    if (!eligible.length) { message.warning('无可驳回的记录'); return; }
    handleBatchStatusUpdate(eligible, 'rejected', '批量驳回成功');
  };
  const selectedPendingCount = reconciliationList.filter(r => selectedRowKeys.includes(String(r.id)) && (r.status === 'pending' || r.status === 'verified')).length;

  return (
    <>
      <PageLayout
        title="出货对账"
        headerContent={
          showSmartErrorNotice && smartError
            ? <div style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={fetchList} /></div>
            : null
        }
      >
        {/* ===== 统计卡片 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
            <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待核实</span>} value={stats.pendingCount} suffix="条" valueStyle={{ color: 'var(--color-warning)', fontSize: 20, fontWeight: 500 }} />
          </Card>
          <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
            <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>} value={stats.approvedCount} suffix="条" valueStyle={{ color: 'var(--color-primary)', fontSize: 20, fontWeight: 500 }} />
          </Card>
          <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
            <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已付款</span>} value={stats.paidCount} suffix="条" valueStyle={{ color: 'var(--color-success)', fontSize: 20, fontWeight: 500 }} />
          </Card>
          <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
            <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>} value={stats.totalAmount} precision={2} prefix="¥" valueStyle={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 500 }} />
          </Card>
        </div>

        {/* ===== 筛选区 ===== */}
        <Card className="filter-card mb-sm" styles={{ body: { padding: '12px 16px' } }}>
          <div style={{ marginBottom: 12 }}>
            <Space size={12} wrap>
              <Radio.Group value={presetValue} onChange={handlePresetChange} optionType="button" buttonStyle="solid" size="small">
                <Radio.Button value="today">今天</Radio.Button>
                <Radio.Button value="week">本周</Radio.Button>
                <Radio.Button value="month">本月</Radio.Button>
                <Radio.Button value="year">本年</Radio.Button>
              </Radio.Group>
              <Button size="small" onClick={() => { setPresetValue(''); setDateRange(null); }}>清除日期</Button>
            </Space>
          </div>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setQueryParams({ ...queryParams, status: key, page: 1 })}
            items={statusTabs}
            size="small"
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>{selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 条` : `共 ${stats.total} 条记录`}</span>
            <Space size={8}>
              <Button type="primary" ghost disabled={actionSubmitting || selectedPendingCount === 0} onClick={batchApprove}>批量审批{selectedPendingCount > 0 ? `(${selectedPendingCount})` : ''}</Button>
              <Button ghost danger disabled={actionSubmitting || selectedRowKeys.length === 0} onClick={batchReject}>批量驳回</Button>
              <Dropdown trigger={['click']} menu={{ items: [{ key: 'backfill', label: actionSubmitting ? '处理中...' : '回填对账数据', disabled: actionSubmitting, onClick: handleBackfill }] }}>
                <Button icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          </div>
        </Card>

        <ResizableTable
          columns={columns}
          dataSource={reconciliationList}
          rowKey="id"
          loading={loading}
          allowFixedColumns
          stickyHeader
          scroll={{ x: 'max-content' }}
          storageKey="shipment-reconciliation"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            getCheckboxProps: (record: ShipmentReconciliation) => ({ disabled: record.status === 'paid' }),
          }}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
          }}
          locale={{ emptyText: <Empty description="暂无对账记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </PageLayout>

      {/* 详情弹窗 */}
      <ShipmentReconDetailModal
        open={detailVisible}
        record={detailRecord}
        onClose={closeDetail}
        onRefresh={fetchList}
      />

      {/* 编辑弹窗（暂复用详情弹窗，后续可扩展为独立表单） */}
      <ShipmentReconDetailModal
        open={editVisible}
        record={editRecord}
        onClose={closeEdit}
        onRefresh={fetchList}
      />

      {/* 扣款弹窗（暂复用详情弹窗展示扣款明细） */}
      <ShipmentReconDetailModal
        open={deductionVisible}
        record={deductionRecord}
        onClose={closeDeduction}
        onRefresh={fetchList}
      />
    </>
  );
};

export default ShipmentReconciliationPage;
