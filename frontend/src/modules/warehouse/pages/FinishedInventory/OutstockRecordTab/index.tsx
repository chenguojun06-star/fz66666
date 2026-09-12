import React, { useState, useEffect, useCallback } from 'react';
import { Card, Space, Select, App, Button, Modal } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { useOutstockShare } from '../useOutstockShare';
import MaterialWarehouseLocationPicker from '@/components/common/purchase/MaterialWarehouseLocationPicker';
import RecordLogDrawer, { type RecordLogDrawerFilter } from '@/components/common/RecordLogDrawer';
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
  // D-362h：批量回库
  const [batchTransferSubmitting, setBatchTransferSubmitting] = useState(false);
  // D-363e：批量回库先弹库位选择——回入哪个仓哪个位要人拍板，不能静默落原库位
  const [batchTransferOpen, setBatchTransferOpen] = useState(false);
  const [batchTransferLocation, setBatchTransferLocation] = useState('');
  const [batchTransferAreaId, setBatchTransferAreaId] = useState('');
  const transferEligibleIds = records
    .filter((r) => r.outstockType === 'transfer_out' && r.transferInboundStatus !== 'INBOUND' && selectedRowKeys.includes(r.id))
    .map((r) => String(r.id));

  const runBatchTransferInbound = async (ids: string[], location: string, areaId: string) => {
    if (!ids.length) { message.warning('请先勾选要回库的调拨出库记录'); return; }
    let success = 0; const fails: string[] = [];
    setBatchTransferSubmitting(true);
    try {
      const queue = ids.slice();
      const workers = Array.from({ length: Math.min(3, queue.length) }).map(async () => {
        while (queue.length) {
          const id = queue.shift();
          if (!id) continue;
          try {
            const res = await api.post('/warehouse/finished-inventory/transfer-inbound', {
              outstockId: id,
              warehouseLocation: location || undefined,
              warehouseAreaId: areaId || undefined,
            });
            if (res?.code === 200) success++; else fails.push(res?.message || id);
          } catch (e) { fails.push(e instanceof Error ? e.message : id); }
        }
      });
      await Promise.all(workers);
      if (fails.length === 0) message.success(`批量回库成功（${success} 条）`);
      else if (success > 0) message.warning(`成功 ${success} 条，失败 ${fails.length} 条：${fails[0]}`);
      else message.error(`批量回库失败：${fails[0]}`);
      setSelectedRowKeys([]);
      loadRecords();
    } finally { setBatchTransferSubmitting(false); }
  };

  const handleBatchTransferConfirm = async () => {
    if (!batchTransferLocation.trim()) { message.warning('请选择回入仓库与库位'); return; }
    const ids = transferEligibleIds.slice();
    setBatchTransferOpen(false);
    await runBatchTransferInbound(ids, batchTransferLocation.trim(), batchTransferAreaId);
    setBatchTransferLocation(''); setBatchTransferAreaId('');
  };
  const [transferLocation, setTransferLocation] = useState('');
  const [transferAreaId, setTransferAreaId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // D-360n：调拨出库回入库（调入方确认收货）
  const handleTransferInbound = (record: OutstockRecord) => {
    setTransferTarget(record);
    setTransferLocation('');
    setTransferAreaId('');
  };
  const submitTransferInbound = async () => {
    if (!transferTarget) return;
    if (!transferLocation.trim()) { message.warning('请选择回入仓库与库位'); return; }
    setTransferSubmitting(true);
    try {
      const res = await api.post('/warehouse/finished-inventory/transfer-inbound', {
        outstockId: String(transferTarget.id),
        warehouseLocation: transferLocation.trim(),
        warehouseAreaId: transferAreaId || undefined,
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

  // D-362i：页面内日志侧滑看板——不必再跑去系统日志中心翻
  const [logDrawer, setLogDrawer] = useState<{ open: boolean; title: string; filter: RecordLogDrawerFilter } | null>(null);
  const openRecordLog = (record: OutstockRecord) => {
    setLogDrawer({
      open: true,
      title: `出库日志 - ${record.outstockNo || ''}`,
      // targetId 形态随链路不同：出库=出库单号(AOP回填)、回入库/审批=出库记录id——一并传给客户端过滤
      filter: { module: '仓库管理', targetIds: [record.outstockNo, String(record.id)].filter(Boolean) as string[] },
    });
  };

  const columns = getOutstockRecordColumns({ handleApprove, handleShare, handleTransferInbound, handleLog: openRecordLog });

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
            {transferEligibleIds.length > 0 && (
              <Button ghost loading={batchTransferSubmitting} onClick={() => setBatchTransferOpen(true)}>
                批量回库（{transferEligibleIds.length}）
              </Button>
            )}
            <Button onClick={() => setLogDrawer({ open: true, title: '仓库操作日志', filter: { module: '仓库管理' } })}>
              操作日志
            </Button>
          </Space>
        }
      />
      <ResizableTable
        storageKey="finished-inventory-outstock-records"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
          getCheckboxProps: (record) => ({
            disabled:
              record.outstockType === 'transfer_out'
                ? record.transferInboundStatus === 'INBOUND'
                : record.approvalStatus === 'approved',
          }),
        }}
        columns={columns}
        dataSource={records}
        loading={loading}
        emptyDescription="暂无出库记录"
        rowKey="id"
        stickyHeader
        scroll={{ x: 2400 }}
        pagination={false}
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
          <MaterialWarehouseLocationPicker warehouseType="FINISHED" value={transferLocation} onChange={(v, areaId) => { setTransferLocation(v); setTransferAreaId(areaId || ''); }} />
        </div>
      </Modal>

      <Modal
        title={`批量回入库 - ${transferEligibleIds.length} 条`}
        open={batchTransferOpen}
        onCancel={() => setBatchTransferOpen(false)}
        onOk={() => { void handleBatchTransferConfirm(); }}
        confirmLoading={batchTransferSubmitting}
        okText="确认回入"
        cancelText="取消"
        width={480}
      >
        <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>
          将把勾选的 {transferEligibleIds.length} 条调拨出库记录统一回入以下仓库库位，并计入入库记录。
        </p>
        <MaterialWarehouseLocationPicker
          warehouseType="FINISHED"
          value={batchTransferLocation}
          onChange={(v, areaId) => { setBatchTransferLocation(v); setBatchTransferAreaId(areaId || ''); }}
        />
      </Modal>

      <RecordLogDrawer
        open={!!logDrawer?.open}
        onClose={() => setLogDrawer(null)}
        title={logDrawer?.title}
        filter={logDrawer?.filter || {}}
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
