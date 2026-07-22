import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Select, Empty, Space, Statistic, Timeline, Tabs, Table, InputNumber } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>}
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
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>}
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
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />订单数</span>}
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
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
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
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          rowKey="orderId"
          rowSelection={{ selectedRowKeys, onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]) }}
          scroll={{ x: 1800 }}
          pagination={{ current: pageParams.page, pageSize: pageParams.pageSize, total, showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 条`, pageSizeOptions: ['10', '20', '50', '100'] }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </PageLayout>

      <SmallModal title="编辑备注" open={remarkModalVisible} onOk={saveRemark} onCancel={() => setRemarkModalVisible(false)} okText="保存" cancelText="取消">
        <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--neutral-text-secondary)' }}>备注内容</div>
        <Input.TextArea id="settlementRemark" rows={6} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="请输入备注内容..." maxLength={500} showCount />
      </SmallModal>

      <StandardModal title="操作日志" open={logModalVisible} onCancel={() => setLogModalVisible(false)} footer={<Button onClick={() => setLogModalVisible(false)}>关闭</Button>} size="md">
        {orderLogs.length > 0 ? (
          <Timeline items={orderLogs.map((log: any) => ({
            content: (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{log.action || log.operationType}</div>
                <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>{log.description || log.content}</div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 12 }}>
                  <span>{log.operatorName || log.userName || '系统'}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>{log.createTime ? new Date(log.createTime).toLocaleString() : '-'}</span>
                </div>
              </div>
            ),
          }))} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neutral-text-disabled)' }}>暂无操作日志</div>
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
      <div style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 8 }}>
          <Button icon={<PlusOutlined />} onClick={handleAddItem} size="small">添加扣款</Button>
        </Space>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--neutral-text-secondary)' }}>
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
