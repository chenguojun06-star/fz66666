import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Descriptions, Space, Select, App, Button, Modal } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import SideDrawer from '@/components/common/SideDrawer';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { useOutstockShare } from '../useOutstockShare';
import MaterialWarehouseLocationPicker from '@/components/common/purchase/MaterialWarehouseLocationPicker';
import RecordLogDrawer, { type RecordLogDrawerFilter } from '@/components/common/RecordLogDrawer';
import ShareLinkModal from '../ShareLinkModal';
import { getGroupedOutstockColumns, getOutstockLineColumns } from './outstockRecordColumns';
import type { GroupedOutstock, OutstockRecord } from './outstockRecordTypes';
import { groupOutstockByNo, isReturnedTransferLine } from './outstockRecordTypes';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';

/**
 * D-437：出库记录 = 一行一张出库单（按 outstockNo 聚合明细行）。
 * - 点出库单号 / 明细 → 抽屉查看该单全部明细（不再把一个单拆成无数码数行）
 * - 审核/打印按单操作（审核走 batch-approve 打包该单全部待审明细 id）
 * - 勾选多个单 → 批量审核 / 批量回库（映射到该批单的明细 id）
 */
const OutstockRecordTab: React.FC = () => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<OutstockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [outstockTypeFilter, setOutstockTypeFilter] = useState<string>('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
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

  // ===== D-437：单据聚合 =====
  const groups = useMemo(() => groupOutstockByNo(records), [records]);
  const groupsByNo = useMemo(() => new Map(groups.map((g) => [g.outstockNo, g])), [groups]);

  /** 单内可审核明细 id（排除已审核 / 已回入库的调拨明细） */
  const approvableIds = (g: GroupedOutstock): string[] =>
    g.lines.filter((l) => l.approvalStatus !== 'approved' && !isReturnedTransferLine(l)).map((l) => String(l.id));

  const handleApproveGroup = (group: GroupedOutstock) => {
    const ids = approvableIds(group);
    if (ids.length === 0) { message.warning('该单没有待审核的明细'); return; }
    Modal.confirm({
      title: '确认审核出库单',
      content: `审核后账单将推送至汇总，确认审核出库单 ${group.outstockNo}（${ids.length} 条明细）？`,
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/batch-approve', { ids });
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
    const ids = selectedRowKeys.flatMap((no) => {
      const g = groupsByNo.get(no);
      return g ? approvableIds(g) : [];
    });
    if (!ids.length) { message.warning('所选出库单中没有待审核的明细'); return; }
    Modal.confirm({
      title: '确认批量审核',
      content: `审核后账单将推送至汇总，确认审核选中的 ${selectedRowKeys.length} 张出库单（共 ${ids.length} 条明细）？`,
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/batch-approve', { ids });
          message.success(`批量审核成功，共 ${selectedRowKeys.length} 张出库单，账单已推送至汇总`);
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

  // ===== 回入库（单条明细维度，抽屉内触发） =====
  const [transferTarget, setTransferTarget] = useState<OutstockRecord | null>(null);
  const [transferLocation, setTransferLocation] = useState('');
  const [transferAreaId, setTransferAreaId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

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

  // ===== D-362h：跨单批量回库（勾选单 → 展开为可回库明细 id） =====
  const [batchTransferSubmitting, setBatchTransferSubmitting] = useState(false);
  const [batchTransferOpen, setBatchTransferOpen] = useState(false);
  const [batchTransferLocation, setBatchTransferLocation] = useState('');
  const [batchTransferAreaId, setBatchTransferAreaId] = useState('');
  const selectedTransferLineIds = selectedRowKeys.flatMap((no) => {
    const g = groupsByNo.get(no);
    if (!g) return [];
    return g.lines
      .filter((l) => l.outstockType === 'transfer_out' && l.transferInboundStatus !== 'INBOUND')
      .map((l) => String(l.id));
  });

  const runBatchTransferInbound = async (ids: string[], location: string, areaId: string) => {
    if (!ids.length) { message.warning('请先勾选含待回库调拨明细的出库单'); return; }
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
    const ids = selectedTransferLineIds.slice();
    setBatchTransferOpen(false);
    await runBatchTransferInbound(ids, batchTransferLocation.trim(), batchTransferAreaId);
    setBatchTransferLocation(''); setBatchTransferAreaId('');
  };

  // ===== D-362i：日志侧滑（按单：单号 + 全部明细 id 一并匹配） =====
  const [logDrawer, setLogDrawer] = useState<{ open: boolean; title: string; filter: RecordLogDrawerFilter } | null>(null);
  const openGroupLog = (group: GroupedOutstock) => {
    setLogDrawer({
      open: true,
      title: `出库日志 - ${group.outstockNo}`,
      // targetId 形态随链路不同：出库=出库单号(AOP回填)、回入库/审批=出库记录id——一并传给客户端过滤
      filter: { module: '仓库管理', targetIds: [group.outstockNo, ...group.lines.map((l) => String(l.id))].filter(Boolean) },
    });
  };

  // ===== D-363h：整单打印——同一出库单号的全部明细一张纸打完 =====
  const handlePrint = useCallback(async (group: GroupedOutstock) => {
    if (!group.outstockNo) { message.warning('该单缺少出库单号'); return; }
    try {
      const res = await api.post('/warehouse/finished-inventory/outstock-records', {
        page: 1, pageSize: 100, keyword: group.outstockNo,
      });
      const data = res.data || res;
      const all: OutstockRecord[] = data.records || [];
      const rows = all.filter((r) => r.outstockNo === group.outstockNo);
      if (rows.length === 0) { message.error('未查到该出库单的明细'); return; }
      const { printOutstockRecords } = await import('../outstockPrintHelper');
      printOutstockRecords(rows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '打印失败');
    }
  }, [message]);

  const handleShareGroup = (group: GroupedOutstock) => {
    // 分享按单号生成，取首条明细承载字段即可
    handleShare(group.lines[0]);
  };

  // ===== 单据详情抽屉 =====
  const [detailGroup, setDetailGroup] = useState<GroupedOutstock | null>(null);
  const lineColumns = getOutstockLineColumns({ handleTransferInbound: (r) => { setTransferTarget(r); setTransferLocation(''); setTransferAreaId(''); } });

  const columns = getGroupedOutstockColumns({
    handleOpenDetail: setDetailGroup,
    handleApproveGroup,
    handleShare: handleShareGroup,
    handleLog: openGroupLog,
    handlePrint,
  });

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
                批量审核（{selectedRowKeys.length} 单）
              </Button>
            )}
            {selectedTransferLineIds.length > 0 && (
              <Button ghost loading={batchTransferSubmitting} onClick={() => setBatchTransferOpen(true)}>
                批量回库（{selectedTransferLineIds.length} 件）
              </Button>
            )}
            <Button onClick={() => setLogDrawer({ open: true, title: '仓库操作日志', filter: { module: '仓库管理' } })}>
              操作日志
            </Button>
          </Space>
        }
      />
      <ResizableTable
        storageKey="finished-inventory-outstock-records-grouped"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
          getCheckboxProps: (group: GroupedOutstock) => ({
            // 全部已审核/已回入库的单不再参与批量审核/回库
            disabled: group.status !== 'pending',
          }),
        }}
        columns={columns}
        dataSource={groups}
        loading={loading}
        emptyDescription="暂无出库记录"
        rowKey="outstockNo"
        stickyHeader
        scroll={{ x: 1800 }}
        pagination={false}
      />
      <StandardPagination
        current={pagination.pagination.current}
        pageSize={pagination.pagination.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={pagination.onChange}
      />

      {/* 单据详情抽屉：一张出库单的全部明细 */}
      <SideDrawer
        open={!!detailGroup}
        onClose={() => setDetailGroup(null)}
        title={detailGroup ? `出库单明细 - ${detailGroup.outstockNo}` : '出库单明细'}
        width="85%"
        footer={(
          <Space>
            <Button type="primary" onClick={() => detailGroup && handlePrint(detailGroup)}>打印出库单</Button>
            {detailGroup?.status === 'pending' && (
              <Button loading={approving} onClick={() => detailGroup && handleApproveGroup(detailGroup)}>审核</Button>
            )}
            <Button onClick={() => setDetailGroup(null)}>关闭</Button>
          </Space>
        )}
      >
        {detailGroup && (
          <>
            <Descriptions
              bordered
              column={{ xs: 1, sm: 2, md: 3 }}
              size="middle"
              style={{ marginBottom: 16 }}
              items={[
                { key: 'no', label: '出库单号', children: <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 600 }}>{detailGroup.outstockNo}</span> },
                { key: 'type', label: '出库类型', children: detailGroup.outstockType || '-' },
                { key: 'count', label: '明细', children: `${detailGroup.styleNos.length} 款 · ${detailGroup.skuCount} 个商品编码` },
                { key: 'customer', label: '客户名称', children: detailGroup.customerName || '未填写' },
                { key: 'phone', label: '联系电话', children: detailGroup.customerPhone || '-' },
                { key: 'tracking', label: '物流', children: detailGroup.trackingNo ? `${detailGroup.expressCompany || ''} ${detailGroup.trackingNo}` : '未填写' },
                { key: 'order', label: '关联订单', children: detailGroup.productionOrderNo || '-' },
                { key: 'creator', label: '操作人', children: detailGroup.creatorName || '-' },
                { key: 'time', label: '出库时间', children: detailGroup.createTime ? formatDateTime(detailGroup.createTime) : '-' },
                { key: 'qty', label: '出库总量', children: <strong style={{ color: 'var(--primary-color)' }}>{detailGroup.totalQuantity} 件</strong> },
                { key: 'amount', label: '出库金额', children: detailGroup.totalAmount != null ? formatMoney(Number(detailGroup.totalAmount)) : '-' },
                { key: 'remark', label: '备注', children: detailGroup.remark || '-' },
              ]}
            />
            <div style={{ fontWeight: 600, fontSize: 15, margin: '4px 0 10px' }}>
              出库明细（{detailGroup.lines.length} 条）
            </div>
            <ResizableTable
              columns={lineColumns}
              dataSource={detailGroup.lines}
              rowKey="id"
              size="middle"
              pagination={false}
              emptyDescription="暂无明细"
            />
          </>
        )}
      </SideDrawer>

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
        <p className="u-mb-12" style={{ color: 'var(--color-text-secondary)' }}>
          调拨出库确认收货回入库：将把 {transferTarget?.outstockQuantity || 0} 件商品重新计入可用库存，并标记该出库明细已回入。
        </p>
        <div className="u-d-flex u-ai-center u-gap-8">
          <span className="u-ws-nowrap">回入库位：</span>
          <MaterialWarehouseLocationPicker warehouseType="FINISHED" value={transferLocation} onChange={(v, areaId) => { setTransferLocation(v); setTransferAreaId(areaId || ''); }} />
        </div>
      </Modal>

      <Modal
        title={`批量回入库 - ${selectedTransferLineIds.length} 件`}
        open={batchTransferOpen}
        onCancel={() => setBatchTransferOpen(false)}
        onOk={() => { void handleBatchTransferConfirm(); }}
        confirmLoading={batchTransferSubmitting}
        okText="确认回入"
        cancelText="取消"
        width={480}
      >
        <p className="u-mb-12" style={{ color: 'var(--color-text-secondary)' }}>
          将把勾选出库单中的 {selectedTransferLineIds.length} 条调拨明细统一回入以下仓库库位，并计入入库记录。
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
