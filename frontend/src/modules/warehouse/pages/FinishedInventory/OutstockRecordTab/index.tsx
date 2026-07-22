import React, { useState, useEffect, useCallback } from 'react';
import { Card, Space, Select, App, Button, Modal } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { useOutstockShare } from '../useOutstockShare';
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

  const columns = getOutstockRecordColumns({ handleApprove, handleShare });

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
