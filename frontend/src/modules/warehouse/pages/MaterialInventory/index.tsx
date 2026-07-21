import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Tabs,
  Button,
  Space,
  Input,
  Select,
  DatePicker,
  Badge,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialAlertRanking from './components/MaterialAlertRanking';
import MaterialInventoryAISummary from './components/MaterialInventoryAISummary';
import './MaterialInventory.css';
import StandardPagination from '@/components/common/StandardPagination';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { canViewPrice } from '@/utils/sensitiveDataMask';

import { useMaterialInventoryColumns } from './hooks/useMaterialInventoryColumns';
import { useMaterialInventoryData } from './hooks/useMaterialInventoryData';
import { useMaterialPickupData } from './hooks/useMaterialPickupData';
import type { PickingRow } from './hooks/useMaterialPickupData';
import { usePickupFilters } from './hooks/usePickupFilters';
import { buildPickingColumns, buildItemColumns } from './columns';
import MaterialOutboundPrintModal from './components/MaterialOutboundPrintModal';
import StockPickModal from './components/StockPickModal';
import MaterialInventoryModals from './MaterialInventoryModals';
import { useSync } from '@/utils/syncManager';

const { Option } = Select;

const _MaterialInventory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const inventoryData = useMaterialInventoryData();
  const {
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination: _pagination, user,
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    detailModal: _detailModal, inboundModal: _inboundModal, outboundModal: _outboundModal, rollModal, rollForm, printModal: _printModal,
    alertLoading, alertList, alertOptions: _alertOptions,
    fetchData,
    openInstruction, openInstructionEmpty,
    openInstructionFromRecord,
    handleEditSafetyStock,
    handleViewDetail, handleInbound,
    handleOutbound,
    handlePrintOutbound,
  } = inventoryData;

  // 30秒轮询自动刷新物料库存
  useSync(
    'warehouse-material-inventory-poll',
    async () => { await fetchData(); },
    () => {},
    { interval: 30000, pauseOnHidden: true }
  );

  const canSeePrice = canViewPrice(user);

  const pickupData = useMaterialPickupData();
  const pickupPageSize = pickupData.pagination.pagination.pageSize;
  const pickupCurrent = pickupData.pagination.pagination.current;

  const {
    handlePickupKeywordChange,
    handlePickupStatusChange,
    handlePickupTypeChange,
    handleUsageTypeChange,
    handlePickupDateRangeChange,
  } = usePickupFilters(pickupData);

  const [pickModalOpen, setPickModalOpen] = React.useState(false);
  const [pickTarget, setPickTarget] = React.useState<any>(null);

  const columns = useMaterialInventoryColumns({
    user,
    openInstructionFromRecord,
    handleInbound,
    rollForm,
    rollModal,
    handleOutbound,
    handlePrintOutbound,
    handleViewDetail,
    handleEditSafetyStock,
    onPickStock: (record) => { setPickTarget(record); setPickModalOpen(true); },
  });

  const tabParam = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = React.useState(tabParam);

  React.useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next);
  };

  const pickingColumns = buildPickingColumns({
    handlePrint: pickupData.handlePrint,
    confirmingId: pickupData.confirmingId,
    handleConfirmOutbound: pickupData.handleConfirmOutbound,
    cancellingId: pickupData.cancellingId,
    handleCancelPending: pickupData.handleCancelPending,
    auditingId: pickupData.auditingId,
    handleAudit: pickupData.handleAudit,
  });

  const itemColumns = buildItemColumns(canSeePrice);

  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => { void fetchData(); }}
          />
        </Card>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>数据概览</h2>
      </div>
      <PageStatCards
        activeKey={selectedType || 'all'}
        cards={[
          {
            key: 'all',
            items: [
              { label: '库存总值', value: canSeePrice ? `¥${Number(stats.totalValue || 0).toLocaleString()}` : '***', color: 'var(--color-primary)' },
              { label: '库存总量', value: Number(stats.totalQty || 0), unit: '件/米', color: 'var(--color-success)' },
            ],
            onClick: () => setSelectedType(''),
            activeColor: 'var(--color-primary)',
          },
          {
            key: 'low',
            items: [
              { label: '低于安全库存', value: Number(stats.lowStockCount || 0), unit: '种', color: 'var(--color-danger)' },
              { label: '物料种类', value: Number(stats.materialTypes || 0), unit: '类', color: 'var(--color-info)' },
            ],
            onClick: () => setSelectedType('low'),
            activeColor: 'var(--color-danger)',
          },
          {
            key: 'today',
            items: [
              { label: '今日入库', value: Number(stats.todayInCount || 0), unit: '次', color: 'var(--color-success)' },
              { label: '今日出库', value: Number(stats.todayOutCount || 0), unit: '次', color: 'var(--color-warning)' },
            ],
            onClick: () => setSelectedType('today'),
            activeColor: 'var(--color-success)',
          },
          {
            key: 'monthAmount',
            items: [
              { label: '本月入库金额', value: canSeePrice ? `¥${Number((stats as any).monthInAmount || 0).toLocaleString()}` : '***', color: 'var(--color-success)' },
              { label: '本月出库金额', value: canSeePrice ? `¥${Number((stats as any).monthOutAmount || 0).toLocaleString()}` : '***', color: 'var(--color-warning)' },
            ],
            onClick: () => setSelectedType('monthAmount'),
            activeColor: 'var(--color-success)',
          },
        ]}
      />

      <Tabs
        activeKey={activeTab}
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'overview',
            label: (
              <div>
                <Space size={4}>
                  库存总览
                  {Number(stats.lowStockCount || 0) > 0 && (
                    <Badge count={Number(stats.lowStockCount || 0)} />
                  )}
                </Space>
                <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>物料出入库与预警</div>
              </div>
            ),
            children: (
              <>
                <div className="material-alerts-section">
                  {showMaterialAI && <MaterialInventoryAISummary stats={stats} alertList={alertList} />}
                  <MaterialAlertRanking
                    loading={alertLoading}
                    alerts={alertList}
                    onSendInstruction={openInstruction}
                  />
                </div>

                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}> 物料出入库</h2>
                  </div>

                  <StandardToolbar
                    left={(
                      <StandardSearchBar
                        searchValue={searchText}
                        onSearchChange={setSearchText}
                        searchPlaceholder="搜索物料编号/名称"
                        statusValue={selectedType}
                        onStatusChange={setSelectedType}
                        showDate={true}
                        dateValue={dateRange}
                        onDateChange={setDateRange}
                        statusOptions={[
                          { label: '全部', value: '' },
                          { label: '面料', value: 'fabric' },
                          { label: '辅料', value: 'accessory' },
                          { label: '里料', value: 'lining' },
                        ]}
                      />
                    )}
                    right={(
                      <>
                        <Button onClick={openInstructionEmpty}>发出采购需求</Button>
                        <Button>导出</Button>
                        <Button type="primary" onClick={() => handleInbound()}>入库</Button>
                      </>
                    )}
                  />

                  <ResizableTable
                    storageKey="material-inventory-main"
                    columns={columns}
                    dataSource={dataSource}
                    loading={loading}
                    rowKey="id"
                    stickyHeader
                    scroll={{ x: 1600 }}
                    pagination={false}
                    emptyDescription="暂无原料库存数据"
                    emptyActionText="去新增入库"
                    onEmptyAction={() => { window.location.href = '/warehouse/material-inbound'; }}
                  />
                  <StandardPagination
                    current={inventoryData.pagination.pagination.current}
                    pageSize={inventoryData.pagination.pagination.pageSize}
                    total={inventoryData.pagination.pagination.total}
                    wrapperStyle={{ paddingTop: 12 }}
                    onChange={inventoryData.pagination.onChange}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'pickup',
            label: (
              <div>
                <Space size={4}>
                  领取记录
                  <Badge count={pickupData.pendingPickupCount || 0} />
                </Space>
                <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>领料确认与出库管理</div>
              </div>
            ),
            children: (
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}>领料记录</h2>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
                    流程：采购侧领取 → 仓库确认出库 → 审核通过（外发工厂自动扣款/内部工厂平账）→ 打印出库单
                  </div>
                </div>
                <StandardToolbar
                  left={(
                    <Space>
                      <Input
                        placeholder="搜索领料单号/订单号/款号"
                        allowClear
                        style={{ width: 220 }}
                        value={pickupData.keyword}
                        onChange={(e) => handlePickupKeywordChange(e.target.value)}
                        onPressEnter={() => pickupData.fetchData()}
                      />
                      <Select
                        placeholder="全部状态"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.statusFilter || undefined}
                        onChange={handlePickupStatusChange}
                      >
                        <Option value="">全部状态</Option>
                        <Option value="pending">待出库</Option>
                        <Option value="completed">已出库</Option>
                        <Option value="cancelled">已取消</Option>
                      </Select>
                      <Select
                        placeholder="领取类型"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.pickupType || undefined}
                        onChange={handlePickupTypeChange}
                      >
                        <Option value="INTERNAL">内部</Option>
                        <Option value="EXTERNAL">外部</Option>
                      </Select>
                      <Select
                        placeholder="用料场景"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.usageType || undefined}
                        onChange={handleUsageTypeChange}
                      >
                        <Option value="BULK">大货用料</Option>
                        <Option value="SAMPLE">样衣用料</Option>
                        <Option value="STOCK">备库/补库</Option>
                      </Select>
                      <DatePicker.RangePicker
                        placeholder={['开始日期', '结束日期']}
                        value={pickupData.dateRange}
                        onChange={handlePickupDateRangeChange}
                        style={{ width: 240 }}
                      />
                    </Space>
                  )}
                  right={(
                    <Button onClick={() => void pickupData.fetchData()}>刷新</Button>
                  )}
                />
                <ResizableTable
                  storageKey="material-picking-records"
                  columns={pickingColumns}
                  dataSource={pickupData.dataSource}
                  loading={pickupData.loading}
                  emptyDescription="暂无领料数据"
                  rowKey="id"
                  stickyHeader
                  scroll={{ x: 1600 }}
                  pagination={false}
                  expandable={{
                    expandedRowRender: (record: PickingRow) => (
                      <ResizableTable
                        rowKey="id"
                        dataSource={record.items || []}
                        pagination={false}
                        emptyDescription="暂无数据"
                        columns={itemColumns}
                      />
                    ),
                    rowExpandable: (record: PickingRow) => !!(record.items && record.items.length > 0),
                  }}
                />
                <StandardPagination
                  current={pickupCurrent}
                  pageSize={pickupPageSize}
                  total={pickupData.pagination.pagination.total}
                  wrapperStyle={{ paddingTop: 12 }}
                  onChange={pickupData.pagination.onChange}
                />
              </Card>
            ),
          },
        ]}
        onChange={handleTabChange}
      />

      <MaterialInventoryModals inventoryData={inventoryData} />

      <StockPickModal
        open={pickModalOpen}
        record={pickTarget}
        onClose={() => { setPickModalOpen(false); setPickTarget(null); }}
        onPicked={fetchData}
      />

      {pickupData.printVisible && pickupData.printPayload && (
        <MaterialOutboundPrintModal
          open={pickupData.printVisible}
          data={pickupData.printPayload}
          onClose={pickupData.closePrint}
        />
      )}
    </>
  );
};

export default _MaterialInventory;
