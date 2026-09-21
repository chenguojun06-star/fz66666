import React, { useMemo } from 'react';
import { Card, Button, Descriptions, Input, Select, Empty, Space, Statistic, Timeline, Tabs, Table, InputNumber } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useSettlementData, type PageParams, type FinishedSettlementRow } from './useSettlementData';
import { getSettlementColumns } from './settlementColumns';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { usePersistentTab } from '@/hooks/usePersistentTab';

/**
 * D-471：移入「展开区」的结算列。
 * 该表 18 列 / 约 2430px（全场最宽），主表只留订单·款号·工厂·状态·完成时间·总金额·利润，
 * 数量与成本明细（颜色/下单/入库/次品/结算价/材料成本/生产成本/次品损耗）按需展开。
 * 模块级常量，避免放进组件导致每次渲染都是新数组。
 */
const SETTLEMENT_DETAIL_KEYS = [
  'colors', 'orderQuantity', 'warehousedQuantity', 'defectQuantity',
  'styleFinalPrice', 'materialCost', 'productionCost', 'defectLoss',
];

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FinishedSettlementContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
  const [approvalFilter, setApprovalFilter] = usePersistentTab<'all' | 'pending' | 'approved'>(
    'settleFilter', 'all', ['all', 'pending', 'approved'],
  );
  const {
    searchOrderNo, setSearchOrderNo,
    searchStatus, setSearchStatus,
    loading, data, total,
    selectedRowKeys, setSelectedRowKeys,
    remarkModalVisible, setRemarkModalVisible,
    remarkText, setRemarkText,
    logModalVisible, setLogModalVisible,
    orderLogs,
    deductionModalVisible, setDeductionModalVisible,
    deductionOrderId, deductionItems, setDeductionItems,
    deductionLoading,
    dateRange, setDateRange,
    smartError, showSmartErrorNotice,
    pageParams,
    handleSearch, handleReset,
    handleAuditOrder, handleBatchAudit,
    handleExport,
    openRemarkModal, saveRemark, openLogModal,
    openDeductionModal, saveDeductionItems,
    handleTableChange,
  } = useSettlementData(auditedOrderNos, onAuditNosChange);

  const columns = getSettlementColumns(auditedOrderNos, handleAuditOrder, openRemarkModal, openLogModal, openDeductionModal);

  // D-471：主表只留核心列，数量与成本明细移入展开区
  const colKeyOf = (c: Record<string, unknown>) => String(c.key ?? c.dataIndex ?? '');
  const mainColumns = useMemo(
    () => columns.filter((c) => !SETTLEMENT_DETAIL_KEYS.includes(colKeyOf(c as unknown as Record<string, unknown>))),
    [columns],
  );
  const detailColumns = useMemo(
    () => columns.filter((c) => SETTLEMENT_DETAIL_KEYS.includes(colKeyOf(c as unknown as Record<string, unknown>))),
    [columns],
  );

  const filteredData = useMemo(() => {
    let result = data;
    if (approvalFilter === 'pending') {
      result = result.filter(r => !auditedOrderNos.has(r.orderNo) && r.approvalStatus !== 'APPROVED');
    } else if (approvalFilter === 'approved') {
      result = result.filter(r => auditedOrderNos.has(r.orderNo) || r.approvalStatus === 'APPROVED');
    }
    return result;
  }, [data, approvalFilter, auditedOrderNos]);

  const stats = useMemo(() => {
    const pendingCount = data.filter(r => !auditedOrderNos.has(r.orderNo) && r.approvalStatus !== 'APPROVED').length;
    const approvedCount = data.filter(r => auditedOrderNos.has(r.orderNo) || r.approvalStatus === 'APPROVED').length;
    const totalAmount = data.reduce((s: number, r: any) => s + Number(r.totalAmount ?? 0), 0);
    return { pendingCount, approvedCount, totalAmount };
  }, [data, auditedOrderNos]);

  const activeTab = approvalFilter === 'pending' ? 'pending' : approvalFilter === 'approved' ? 'approved' : '';
  const handleTabChange = (key: string) => {
    if (key === 'pending') setApprovalFilter('pending');
    else if (key === 'approved') setApprovalFilter('approved');
    else setApprovalFilter('all');
  };

  return (
    <>
      {/* ===== 统计卡片 ===== */}
      <div className="u-d-grid u-gap-12 u-mb-12" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 13 }} />待审批</span>}
            value={stats.pendingCount}
            suffix="条"
            valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 13 }} />已审批</span>}
            value={stats.approvedCount}
            suffix="条"
            valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><DollarOutlined style={{ marginRight: 4, fontSize: 13 }} />订单数</span>}
            value={total}
            suffix="条"
            valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>合计金额</span>}
            value={stats.totalAmount}
            precision={2}
            prefix="¥"
            valueStyle={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500 }}
          />
        </Card>
      </div>

      <PageLayout
        filterCard={false}
        headerContent={
          showSmartErrorNotice && smartError ? (
            <Card style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={() => { }} />
            </Card>
          ) : null
        }
      >
        {/* 筛选区 */}
        <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            size="small"
            items={[
              { key: '', label: `全部 (${data.length})` },
              { key: 'pending', label: `待审批 (${stats.pendingCount})` },
              { key: 'approved', label: `已审批 (${stats.approvedCount})` },
            ]}
            style={{ marginBottom: 8 }}
          />
          <div className="u-d-flex u-jc-between u-ai-center u-fwrap-wrap u-gap-8">
            <Space size={8} wrap>
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

            </Space>
            <Space size={8}>
              <span className="u-fs-13" style={{ color: 'var(--color-text-tertiary)' }}>
                {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 条` : `共 ${total} 条`}
              </span>
              <Button
                type="primary"
                ghost
                size="small"
                onClick={handleBatchAudit}
                disabled={selectedRowKeys.length === 0 || !data.some(r => selectedRowKeys.includes(r.orderId) && r.factoryType !== 'INTERNAL' && !auditedOrderNos.has(r.orderNo) && r.approvalStatus !== 'APPROVED' && isOrderFrozenByStatus(r) && (r.warehousedQuantity ?? 0) > 0)}
              >
                批量审批 ({selectedRowKeys.length})
              </Button>
              <Button size="small" ghost onClick={handleReset}>重置</Button>
              <Button size="small" ghost icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          </div>
        </Card>

        <ResizableTable
          storageKey="finance-finished-settlement"
          columns={mainColumns}
          dataSource={filteredData}
          loading={loading}
          rowKey="orderId"
          // D-471：数量与成本明细移入展开区（该表原 18 列 / 2430px）
          expandable={detailColumns.length > 0 ? {
            expandedRowRender: (row: FinishedSettlementRow) => {
              const record = row as unknown as Record<string, unknown>;
              return (
                <Descriptions
                  size="small"
                  column={4}
                  bordered
                  styles={{ label: { width: 88, color: 'var(--color-text-tertiary)' } }}
                >
                  {detailColumns.map((col: unknown, idx: number) => {
                    const c = col as Record<string, unknown>;
                    const ck = String(c.key ?? c.dataIndex ?? '');
                    return (
                      <Descriptions.Item
                        key={ck || idx}
                        label={typeof c.title === 'string' ? c.title : ck}
                      >
                        {typeof c.render === 'function'
                          ? (c.render as (v: unknown, r: unknown, i: number) => React.ReactNode)(
                              record[String(c.dataIndex)], row, idx,
                            )
                          : String(record[String(c.dataIndex)] ?? '-')}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              );
            },
            rowExpandable: () => true,
          } : undefined}
          rowSelection={{ selectedRowKeys, onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]) }}
          scroll={{ x: 1800 }}
          pagination={{ current: pageParams.page, pageSize: pageParams.pageSize, total, showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 条`, pageSizeOptions: ['10', '20', '50', '100'] }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </PageLayout>

      <SmallModal title="编辑备注" open={remarkModalVisible} onOk={saveRemark} onCancel={() => setRemarkModalVisible(false)} okText="保存" cancelText="取消">
        <div className="u-mb-8 u-fs-14" style={{ color: 'var(--neutral-text-secondary)' }}>备注内容</div>
        <Input.TextArea rows={6} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="请输入备注内容..." maxLength={500} showCount />
      </SmallModal>

      <StandardModal title="操作日志" open={logModalVisible} onCancel={() => setLogModalVisible(false)} footer={<Button onClick={() => setLogModalVisible(false)}>关闭</Button>} size="md">
        {orderLogs.length > 0 ? (
          <Timeline items={orderLogs.map((log: any) => ({
            content: (
              <div>
                <div className="u-fw-600 u-mb-4">{log.action || log.operationType}</div>
                <div className="u-fs-13 u-mb-4" style={{ color: 'var(--neutral-text-secondary)' }}>{log.description || log.content}</div>
                <div className="u-fs-12" style={{ color: 'var(--neutral-text-disabled)' }}>
                  <span>{log.operatorName || log.userName || '系统'}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>{log.createTime ? new Date(log.createTime).toLocaleString() : '-'}</span>
                </div>
              </div>
            ),
          }))} />
        ) : (
          <div className="u-ta-center" style={{ padding: '40px', color: 'var(--neutral-text-disabled)' }}>暂无操作日志</div>
        )}
      </StandardModal>

      <DeductionModal
        open={deductionModalVisible}
        orderId={deductionOrderId}
        items={deductionItems}
        loading={deductionLoading}
        onCancel={() => setDeductionModalVisible(false)}
        onSave={saveDeductionItems}
        onItemsChange={setDeductionItems}
      />
    </>
  );
};

interface DeductionModalProps {
  open: boolean;
  orderId: string;
  items: any[];
  loading: boolean;
  onCancel: () => void;
  onSave: (items: any[]) => void;
  onItemsChange: (items: any[]) => void;
}

const DeductionModal: React.FC<DeductionModalProps> = ({ open, orderId, items, loading, onCancel, onSave, onItemsChange }) => {
  const deductionTypeOptions = [
    { label: '次品扣款', value: 'QUALITY_DEFECT' },
    { label: '报废扣款', value: 'PRODUCT_SCRAP' },
    { label: '物料扣款', value: 'MATERIAL_PICKUP' },
    { label: '其他扣款', value: 'OTHER' },
    { label: '补款', value: 'SUPPLEMENT' },
  ];

  const handleAddItem = () => {
    onItemsChange([...items, { deductionType: 'OTHER', deductionAmount: 0, description: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onItemsChange(newItems);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onItemsChange(newItems);
  };

  const totalDeduction = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.deductionType === 'SUPPLEMENT') {
        return sum;
      }
      return sum + (Number(item.deductionAmount) || 0);
    }, 0);
  }, [items]);

  const totalSupplement = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.deductionType === 'SUPPLEMENT') {
        return sum + (Number(item.deductionAmount) || 0);
      }
      return sum;
    }, 0);
  }, [items]);

  const deductionColumns = [
    {
      title: '类型',
      dataIndex: 'deductionType',
      key: 'deductionType',
      width: 120,
      render: (_: any, __: any, index: number) => (
        <Select
          value={items[index]?.deductionType}
          onChange={(val) => handleItemChange(index, 'deductionType', val)}
          style={{ width: '100%' }}
          options={deductionTypeOptions}
        />
      ),
    },
    {
      title: '金额',
      dataIndex: 'deductionAmount',
      key: 'deductionAmount',
      width: 120,
      render: (_: any, __: any, index: number) => (
        <InputNumber
          value={items[index]?.deductionAmount}
          onChange={(val) => handleItemChange(index, 'deductionAmount', val)}
          style={{ width: '100%' }}
          min={0}
          precision={2}
          placeholder="金额"
        />
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (_: any, __: any, index: number) => (
        <Input
          value={items[index]?.description}
          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
          placeholder="扣款原因说明"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, __: any, index: number) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(index)} size="small">
          删除
        </Button>
      ),
    },
  ];

  return (
    <StandardModal
      title={`扣款编辑 - ${orderId}`}
      open={open}
      onCancel={onCancel}
      width={700}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onSave(items)}>保存</Button>
        </Space>
      }
    >
      <div className="u-mb-16">
        <Space style={{ marginBottom: 8 }}>
          <Button icon={<PlusOutlined />} onClick={handleAddItem} size="small">添加扣款</Button>
        </Space>
        <div className="u-mb-8 u-fs-13" style={{ color: 'var(--neutral-text-secondary)' }}>
          <span style={{ marginRight: 16 }}>扣款合计：<b style={{ color: 'var(--color-danger)' }}>¥{totalDeduction.toFixed(2)}</b></span>
          <span>补款合计：<b style={{ color: 'var(--color-success)' }}>¥{totalSupplement.toFixed(2)}</b></span>
        </div>
        <Table
          size="small"
          loading={loading}
          columns={deductionColumns}
          dataSource={items}
          rowKey={(_, index) => String(index)}
          pagination={false}
          locale={{ emptyText: loading ? '加载中...' : '暂无扣款记录，点击上方按钮添加' }}
        />
      </div>
    </StandardModal>
  );
};

export default FinishedSettlementContent;
