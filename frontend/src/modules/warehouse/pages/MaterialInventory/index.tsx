import React from 'react';
import dayjs from 'dayjs';
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
  Descriptions,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
// D-470：列显隐/列顺序复用项目自带的 ColumnSettings（后端持久化 + localStorage 回退）
import {
  useColumnSettings,
  ColumnSettingsDrawer,
  ColumnSettingsButton,
  type ColumnOption,
} from '@/components/common/ColumnSettings';
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

/**
 * D-470：移入「展开区」的列（主表只留核心列，避免一屏塞 10 列导致观感凌乱）。
 * 模块级常量，避免放进组件导致每次渲染都是新数组、触发 useMemo 依赖告警。
 */
const DETAIL_COLUMN_KEYS = ['fabricProperties', 'price', 'supplier', 'records', 'remark'];
import { useSync } from '@/utils/syncManager';

const { Option } = Select;

const _MaterialInventory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const inventoryData = useMaterialInventoryData();
  const {
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination: _pagination, user,
    lastUpdated,
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    disabledStatus, setDisabledStatus,
    detailModal: _detailModal, inboundModal: _inboundModal, outboundModal: _outboundModal, rollModal, rollForm, printModal: _printModal,
    alertLoading, alertList, alertOptions: _alertOptions,
    fetchData,
    openInstruction, openInstructionEmpty,
    openInstructionFromRecord,
    handleEditSafetyStock,
    handleViewDetail, handleInbound,
    handleOutbound,
    handleToggleDisabled,
  } = inventoryData;

  // 30秒轮询自动刷新物料库存
  // 注意：fetchFn 必须返回非 null/undefined 值，否则 syncManager 会判定为"空数据"并累计 3 次后自动停止
  useSync(
    'warehouse-material-inventory-poll',
    async () => { await fetchData(true); return true; },
    () => {},
    { interval: 30000, pauseOnHidden: true }
  );

  // 跨页面实时联动：其它模块（仓库地图/扫码/领料等）发生库存变动广播 data:changed 后立即刷新
  React.useEffect(() => {
    const handleDataChanged = () => { void fetchData(true); };
    window.addEventListener('data:changed', handleDataChanged);
    return () => window.removeEventListener('data:changed', handleDataChanged);
  }, [fetchData]);

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
    handleToggleDisabled,
    handleViewDetail,
    handleEditSafetyStock,
    onPickStock: (record) => { setPickTarget(record); setPickModalOpen(true); },
  });

  // D-470：主表列显隐/排序（列多时用户可自行精简，避免信息过载导致观感凌乱）
  const columnOptions = React.useMemo<ColumnOption[]>(
    () => columns.map((c) => ({
      key: String(c.key),
      label: typeof c.title === 'string' ? c.title : String(c.key),
    })),
    [columns],
  );
  const {
    visibleColumns,
    orderedVisibleColumns,
    setVisible,
    reset: resetColumns,
    loaded: columnsLoaded,
  } = useColumnSettings({
    pageKey: 'material-inventory-main',
    allColumns: columnOptions,
    defaultVisible: React.useMemo(
      () => Object.fromEntries(columnOptions.map((c) => [c.key, true])),
      [columnOptions],
    ),
  });
  const [columnSettingsOpen, setColumnSettingsOpen] = React.useState(false);

  // 按用户配置过滤 + 排序；偏好未加载完时先展示全量，避免闪空
  const shownColumns = React.useMemo(() => {
    if (!columnsLoaded || orderedVisibleColumns.length === 0) return columns;
    const orderIndex = new Map(orderedVisibleColumns.map((o, i) => [o.key, i]));
    return columns
      .filter((c) => visibleColumns[String(c.key)] !== false)
      .slice()
      .sort(
        (a, b) =>
          (orderIndex.get(String(a.key)) ?? 999) - (orderIndex.get(String(b.key)) ?? 999),
      );
  }, [columns, columnsLoaded, orderedVisibleColumns, visibleColumns]);

  // D-470：主表一次塞 10 列、每列还叠 3~4 行，信息过载是"凌乱"的根源。
  // 拆成「主表只留核心列 + 点开展开看详情」，主表宽度从约 1770px 降到 800px 以内，
  // 一屏放得下、不用横向滚；细节（面料属性/金额/供应商/出入库/备注）按需展开。
  const mainColumns = React.useMemo(
    () => shownColumns.filter((c) => !DETAIL_COLUMN_KEYS.includes(String(c.key))),
    [shownColumns],
  );
  const detailColumns = React.useMemo(
    () => shownColumns.filter((c) => DETAIL_COLUMN_KEYS.includes(String(c.key))),
    [shownColumns],
  );

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

      {/* D-474：面料预警提到页面顶部 —— 库存预警是风险的第一信号，不应埋在 Tab 内 */}
      <div className="material-alerts-section" style={{ marginBottom: 12 }}>
        {showMaterialAI && <MaterialInventoryAISummary stats={stats} alertList={alertList} />}
        <MaterialAlertRanking
          loading={alertLoading}
          alerts={alertList}
          onSendInstruction={openInstruction}
        />
      </div>

      {/* D-474：统计卡片从页面顶部移到 Tab 前（跟具体表格数据强相关，挨着才合理） */}
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

      {/* D-474：数据更新时间戳——证明数字是刚算的不是写死的 */}
      {lastUpdated && (
        <div style={{ fontSize: 12, color: 'var(--color-text-quaternary)', marginBottom: 8, textAlign: 'right' }}>
          数据更新于 {dayjs(lastUpdated).format('HH:mm:ss')}
        </div>
      )}

      <Tabs
        activeKey={activeTab}
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'overview',
            // D-474：Tab 标题简化，只保留"物料仓储"+ 低库存徽章，
            // 副标题"库存与预警"去掉（与卡片内"物料仓储"标题重复）
            label: (
              <Space size={4}>
                物料仓储
                {Number(stats.lowStockCount || 0) > 0 && (
                  <Badge count={Number(stats.lowStockCount || 0)} />
                )}
              </Space>
            ),
            children: (
              <>
                <Card>
                  <div className="u-mb-16">
                    <h2 className="u-m-0"> 物料仓储</h2>
                  </div>

                  <StandardToolbar
                    left={(
                      <Space size={12} wrap>
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
                        <Select
                          value={disabledStatus || ''}
                          onChange={(v) => setDisabledStatus(v || '')}
                          style={{ width: 110 }}
                          options={[
                            { label: '全部状态', value: '' },
                            { label: '启用中', value: 'enabled' },
                            { label: '已停用', value: 'disabled' },
                          ]}
                        />
                      </Space>
                    )}
                    right={(
                      <>
                        {/* D-470：列设置入口 */}
                        <ColumnSettingsButton onClick={() => setColumnSettingsOpen(true)} />
                        <Button onClick={openInstructionEmpty}>发出采购需求</Button>
                        <Button>导出</Button>
                        <Button type="primary" onClick={() => handleInbound()}>入库</Button>
                      </>
                    )}
                  />

                  <ResizableTable
                    storageKey="material-inventory-main"
                    columns={mainColumns}
                    dataSource={dataSource}
                    loading={loading}
                    rowKey="id"
                    stickyHeader
                    // D-470：原 x:1600 小于列宽合计(约1770)，antd 会压缩列宽导致文字挤压变形
                    scroll={{ x: 'max-content' }}
                    // D-470：详情列移入展开区，点击行前的箭头查看
                    expandable={detailColumns.length > 0 ? {
                      expandedRowRender: (record: any) => (
                        <Descriptions
                          size="small"
                          column={2}
                          bordered
                          styles={{ label: { width: 96, color: 'var(--neutral-text-disabled)' } }}
                        >
                          {detailColumns.map((col: any) => (
                            <Descriptions.Item key={String(col.key)} label={col.title}>
                              {typeof col.render === 'function'
                                ? col.render(undefined, record, 0)
                                : (record[col.dataIndex] ?? '-')}
                            </Descriptions.Item>
                          ))}
                        </Descriptions>
                      ),
                      rowExpandable: () => true,
                    } : undefined}
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
                <div className="u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>领料确认与出库管理</div>
              </div>
            ),
            children: (
              <Card>
                <div className="u-mb-16">
                  <h2 className="u-m-0">领料记录</h2>
                  <div className="u-fs-14 u-mt-4" style={{ color: 'var(--color-text-secondary)' }}>
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

      {/* D-470：主表列显隐/排序（侧滑抽屉，与项目其他页面一致） */}
      <ColumnSettingsDrawer
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
        columnOptions={columnOptions}
        visibleColumns={visibleColumns}
        onToggle={setVisible}
        onReset={resetColumns}
        title="库存列表列设置"
      />
    </>
  );
};

export default _MaterialInventory;
