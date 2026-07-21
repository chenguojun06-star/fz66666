import React from 'react';
import { Button, Space } from 'antd';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { SampleTypeMap } from './types';
import InboundModal from './InboundModal';
import LoanModal from './LoanModal';
import LoanHistoryModal from './LoanHistoryModal';
import TransferToOutstockModal from './TransferToOutstockModal';
import DestroyModal from './components/DestroyModal';
import { buildColumns } from './columns';
import {
  STYLE_INFO_LIST_REFRESH_KEY,
  getRecordSwitchButtonStyle,
} from './helpers';
import { useSampleInventoryData } from './useSampleInventoryData';

// 重新导出以保持向后兼容（外部模块仍从本入口导入）
export { STYLE_INFO_LIST_REFRESH_KEY };

const SampleInventory: React.FC = () => {
  const {
    pagination,
    loading,
    dataSource,
    smartError,
    showSmartErrorNotice,
    searchText,
    setSearchText,
    sampleType,
    setSampleType,
    recordStatus,
    setRecordStatus,
    dateRange,
    setDateRange,
    inboundModal,
    inboundSeed,
    setInboundSeed,
    closeInboundModal,
    loanModal,
    historyDrawer,
    transferVisible,
    setTransferVisible,
    selectedStock,
    setSelectedStock,
    destroyModal,
    closeDestroyModal,
    loadData,
  } = useSampleInventoryData();

  const columns = React.useMemo(
    () =>
      buildColumns({
        onLoan: (record) => loanModal.open(record),
        onTransfer: (record) => {
          setSelectedStock(record);
          setTransferVisible(true);
        },
        onHistory: (record) => historyDrawer.open(record),
        onDestroy: (record) => destroyModal.open(record),
      }),
    [destroyModal, historyDrawer, loanModal, setSelectedStock, setTransferVisible],
  );

  const handleInboundSuccess = React.useCallback(() => {
    localStorage.setItem(STYLE_INFO_LIST_REFRESH_KEY, String(Date.now()));
    closeInboundModal();
    loadData();
    try {
      window.dispatchEvent(new Event('warehouse:in'));
      window.dispatchEvent(new Event('data:changed'));
    } catch (_e) {
      /* 事件派发失败不影响业务 */
    }
  }, [closeInboundModal, loadData]);

  const handleLoanSuccess = React.useCallback(() => {
    loanModal.close();
    loadData();
    try {
      window.dispatchEvent(new Event('data:changed'));
    } catch (_e) {
      /* 事件派发失败不影响业务 */
    }
  }, [loanModal, loadData]);

  const handleTransferSuccess = React.useCallback(() => {
    setTransferVisible(false);
    setSelectedStock(null);
    loadData();
    try {
      window.dispatchEvent(new Event('data:changed'));
    } catch (_e) {
      /* 事件派发失败不影响业务 */
    }
  }, [loadData, setSelectedStock, setTransferVisible]);

  const handleDestroySuccess = React.useCallback(() => {
    closeDestroyModal();
    loadData();
    try {
      window.dispatchEvent(new Event('data:changed'));
    } catch (_e) {
      /* 事件派发失败不影响业务 */
    }
  }, [closeDestroyModal, loadData]);

  return (
    <>
      <PageLayout
        title="样衣库存"
        headerContent={
          showSmartErrorNotice && smartError ? (
            <SmartErrorNotice error={smartError} onFix={() => { void loadData(); }} />
          ) : undefined
        }
        filterLeft={
          <StandardSearchBar
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="搜索款号"
            dateValue={dateRange}
            onDateChange={setDateRange}
            statusValue={sampleType || ''}
            onStatusChange={(value) => setSampleType(value || undefined)}
            showDatePresets={false}
            statusOptions={[
              { label: '全部', value: '' },
              ...Object.entries(SampleTypeMap).map(([key, label]) => ({
                label,
                value: key,
              })),
            ]}
          />
        }
        filterRight={
          <Space>
            <Button
              type="default"
              style={getRecordSwitchButtonStyle(recordStatus === 'active')}
              onClick={() => setRecordStatus('active')}
            >
              在库列表
            </Button>
            <Button
              type="default"
              style={getRecordSwitchButtonStyle(recordStatus === 'destroyed')}
              onClick={() => setRecordStatus('destroyed')}
            >
              销毁记录
            </Button>
            {recordStatus === 'active' && (
              <Button
                type="primary"
                onClick={() => {
                  setInboundSeed(undefined);
                  inboundModal.open();
                }}
              >
                样衣入库
              </Button>
            )}
          </Space>
        }
      >
        <ResizableTable
          storageKey="sample-inventory"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          rowKey="id"
          stickyHeader
          emptyDescription="暂无样衣库存"
          pagination={{
            ...pagination.pagination,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: pagination.onChange,
          }}
        />
      </PageLayout>

      <InboundModal
        visible={inboundModal.visible}
        onCancel={closeInboundModal}
        initialValues={inboundSeed}
        onSuccess={handleInboundSuccess}
      />

      <LoanModal
        visible={loanModal.visible}
        stock={loanModal.data ?? undefined}
        onCancel={loanModal.close}
        onSuccess={handleLoanSuccess}
      />

      <LoanHistoryModal
        visible={historyDrawer.visible}
        stock={historyDrawer.data ?? undefined}
        onClose={historyDrawer.close}
        onRefresh={loadData}
      />

      <TransferToOutstockModal
        visible={transferVisible}
        record={selectedStock}
        onClose={() => setTransferVisible(false)}
        onSuccess={handleTransferSuccess}
      />

      <DestroyModal
        visible={destroyModal.visible}
        stock={destroyModal.data ?? null}
        onCancel={closeDestroyModal}
        onSuccess={handleDestroySuccess}
      />
    </>
  );
};

export default SampleInventory;
