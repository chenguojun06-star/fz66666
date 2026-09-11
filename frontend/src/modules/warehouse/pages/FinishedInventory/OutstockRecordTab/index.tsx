import React, { useState, useEffect, useCallback } from 'react';
import { Card, Space, Select, App, Button, Modal } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { useOutstockShare } from '../useOutstockShare';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import ShareLinkModal from '../ShareLinkModal';
import { getOutstockRecordColumns } from './outstockRecordColumns';
import type { OutstockRecord } from './outstockRecordTypes';

const OutstockRecordTab: React.FC = () => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<OutstockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [outstockTypeFilter, setOutstockTypeFilter] = useState<string>('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [approving, setApproving] = useState(false);
  const pagination = useTablePagination(20);
  const paginationCurrent = pagination.pagination.current;
  const paginationPageSize = pagination.pagination.pageSize;
  const [total, setTotal] = useState(0);

  const { shareModalOpen, shareUrl, shareLoading, handleShare, handleCopyShareUrl, setShareModalOpen } = useOutstockShare(message);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post('/warehouse/finished-inventory/outstock-records', {
        page: paginationCurrent,
        pageSize: paginationPageSize,
        keyword: searchText || undefined,
        outstockType: outstockTypeFilter || undefined,
        approvalStatus: approvalStatusFilter || undefined,
      });
      const data = res.data || res;
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch {
      message.error('加载出库记录失败');
    } finally {
      setLoading(false);
    }
  }, [paginationCurrent, paginationPageSize, searchText, outstockTypeFilter, approvalStatusFilter, message]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleApprove = (id: number) => {
    Modal.confirm({
      title: '确认审核',
      content: '审核后账单将推送至汇总，确认审核该出库记录？',
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/approve', { id: String(id) });
          message.success('审核成功，账单已推送至汇总');
          loadRecords();
        } catch {
          message.error('审核失败');
        } finally {
          setApproving(false);
        }
      },
    });
  };

  const handleBatchApprove = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: '确认批量审核',
      content: `审核后账单将推送至汇总，确认批量审核选中的 ${selectedRowKeys.length} 条出库记录？`,
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/batch-approve', {
            ids: selectedRowKeys.map(String),
          });
          message.success(`批量审核成功，共 ${selectedRowKeys.length} 条，账单已推送至汇总`);
          setSelectedRowKeys([]);
          loadRecords();
        } catch {
          message.error('批量审核失败');
        } finally {
          setApproving(false);
        }
      },
    });
  };

  const [transferTarget, setTransferTarget] = useState<OutstockRecord | null>(null);
  const [transferLocation, setTransferLocation] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // D-360n：调拨出库回入库（调入方确认收货）
  const handleTransferInbound = (record: OutstockRecord) => {
    setTransferTarget(record);
    setTransferLocation('');
  };
  const submitTransferInbound = async () => {
    if (!transferTarget) return;
    if (!transferLocation.trim()) { message.warning('请选择或输入回入库位'); return; }
    setTransferSubmitting(true);
    try {
      const res = await api.post('/warehouse/finished-inventory/transfer-inbound', {
        outstockId: String(transferTarget.id),
        warehouseLocation: transferLocation.trim(),
      });
      if (res?.code === 200) {
        message.success('回入库成功，库存已增加');
        setTransferTarget(null);
        loadRecords();
      } else {
        message.error(res?.message || '回入库失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '回入库失败');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const columns = getOutstockRecordColumns({ handleApprove, handleShare, handleTransferInbound });

  return (
    <Card
      styles={{ body: { padding: '16px 20px' } }}
      style={{ border: 'none', boxShadow: 'none' }}
    >
      <StandardToolbar
        left={
          <Space>
            <StandardSearchBar
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="搜索出库单号 / 款号 / 客户名称"
            />
            <Select
              allowClear
              placeholder="出库类型"
              style={{ width: 130 }}
              value={outstockTypeFilter || undefined}
              onChange={(v) => { setOutstockTypeFilter(v ?? ''); pagination.onChange(1, pagination.pagination.pageSize); }}
            >
              <Select.Option value="normal">普通出库</Select.Option>
              <Select.Option value="qrcode">扫码出库</Select.Option>
              <Select.Option value="batch">批量出库</Select.Option>
              <Select.Option value="shipment">物流出库</Select.Option>
            </Select>
            <Select
              allowClear
              placeholder="审核状态"
              style={{ width: 120 }}
              value={approvalStatusFilter || undefined}
              onChange={(v) => { setApprovalStatusFilter(v ?? ''); pagination.onChange(1, pagination.pagination.pageSize); }}
            >
              <Select.Option value="pending">待审核</Select.Option>
              <Select.Option value="approved">已审核</Select.Option>
            </Select>
            {selectedRowKeys.length > 0 && (
              <Button type="primary" loading={approving} onClick={handleBatchApprove}>
                批量审核（{selectedRowKeys.length}）
              </Button>
            )}
          </Space>
        }
      />
      <ResizableTable
        storageKey="finished-inventory-outstock-records"
        columns={columns}
        dataSource={records}
        loading={loading}
        emptyDescription="暂无出库记录"
        rowKey="id"
        stickyHeader
        scroll={{ x: 2400 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
          getCheckboxProps: (record) => ({
            disabled: record.approvalStatus === 'approved',
          }),
        }}
      />
      <StandardPagination
        current={pagination.pagination.current}
        pageSize={pagination.pagination.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={pagination.onChange}
      />

      <Modal
        title={`回入库 - ${transferTarget ? `${transferTarget.styleNo || ''} ${transferTarget.skuCode || ''}` : ''}`}
        open={!!transferTarget}
        onCancel={() => setTransferTarget(null)}
        onOk={() => { void submitTransferInbound(); }}
        confirmLoading={transferSubmitting}
        okText="确认回入"
        cancelText="取消"
        width={480}
      >
        <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>
          调拨出库确认收货回入库：将把 {transferTarget?.outstockQuantity || 0} 件商品重新计入可用库存，并标记该出库记录已回入。
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ whiteSpace: 'nowrap' }}>回入库位：</span>
          <WarehouseLocationAutoComplete value={transferLocation} onChange={setTransferLocation} style={{ flex: 1 }} />
        </div>
      </Modal>

      <ShareLinkModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
        shareLoading={shareLoading}
        onCopy={handleCopyShareUrl}
      />
    </Card>
  );
};

export default OutstockRecordTab;
