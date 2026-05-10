import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Timeline, Select } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useSettlementData, type PageParams } from './useSettlementData';
import { getSettlementColumns } from './settlementColumns';
import { isOrderFrozenByStatus } from '@/utils/api/production';

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FinishedSettlementContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchFactoryName, setSearchFactoryName] = useState('');
  const {
    searchOrderNo, setSearchOrderNo,
    searchStatus, setSearchStatus,
    loading, data, total,
    selectedRowKeys, setSelectedRowKeys,
    remarkModalVisible, setRemarkModalVisible,
    remarkText, setRemarkText,
    logModalVisible, setLogModalVisible,
    orderLogs,
    dateRange, setDateRange,
    smartError, showSmartErrorNotice,
    pageParams,
    handleSearch, handleReset,
    handleAuditOrder, handleBatchAudit,
    handleExportSelected, handleExport,
    openRemarkModal, saveRemark, openLogModal,
    handleTableChange,
  } = useSettlementData(auditedOrderNos, onAuditNosChange);

  const columns = getSettlementColumns(auditedOrderNos, handleAuditOrder, openRemarkModal, openLogModal);

  const filteredData = useMemo(() => {
    let result = data;
    if (approvalFilter === 'pending') {
      result = result.filter(r => !auditedOrderNos.has(r.orderNo) && r.approvalStatus !== 'APPROVED');
    } else if (approvalFilter === 'approved') {
      result = result.filter(r => auditedOrderNos.has(r.orderNo) || r.approvalStatus === 'APPROVED');
    }
    if (searchFactoryName.trim()) {
      const kw = searchFactoryName.trim().toLowerCase();
      result = result.filter(r => String(r.factoryName || '').toLowerCase().includes(kw));
    }
    return result;
  }, [data, approvalFilter, auditedOrderNos, searchFactoryName]);

  return (
    <>
      <PageLayout
        filterCard={false}
        headerContent={
          showSmartErrorNotice && smartError ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={() => {}} />
            </Card>
          ) : null
        }
        filterLeft={
          <>
              <StandardSearchBar
                searchValue={searchOrderNo}
                onSearchChange={(value) => { setSearchOrderNo(value); handleSearch(); }}
                searchPlaceholder="搜索订单号/款号"
                dateValue={dateRange}
                onDateChange={(value) => { setDateRange(value); handleSearch(); }}
                statusValue={searchStatus}
                onStatusChange={(value) => { setSearchStatus(value || ''); handleSearch({ status: (value || undefined) as PageParams['status'] }); }}
                statusOptions={[
                  { label: '全部', value: '' },
                  { label: '生产中', value: 'production' },
                  { label: '已完成', value: 'completed' },
                ]}
              />
              <Input
                placeholder="搜索工厂名"
                allowClear
                style={{ width: 160 }}
                value={searchFactoryName}
                onChange={e => setSearchFactoryName(e.target.value)}
              />
              <Select
                style={{ width: 120 }}
                value={approvalFilter}
                onChange={setApprovalFilter}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'pending', label: '待审核' },
                  { value: 'approved', label: '已审核' },
                ]}
              />
          </>
        }
        filterRight={
          <>
              <Button type="primary" onClick={handleBatchAudit} disabled={selectedRowKeys.length === 0 || !data.some(r => selectedRowKeys.includes(r.orderId) && r.factoryType !== 'INTERNAL' && !auditedOrderNos.has(r.orderNo) && r.approvalStatus !== 'APPROVED' && isOrderFrozenByStatus(r) && (r.warehousedQuantity ?? 0) > 0)}>
                批量审核 ({selectedRowKeys.length})
              </Button>
              <Button onClick={handleReset}>重置</Button>
              <Button type="primary" onClick={handleExportSelected} disabled={selectedRowKeys.length === 0}>
                导出选中 ({selectedRowKeys.length})
              </Button>
              <Button onClick={handleExport}>导出全部</Button>
          </>
        }
      >
        <ResizableTable
          storageKey="finance-finished-settlement"
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          rowKey="orderId"
          rowSelection={{ selectedRowKeys, onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]) }}
          scroll={{ x: 1800 }}
          pagination={{ current: pageParams.page, pageSize: pageParams.pageSize, total, showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `共 ${total} 条`, pageSizeOptions: ['10', '20', '50', '100'] }}
          onChange={handleTableChange}
        />
      </PageLayout>

      <SmallModal title="编辑备注" open={remarkModalVisible} onOk={saveRemark} onCancel={() => setRemarkModalVisible(false)} okText="保存" cancelText="取消">
        <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--neutral-text-secondary)' }}>备注内容</div>
        <Input.TextArea id="settlementRemark" rows={6} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="请输入备注内容..." maxLength={500} showCount />
      </SmallModal>

      <StandardModal title="操作日志" open={logModalVisible} onCancel={() => setLogModalVisible(false)} footer={<Button onClick={() => setLogModalVisible(false)}>关闭</Button>} size="md">
        {orderLogs.length > 0 ? (
          <Timeline items={orderLogs.map((log: any) => ({ children: (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{log.action || log.operationType}</div>
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: '13px', marginBottom: 4 }}>{log.description || log.content}</div>
              <div style={{ color: 'var(--neutral-text-disabled)', fontSize: '12px' }}>
                <span>{log.operatorName || log.userName || '系统'}</span>
                <span style={{ margin: '0 8px' }}>·</span>
                <span>{log.createTime ? new Date(log.createTime).toLocaleString() : '-'}</span>
              </div>
            </div>
          ) }))} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neutral-text-disabled)' }}>暂无操作日志</div>
        )}
      </StandardModal>
    </>
  );
};

export default FinishedSettlementContent;
