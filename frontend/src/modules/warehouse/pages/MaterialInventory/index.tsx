import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Tabs,
  Button,
  Space,
  Input,
  Tag,
  Select,
  Popconfirm,
  DatePicker,
  Badge,
} from 'antd';
import type { Dayjs } from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialAlertRanking from './components/MaterialAlertRanking';
import MaterialInventoryAISummary from './components/MaterialInventoryAISummary';
import './MaterialInventory.css';
import StandardPagination from '@/components/common/StandardPagination';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';

import { useMaterialInventoryColumns } from './hooks/useMaterialInventoryColumns';
import { useMaterialInventoryData } from './hooks/useMaterialInventoryData';
import { useMaterialPickupData } from './hooks/useMaterialPickupData';
import type { PickingRow } from './hooks/useMaterialPickupData';
import MaterialOutboundPrintModal from './components/MaterialOutboundPrintModal';
import StockPickModal from './components/StockPickModal';
import MaterialInventoryModals from './MaterialInventoryModals';

const { Option } = Select;

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待出库', color: 'orange' },
  completed: { text: '已出库', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
};

const USAGE_TYPE_MAP: Record<string, { text: string; color: string }> = {
  BULK: { text: '大货用料', color: 'orange' },
  SAMPLE: { text: '样衣用料', color: 'purple' },
  STOCK: { text: '备库/补库', color: 'gold' },
  OTHER: { text: '其他', color: 'default' },
};

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

  const pickupData = useMaterialPickupData();
  const pickupPageSize = pickupData.pagination.pagination.pageSize;
  const pickupCurrent = pickupData.pagination.pagination.current;

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

  const pickingColumns = [
    { title: '领料单号', dataIndex: 'pickingNo', width: 180 },
    { title: '订单号', dataIndex: 'orderNo', width: 160 },
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      width: 200,
      render: (value: string, record: PickingRow) => {
        const text = value || '-';
        const factoryTypeTag = record.factoryType === 'EXTERNAL'
          ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>外部</Tag>
          : record.factoryType === 'INTERNAL'
            ? <Tag color="green" style={{ marginInlineEnd: 0 }}>内部</Tag>
            : null;
        return <Space size={[6, 6]} wrap><span>{text}</span>{factoryTypeTag}</Space>;
      },
    },
    { title: '领取人', dataIndex: 'pickerName', width: 100 },
    {
      title: '出库类型',
      dataIndex: 'pickupType',
      width: 90,
      render: (v: string) => v === 'EXTERNAL' ? <Tag color="blue">外部</Tag> : <Tag color="green">内部</Tag>,
    },
    {
      title: '用料场景',
      dataIndex: 'usageType',
      width: 110,
      render: (v: string) => {
        const matched = USAGE_TYPE_MAP[v];
        return matched ? <Tag color={matched.color}>{matched.text}</Tag> : (v || '-');
      },
    },
    {
      title: '申请时间',
      dataIndex: 'createTime',
      width: 150,
      render: (t: string) => t ? String(t).replace('T', ' ').substring(0, 16) : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { text: s || '未知', color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '审核状态',
      dataIndex: 'auditStatus',
      width: 100,
      render: (status: string, record: PickingRow) => {
        if (record.status !== 'completed') return '-';
        if (status === 'APPROVED') return <Tag color="green">已审核</Tag>;
        if (status === 'REJECTED') return <Tag color="red">已拒绝</Tag>;
        return <Tag color="orange">待审核</Tag>;
      },
    },
    {
      title: '财务状态',
      dataIndex: 'financeStatus',
      width: 100,
      render: (status: string, record: PickingRow) => {
        if (record.status !== 'completed') return '-';
        if (record.auditStatus !== 'APPROVED') return '-';
        if (status === 'SETTLED') return <Tag color="green">已平账</Tag>;
        if (status === 'PENDING') return <Tag color="orange">待结算</Tag>;
        return <Tag color="default">{status || '-'}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_: unknown, record: PickingRow) => {
        const actions: React.ReactNode[] = [];
        actions.push(
          <Button key="print" size="small" onClick={() => pickupData.handlePrint(record)}>
            打印
          </Button>
        );
        if (record.status === 'pending') {
          actions.push(
            <Popconfirm
              key="confirm"
              title="确认出库"
              description="确认后将实际扣减库存，不可撤销。"
              onConfirm={() => void pickupData.handleConfirmOutbound(record)}
              okText="出库"
              cancelText="取消"
            >
              <Button type="primary" size="small" loading={pickupData.confirmingId === record.id}>
                出库
              </Button>
            </Popconfirm>
          );
          actions.push(
            <Popconfirm
              key="cancel"
              title="取消领料"
              description="确认后将取消本次领料申请，释放锁定库存。"
              onConfirm={() => void pickupData.handleCancelPending(record)}
              okText="确认取消"
              cancelText="再想想"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" loading={pickupData.cancellingId === record.id}>
                取消
              </Button>
            </Popconfirm>
          );
        }
        if (record.status === 'completed' && !record.auditStatus) {
          actions.push(
            <Popconfirm
              key="audit"
              title="审核确认"
              description={record.factoryType === 'EXTERNAL'
                ? '审核通过后将自动生成外发工厂应收账单。'
                : '审核通过后将做内部平账处理。'}
              onConfirm={() => void pickupData.handleAudit(record.id, 'approve',
                record.factoryType === 'EXTERNAL' ? '外发工厂领料审核通过' : '内部领料审核通过')}
              okText="审核通过"
              cancelText="取消"
            >
              <Button type="primary" size="small" loading={pickupData.auditingId === record.id}>
                审核
              </Button>
            </Popconfirm>
          );
        }
        return <Space size={6}>{actions}</Space>;
      },
    },
  ];

  const itemColumns = [
    { title: '物料编号', dataIndex: 'materialCode', width: 140 },
    { title: '物料名称', dataIndex: 'materialName', width: 160 },
    { title: '颜色', dataIndex: 'color', width: 80 },
    {
      title: '规格/幅宽', dataIndex: 'specification', width: 120,
      render: (_: any, row: any) => row.specification || row.size || '-',
    },
    { title: '供应商', dataIndex: 'supplierName', width: 120 },
    { title: '库位', dataIndex: 'warehouseLocation', width: 100 },
    {
      title: '出库数量', dataIndex: 'quantity', width: 100,
      render: (qty: number, row: any) => `${qty} ${row.unit || '件'}`,
    },
    {
      title: '单价', dataIndex: 'unitPrice', width: 80,
      render: (val: number) => val != null ? val.toFixed(2) : '-',
    },
  ];

  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => { void fetchData(); }}
          />
        </Card>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>数据概览</h2>
      </div>
      <PageStatCards
        activeKey={selectedType || 'all'}
        cards={[
          {
            key: 'all',
            items: [
              { label: '库存总值', value: `¥${Number(stats.totalValue || 0).toLocaleString()}`, color: 'var(--color-primary)' },
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
                    <Badge count={Number(stats.lowStockCount || 0)} size="small" />
                  )}
                </Space>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>物料进销存与预警</div>
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
                    <h2 style={{ margin: 0 }}> 物料进销存</h2>
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
                          { label: '面料', value: '面料' },
                          { label: '辅料', value: '辅料' },
                          { label: '配件', value: '配件' },
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
                  <Badge count={pickupData.pagination.pagination.total || 0} size="small" />
                </Space>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>领料确认与出库管理</div>
              </div>
            ),
            children: (
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}>领料记录</h2>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>
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
                        onChange={(e) => { pickupData.setKeyword(e.target.value); void pickupData.fetchData(); }}
                        onPressEnter={() => pickupData.fetchData()}
                      />
                      <Select
                        placeholder="全部状态"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.statusFilter || undefined}
                        onChange={(v) => { pickupData.setStatusFilter(v ?? ''); void pickupData.fetchData(); }}
                      >
                        <Option value="">全部状态</Option>
                        <Option value="pending">待出库</Option>
                        <Option value="completed">已出库</Option>
                        <Option value="cancelled">已取消</Option>
                      </Select>
                      <Select
                        placeholder="出库类型"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.pickupType || undefined}
                        onChange={(v) => { pickupData.setPickupType(v ?? undefined); void pickupData.fetchData(); }}
                      >
                        <Option value="INTERNAL">内部</Option>
                        <Option value="EXTERNAL">外部</Option>
                      </Select>
                      <Select
                        placeholder="用料场景"
                        allowClear
                        style={{ width: 120 }}
                        value={pickupData.usageType || undefined}
                        onChange={(v) => { pickupData.setUsageType(v ?? undefined); void pickupData.fetchData(); }}
                      >
                        <Option value="BULK">大货用料</Option>
                        <Option value="SAMPLE">样衣用料</Option>
                        <Option value="STOCK">备库/补库</Option>
                      </Select>
                      <DatePicker.RangePicker
                        placeholder={['开始日期', '结束日期']}
                        value={pickupData.dateRange}
                        onChange={(dates) => { pickupData.setDateRange(dates as [Dayjs, Dayjs] | null); void pickupData.fetchData(); }}
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
                        size="small"
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
