import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Tabs,
  Button,
  Space,
  Input,
  Tag,
  Select,
  Popconfirm,
  Badge,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialAlertRanking from './components/MaterialAlertRanking';
import MaterialInventoryAISummary from './components/MaterialInventoryAISummary';
import './MaterialInventory.css';
import StandardPagination from '@/components/common/StandardPagination';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { paths } from '@/routeConfig';
import { useMaterialInventoryColumns } from './hooks/useMaterialInventoryColumns';
import { useMaterialInventoryData } from './hooks/useMaterialInventoryData';
import { useMaterialPickupData } from './hooks/useMaterialPickupData';
import type { PaymentCenterItem } from './hooks/useMaterialPickupData';
import { useMaterialPickupColumns } from './hooks/useMaterialPickupColumns';
import MaterialInventoryModals from './MaterialInventoryModals';

const { Option } = Select;

const _MaterialInventory: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inventoryData = useMaterialInventoryData();
  const {
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination, user,
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    detailModal, inboundModal, outboundModal, rollModal, rollForm, printModal,
    alertLoading, alertList, alertOptions: _alertOptions,
    pendingPickings, pendingPickingsLoading, confirmingPickingId, cancellingPickingId,
    fetchData, fetchPendingPickings,
    handleConfirmOutbound, handleCancelPending,
    openInstruction, openInstructionEmpty,
    openInstructionFromRecord,
    handleEditSafetyStock,
    handleViewDetail, handleInbound,
    handleOutbound,
    handlePrintOutbound, handlePendingPickingPrint,
  } = inventoryData;

  const pickupData = useMaterialPickupData();
  const jumpToReceivableDetail = React.useCallback((receivableId?: string, receivableNo?: string) => {
    if (!receivableId) {
      return;
    }
    const next = new URLSearchParams();
    next.set('sourceBizType', 'MATERIAL_PICKUP');
    next.set('receivableId', receivableId);
    if (receivableNo) {
      next.set('keyword', receivableNo);
    }
    navigate(`${paths.crmReceivables}?${next.toString()}`);
  }, [navigate]);
  const pickupColumns = useMaterialPickupColumns({
    onAudit:   pickupData.auditModal.open,
    onFinance: pickupData.financeModal.open,
    onCancel:  pickupData.handleCancel,
    onOpenReceivable: (record) => jumpToReceivableDetail(record.receivableId, record.receivableNo),
  });

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
  });

  const inventoryPageSize = pagination.pagination.pageSize;
  const inventoryCurrent = pagination.pagination.current;
  const _inventoryTotalPages = Math.max(1, Math.ceil((pagination.pagination.total || 0) / inventoryPageSize));
  const pickupPageSize = pickupData.pagination.pagination.pageSize;
  const pickupCurrent = pickupData.pagination.pagination.current;
  const paymentPageSize = pickupData.paymentPagination.pagination.pageSize;
  const paymentCurrent = pickupData.paymentPagination.pagination.current;
  const paymentTotal = pickupData.paymentPagination.pagination.total || pickupData.paymentCenterData.length;
  const paymentCenterPagedData = React.useMemo(() => {
    const start = Math.max(0, (paymentCurrent - 1) * paymentPageSize);
    return pickupData.paymentCenterData.slice(start, start + paymentPageSize);
  }, [paymentCurrent, paymentPageSize, pickupData.paymentCenterData]);
  const tabParam = searchParams.get('tab') || 'overview';
  const pickupNoParam = searchParams.get('pickupNo') || '';
  const factoryNameParam = searchParams.get('factoryName') || '';
  const [activeTab, setActiveTab] = React.useState(tabParam);

  React.useEffect(() => {
    const tab = tabParam;
    setActiveTab(tab);
    if (tab === 'pickup') {
      if (pickupNoParam && pickupData.keyword !== pickupNoParam) {
        pickupData.setKeyword(pickupNoParam);
      }
    }
    if (tab === 'payment') {
      void pickupData.fetchPaymentCenter(factoryNameParam ? { factoryName: factoryNameParam } : {});
    }
  }, [factoryNameParam, pickupData.fetchPaymentCenter, pickupData.keyword, pickupData.setKeyword, pickupNoParam, tabParam]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    if (key !== 'pickup') {
      next.delete('pickupNo');
    }
    if (key !== 'payment') {
      next.delete('factoryName');
    }
    setSearchParams(next);
    if (key === 'payment') {
      const factoryName = next.get('factoryName') || '';
      void pickupData.fetchPaymentCenter(factoryName ? { factoryName } : {});
    }
  };

  const jumpToReceivableCenter = (factoryName?: string) => {
    const next = new URLSearchParams();
    next.set('sourceBizType', 'MATERIAL_PICKUP');
    if (factoryName) {
      next.set('keyword', factoryName);
    }
    navigate(`${paths.crmReceivables}?${next.toString()}`);
  };

  return (
    <Layout>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void fetchData();
              }}
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
            }
          ]}
        />

        <Tabs
          activeKey={activeTab}
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'overview',
              label: '库存总览',
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
            current={inventoryCurrent}
            pageSize={inventoryPageSize}
            total={pagination.pagination.total}
            wrapperStyle={{ paddingTop: 12 }}
            onChange={pagination.onChange}
          />
        </Card>

        {/* ===== 待出库领料单 ===== */}
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <ClockCircleOutlined style={{ color: 'var(--color-warning, #faad14)' }} />
              <span>待出库领料</span>
              <Badge count={pendingPickings.length} style={{ backgroundColor: '#faad14' }} />
              <Tooltip title="采购侧点击「仓库领取」后，需由仓库在此处确认出库才会实际扣减库存">
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'help' }}>
                   什么是待出库
                </span>
              </Tooltip>
            </Space>
          }
          extra={
            <Button size="small" onClick={() => void fetchPendingPickings()} loading={pendingPickingsLoading}>
              刷新
            </Button>
          }
        >
          {pendingPickings.length === 0 && !pendingPickingsLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '24px 0' }}>
              暂无待出库单
            </div>
          ) : (
            <ResizableTable
              loading={pendingPickingsLoading}
              rowKey="id"
              dataSource={pendingPickings}
              pagination={false}
              expandable={{
                expandedRowRender: (record) => (
                  <ResizableTable
                    rowKey="id"
                    dataSource={record.items || []}
                    pagination={false}
                    size="small"
                    columns={[
                      { title: '物料编号', dataIndex: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', width: 160 },
                      { title: '颜色', dataIndex: 'color', width: 80 },
                      { title: '规格/幅宽', dataIndex: 'specification', width: 120,
                        render: (_: unknown, row: Record<string, unknown>) => (row.specification || row.size || '-') as string },
                      { title: '供应商', dataIndex: 'supplierName', width: 120 },
                      { title: '库位', dataIndex: 'warehouseLocation', width: 100 },
                      {
                        title: '出库数量',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (qty: number, row: Record<string, unknown>) => `${qty} ${row.unit || '件'}`,
                      },
                      { title: '单价', dataIndex: 'unitPrice', width: 80,
                        render: (val: number) => val != null ? val.toFixed(2) : '-' },
                    ]}
                  />
                ),
                rowExpandable: (record) => !!(record.items && record.items.length > 0),
              }}
              columns={[
                { title: '领料单号', dataIndex: 'pickingNo', width: 180 },
                { title: '订单号', dataIndex: 'orderNo', width: 160 },
                { title: '款号', dataIndex: 'styleNo', width: 130 },
                {
                  title: '工厂',
                  dataIndex: 'factoryName',
                  width: 220,
                  render: (value, record) => {
                    const text = value || '-';
                    const factoryTypeTag = record.factoryType === 'EXTERNAL'
                      ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>外部工厂</Tag>
                      : record.factoryType === 'INTERNAL'
                        ? <Tag color="green" style={{ marginInlineEnd: 0 }}>内部工厂</Tag>
                        : null;
                    return (
                      <Space size={[6, 6]} wrap>
                        <span>{text}</span>
                        {factoryTypeTag}
                      </Space>
                    );
                  },
                },
                { title: '领取人', dataIndex: 'pickerName', width: 100 },
                {
                  title: '出库类型',
                  dataIndex: 'pickupType',
                  width: 100,
                  render: (value) => value === 'EXTERNAL' ? <Tag color="blue">外部</Tag> : <Tag color="green">内部</Tag>,
                },
                {
                  title: '用料场景',
                  dataIndex: 'usageType',
                  width: 120,
                  render: (value) => {
                    const tagMap: Record<string, { text: string; color: string }> = {
                      BULK: { text: '大货用料', color: 'orange' },
                      SAMPLE: { text: '样衣用料', color: 'purple' },
                      STOCK: { text: '备库/补库', color: 'gold' },
                      OTHER: { text: '其他', color: 'default' },
                    };
                    const matched = tagMap[value] || null;
                    if (!matched) {
                      return value || '-';
                    }
                    return matched.text || value || '-';
                  },
                },
                {
                  title: '领取来源',
                  key: 'pickupSource',
                  width: 120,
                  render: (_, record) => {
                    if (record.usageType === 'SAMPLE') return '样衣开发';
                    if (record.usageType === 'BULK') return '生产领料';
                    if (record.usageType === 'STOCK') return '备库领料';
                    return '其他来源';
                  },
                },
                {
                  title: '申请时间',
                  dataIndex: 'createTime',
                  width: 160,
                  render: (t) => t ? String(t).replace('T', ' ').substring(0, 16) : '-',
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (s) => s === 'pending' ? '待出库' : '已出库',
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 200,
                  render: (_, record) => (
                    <Space>
                      <Button size="small" onClick={() => handlePendingPickingPrint(record)}>
                        打印
                      </Button>
                      <Popconfirm
                        title="确认出库"
                        description="确认后将实际扣减库存，不可撤销。"
                        onConfirm={() => void handleConfirmOutbound(record)}
                        okText="出库"
                        cancelText="取消"
                      >
                        <Button
                          type="primary"
                          size="small"
                          loading={confirmingPickingId === record.id}
                        >
                          出库
                        </Button>
                      </Popconfirm>
                      <Popconfirm
                        title="取消领料"
                        description="确认后将取消本次领料申请。"
                        onConfirm={() => void handleCancelPending(record)}
                        okText="确认取消"
                        cancelText="再想想"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          danger
                          size="small"
                          loading={cancellingPickingId === record.id}
                        >
                          取消
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
                </>
              ),
            },
            {
              key: 'pickup',
              label: '领取记录',
              children: (
                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}> 面辅料领取记录</h2>
                  </div>
                  <StandardToolbar
                    left={(
                      <Space>
                        <Input
                          placeholder="搜索领取单号/物料/订单号/款号/工厂…"
                          allowClear
                          style={{ width: 300 }}
                          value={pickupData.keyword}
                          onChange={(e) => { pickupData.setKeyword(e.target.value); void pickupData.fetchData(); }}
                          onPressEnter={() => pickupData.fetchData()}
                        />
                        <Select
                          placeholder="全部工厂"
                          allowClear
                          style={{ width: 130 }}
                          value={pickupData.factoryType || undefined}
                          onChange={(v) => { pickupData.setFactoryType(v ?? ''); void pickupData.fetchData(); }}
                        >
                          <Option value="">全部工厂</Option>
                          <Option value="INTERNAL">内部工厂</Option>
                          <Option value="EXTERNAL">外部工厂</Option>
                        </Select>
                      </Space>
                    )}
                    right={(
                      <Space>
                        {pickupData.selectedRowKeys.length > 0 && (
                          <Button
                            onClick={() => pickupData.batchAuditModal.open(null)}
                          >
                            批量审核（{pickupData.selectedRowKeys.length}）
                          </Button>
                        )}
                      </Space>
                    )}
                  />
                  <ResizableTable
                    storageKey="material-pickup-records"
                    columns={pickupColumns}
                    dataSource={pickupData.dataSource}
                    loading={pickupData.loading}
                    rowKey="id"
                    stickyHeader
                    scroll={{ x: 1600 }}
                    pagination={false}
                    rowSelection={{
                      type: 'checkbox',
                      selectedRowKeys: pickupData.selectedRowKeys,
                      onChange: (keys) => pickupData.setSelectedRowKeys(keys as string[]),
                      getCheckboxProps: (record) => ({
                        disabled: record.auditStatus !== 'PENDING',
                      }),
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
            {
              key: 'payment',
              label: '收款中心',
              children: (
                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 4 }}> 面辅料领取应收汇总</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      领取记录审核通过后会自动生成应收账单，这里按工厂汇总待收/已收金额，并推动到收款中心登记回款。
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Button onClick={() => void pickupData.fetchPaymentCenter()}>刷新</Button>
                  </div>
                  <ResizableTable
                    storageKey="material-payment-center"
                    rowKey="factoryName"
                    loading={pickupData.paymentCenterLoading}
                    dataSource={paymentCenterPagedData}
                    columns={[
                      { title: '工厂名称', dataIndex: 'factoryName', width: 200 },
                      {
                        title: '工厂类型', dataIndex: 'factoryType', width: 100,
                        render: (v: string) => v === 'INTERNAL'
                          ? <Tag color="green">内部工厂</Tag>
                          : v === 'EXTERNAL'
                            ? <Tag color="blue">外部工厂</Tag>
                            : '-',
                      },
                      {
                        title: '待收款金额', dataIndex: 'pendingAmount', width: 140,
                        render: (v: number) => (
                          <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{Number(v || 0).toLocaleString()}</span>
                        ),
                      },
                      {
                        title: '已收款金额', dataIndex: 'settledAmount', width: 140,
                        render: (v: number) => (
                          <span style={{ color: '#52c41a' }}>¥{Number(v || 0).toLocaleString()}</span>
                        ),
                      },
                      {
                        title: '总金额', dataIndex: 'totalAmount', width: 120,
                        render: (v: number) => `¥${Number(v || 0).toLocaleString()}`,
                      },
                      {
                        title: '待收/已收/总笔数', key: 'counts', width: 160,
                        render: (_: unknown, r: PaymentCenterItem) =>
                          `${r.pendingCount} / ${r.settledCount} / ${r.totalCount}`,
                      },
                      {
                        title: '操作', key: 'actions', width: 220,
                        render: (_: unknown, record: PaymentCenterItem) => {
                          const pendingIds = (record.records || [])
                            .filter((r) => r.receivableStatus !== 'PAID')
                            .map((r) => r.id);
                          return (
                            <Space size={6}>
                              <Button
                                size="small"
                                onClick={() => jumpToReceivableCenter(record.factoryName)}
                              >
                                查看应收单
                              </Button>
                              {record.pendingCount === 0 ? (
                                <Tag color="green">已全部收款</Tag>
                              ) : (
                                <Button
                                  type="primary"
                                  size="small"
                                  loading={pickupData.paymentSettling}
                                  onClick={() => void pickupData.handlePaymentSettle(pendingIds)}
                                >
                                  登记收款
                                </Button>
                              )}
                            </Space>
                          );
                        },
                      },
                    ]}
                    stickyHeader
                    pagination={false}
                  />
                  <StandardPagination
                    current={paymentCurrent}
                    pageSize={paymentPageSize}
                    total={paymentTotal}
                    wrapperStyle={{ paddingTop: 12 }}
                    onChange={pickupData.paymentPagination.onChange}
                  />
                </Card>
              ),
            },
          ]}
          onChange={handleTabChange}
        />

      <MaterialInventoryModals inventoryData={inventoryData} pickupData={pickupData} />
    </Layout>
  );
};

export default _MaterialInventory;
