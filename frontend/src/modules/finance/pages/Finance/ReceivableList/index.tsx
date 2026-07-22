import React, { useCallback, useMemo } from 'react';
import { Card } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import useReceivableList from './useReceivableList';
import StatsCards from './StatsCards';
import FilterBar from './FilterBar';
import getReceivableColumns from './ReceivableTableColumns';
import CreateReceivableModal from './components/CreateReceivableModal';
import MarkReceivedModal from './components/MarkReceivedModal';
import ReceivableDetailModal from './components/ReceivableDetailModal';

const ReceivableList: React.FC = () => {
  const {
    records,
    total,
    loading,
    stats,
    statusFilter,
    setStatusFilter,
    keyword,
    setKeyword,
    sourceBizType,
    setSourceBizType,
    sourceBizNo,
    setSourceBizNo,
    pagination,
    setPagination,
    createOpen,
    setCreateOpen,
    receiveOpen,
    setReceiveOpen,
    activeRecord,
    setActiveRecord,
    detailOpen,
    detailReceivableId,
    fetchList,
    fetchStats,
    goToMaterialPickup,
    openReceivableDetail,
    closeReceivableDetail,
    handleDelete,
  } = useReceivableList();

  const handleSearch = useCallback(() => {
    setPagination({ ...pagination, current: 1 });
    fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo);
  }, [fetchList, keyword, pagination, setPagination, sourceBizNo, sourceBizType, statusFilter]);

  const handleReceive = useCallback((record: typeof activeRecord) => {
    setActiveRecord(record);
    setReceiveOpen(true);
  }, [setActiveRecord, setReceiveOpen]);

  const columns = useMemo(() => getReceivableColumns({
    openReceivableDetail,
    goToMaterialPickup,
    handleDelete,
    onReceive: handleReceive,
  }), [goToMaterialPickup, handleDelete, handleReceive, openReceivableDetail]);

  return (
    <>
      <div style={{ padding: 24 }}>
        <StatsCards stats={stats} />

        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sourceBizType={sourceBizType}
          setSourceBizType={setSourceBizType}
          sourceBizNo={sourceBizNo}
          setSourceBizNo={setSourceBizNo}
          keyword={keyword}
          setKeyword={setKeyword}
          onSearch={handleSearch}
          onCreate={() => setCreateOpen(true)}
        />

        <Card styles={{ body: { padding: 0 } }}>
          <ResizableTable
            rowKey="id"
            columns={columns}
            dataSource={records}
            loading={loading}
            stickyHeader
            scroll={{ x: 1400 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              showTotal: t => `共 ${t} 条`,
            }}
            onChange={p => {
              const page = (p as any).current ?? 1;
              setPagination({ current: page, pageSize: (p as any).pageSize ?? 20 });
              fetchList(page, statusFilter, keyword, sourceBizType, sourceBizNo);
            }}
            showExport={true}
            exportFilename="应收账款.xlsx"
          />
        </Card>

        <CreateReceivableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />

        <MarkReceivedModal
          open={receiveOpen}
          record={activeRecord}
          onClose={() => { setReceiveOpen(false); setActiveRecord(null); }}
          onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
        />
        <ReceivableDetailModal
          open={detailOpen}
          receivableId={detailReceivableId}
          onClose={closeReceivableDetail}
        />
      </div>
    </>
  );
};

export default ReceivableList;
