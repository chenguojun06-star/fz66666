import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Select, Empty, Space, Tag, Statistic, Timeline, Tabs } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useSettlementData, type PageParams } from './useSettlementData';
import { getSettlementColumns } from './settlementColumns';

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FinishedSettlementContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const {
    searchOrderNo, setSearchOrderNo,
    searchStatus, setSearchStatus,
    searchFactoryType, setSearchFactoryType,
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
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>}
            value={stats.pendingCount}
            suffix="条"
            valueStyle={{ color: 'var(--color-warning)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>}
            value={stats.approvedCount}
            suffix="条"
            valueStyle={{ color: 'var(--color-primary)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />订单数</span>}
            value={total}
            suffix="条"
            valueStyle={{ color: 'var(--color-success)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>}
            value={stats.totalAmount}
            precision={2}
            prefix="¥"
            valueStyle={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 500 }}
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
              <Select
                value={searchFactoryType}
                onChange={(value) => { setSearchFactoryType(value); handleSearch({ factoryType: value as PageParams['factoryType'] }); }}
                style={{ width: 120 }}
                options={[
                  { label: '外发工厂', value: 'EXTERNAL' },
                  { label: '内部工厂', value: 'INTERNAL' },
                  { label: '全部', value: '' },
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
                disabled={selectedRowKeys.length === 0}
              >
                批量审批
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
    </>
  );
};

export default FinishedSettlementContent;
