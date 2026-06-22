import React, { useState } from 'react';
import { App, Button, Card, Dropdown, Select, Tag } from 'antd';
import { useUser } from '@/utils/AuthContext';
import PageLayout from '@/components/common/PageLayout';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import ResizableTable from '@/components/common/ResizableTable';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ShipmentReconDetailModal from './components/ShipmentReconDetailModal';
import { useShipmentReconData } from './hooks/useShipmentReconData';
import { useShipmentReconColumns } from './hooks/useShipmentReconColumns';
import { useShipmentReconActions } from './hooks/useShipmentReconActions';
import type { ShipmentReconciliation } from '@/types/finance';

const { Option } = Select;

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

  /** 批量审批 */
  const batchApprove = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'pending' || r.status === 'verified');
    if (!eligible.length) { message.warning('请选择状态为"待核实"或"已核实"的记录'); return; }
    handleBatchStatusUpdate(eligible, 'approved', '批量审批成功');
  };

  /** 批量驳回 */
  const batchReject = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status !== 'paid' && r.status !== 'rejected');
    if (!eligible.length) { message.warning('无可驳回的记录'); return; }
    handleBatchStatusUpdate(eligible, 'rejected', '批量驳回成功');
  };

  const statusOptions = [
    { label: '全部', value: '' },
    { label: '待核实', value: 'pending' },
    { label: '已核实', value: 'verified' },
    { label: '已审批', value: 'approved' },
    { label: '已付款', value: 'paid' },
    { label: '已驳回', value: 'rejected' },
  ];

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
        <Card className="filter-card mb-sm">
          <StandardToolbar
            left={
              <>
                <StandardSearchBar
                  searchValue={queryParams.reconciliationNo || ''}
                  onSearchChange={(value) => setQueryParams({ ...queryParams, reconciliationNo: value, page: 1 })}
                  searchPlaceholder="搜索对账单号/客户名/订单号/款号"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={queryParams.status || ''}
                  onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  statusOptions={statusOptions}
                />
                <Select
                  placeholder="客户名"
                  style={{ width: 120, marginLeft: 8 }}
                  value={queryParams.customerName || ''}
                  onChange={(value) => setQueryParams({ ...queryParams, customerName: value, page: 1 })}
                  allowClear
                >
                  <Option value="">全部</Option>
                </Select>
              </>
            }
            right={
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'backfill', label: actionSubmitting ? '处理中...' : '回填对账数据', disabled: actionSubmitting, onClick: handleBackfill },
                    { type: 'divider' as const },
                    { key: 'batchApprove', label: actionSubmitting ? '处理中...' : '批量审批', disabled: actionSubmitting || !selectedRowKeys.length, onClick: batchApprove },
                    { key: 'batchReject', label: actionSubmitting ? '处理中...' : '批量驳回', disabled: actionSubmitting || !selectedRowKeys.length, onClick: batchReject, danger: true },
                  ],
                }}
              >
                <Button>操作</Button>
              </Dropdown>
            }
          />
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
