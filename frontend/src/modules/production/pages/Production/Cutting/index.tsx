import React, { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Card, Divider, Form, Input, InputNumber, Select, Space, Spin, Tag, Typography } from 'antd';

import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import api from '@/utils/api';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import type { CuttingTask, MaterialPurchase } from '@/types/production';
import { ProductionOrderHeader, StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { useNavigate, useParams } from 'react-router-dom';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import CuttingSheetPrintModal from '@/components/common/CuttingSheetPrintModal';

import '../../../styles.css';

import {
  useCuttingTasks,
  useCuttingBundles,
  useCuttingPrint,
  useCuttingCreateTask,
} from './hooks';
import type { CuttingBundleRow } from './hooks';

const CuttingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { modalWidth } = useViewport();
  const params = useParams();
  const routeOrderNo = useMemo(() => {
    const raw = String((params as unknown as any)?.orderNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params]);

  const isEntryPage = Boolean(routeOrderNo);

  // 活动任务状态（主组件持有，供 hooks 使用）
  const [orderId, setOrderId] = useState<string>('');
  const [activeTask, setActiveTask] = useState<CuttingTask | null>(null);

  // 裁剪单打印
  const [cuttingSheetPrintOpen, setCuttingSheetPrintOpen] = useState(false);

  // ─── Hooks ───────────────────────────────────────────────
  const tasks = useCuttingTasks({ message, modal, isEntryPage });

  const bundles = useCuttingBundles({
    message, modal, activeTask, orderId, isEntryPage,
    ensureOrderUnlockedById: tasks.ensureOrderUnlockedById,
    syncActiveTaskByOrderNo,
  });

  const print = useCuttingPrint({ message });

  const createTask = useCuttingCreateTask({
    message,
    navigate,
    fetchTasks: tasks.fetchTasks,
  });

  // ─── 任务路由解析 ──────────────────────────────────────────
  const resolveTaskByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) return null;
    try {
      const res = await api.get<{ code: number; data: { records: CuttingTask[] } }>('/production/cutting-task/list', {
        params: { page: 1, pageSize: 10, status: '', orderNo: on, styleNo: '' },
      });
      if (res.code !== 200) return null;
      const records: CuttingTask[] = res.data.records || [];
      return records.find((x) => String(x?.productionOrderNo || '').trim() === on) || records[0] || null;
    } catch {
      return null;
    }
  };

  async function syncActiveTaskByOrderNo(orderNo: string) {
    const task = await resolveTaskByOrderNo(orderNo);
    if (!task) return null;
    setActiveTask(task);
    setOrderId(String(task.productionOrderId || '').trim());
    return task;
  }

  const resetActiveTask = (clearRoute?: boolean) => {
    setActiveTask(null);
    setOrderId('');
    bundles.setImportLocked(false);
    bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
    bundles.clearBundleSelection();
    if (clearRoute && routeOrderNo) {
      navigate('/production/cutting', { replace: true });
    }
  };

  const goToEntry = (task: CuttingTask) => {
    const orderNo = String(task?.productionOrderNo || '').trim();
    if (!orderNo) {
      message.warning('未找到订单号');
      return;
    }
    navigate(`/production/cutting/task/${encodeURIComponent(orderNo)}`);
  };

  // 路由entry初始化
  useEffect(() => {
    if (!routeOrderNo) return;
    (async () => {
      const task = await resolveTaskByOrderNo(routeOrderNo);
      if (!task) {
        message.warning('未找到对应的裁剪任务');
        return;
      }
      setActiveTask(task);
      setOrderId(String(task.productionOrderId || '').trim());
      bundles.setImportLocked(false);
      bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
    })();
  }, [routeOrderNo, user?.id, user?.name]);

  // 打印解锁：已有二维码时自动解锁
  useEffect(() => {
    const hasQr = bundles.dataSource.some((r) => String(r?.qrCode || '').trim());
    if (hasQr) print.setPrintUnlocked(true);
  }, [bundles.dataSource]);

  // 活动任务变更 → 重置打印
  useEffect(() => {
    print.setPrintUnlocked(false);
    bundles.clearBundleSelection();
    print.setPrintBundles([]);
    print.setPrintPreviewOpen(false);
  }, [activeTask?.id]);

  // 退回后清理活动任务
  const handleRollbackActive = (task: CuttingTask) => {
    tasks.handleRollbackTask(task, () => {
      if (activeTask?.id === task.id) {
        resetActiveTask();
      }
    });
  };

  // ─── 面辅料采购表格列 ─────────────────────────────────────
  const purchaseColumns = useMemo(
    () =>
      [
        {
          title: '类型',
          dataIndex: 'materialType',
          key: 'materialType',
          width: 110,
          render: (v: unknown) => getMaterialTypeLabel(v),
        },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        {
          title: '规格',
          dataIndex: 'specifications',
          key: 'specifications',
          width: 180,
          ellipsis: true,
          render: (v: unknown) => String(v || '').trim() || '-',
        },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, ellipsis: true },
        {
          title: '采购数量',
          dataIndex: 'purchaseQuantity',
          key: 'purchaseQuantity',
          width: 110,
          align: 'right' as const,
          render: (v: unknown) => Number(v ?? 0) || 0,
        },
        {
          title: '单价(元)',
          dataIndex: 'unitPrice',
          key: 'unitPrice',
          width: 110,
          align: 'right' as const,
          render: (v: unknown) => {
            if (!canViewPrice(user)) return '***';
            const n = Number(v);
            return Number.isFinite(n) ? n.toFixed(2) : '-';
          },
        },
        {
          title: '总费用(元)',
          dataIndex: 'totalAmount',
          key: 'totalAmount',
          width: 120,
          align: 'right' as const,
          render: (v: any, r: any) => {
            if (!canViewPrice(user)) return '***';
            const raw = Number(v);
            if (Number.isFinite(raw)) return raw.toFixed(2);
            const qty = Number(r?.purchaseQuantity ?? 0) || 0;
            const price = Number(r?.unitPrice);
            if (Number.isFinite(price)) return (qty * price).toFixed(2);
            return '-';
          },
        },
        { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 160, ellipsis: true },
      ],
    []
  );

  // ─── 菲号表格列 ──────────────────────────────────────────
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={activeTask?.styleId} styleNo={record.styleNo || activeTask?.styleNo} size={24} borderRadius={4} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 140,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    {
      title: '款名',
      key: 'styleName',
      width: 160,
      ellipsis: true,
      render: () => activeTask?.styleName || '-',
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={activeTask?.styleId}
          styleNo={record.styleNo || activeTask?.styleNo}
          onlyActive
        />
      )
    },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 80 },
    {
      title: '床号',
      dataIndex: 'bedNo',
      key: 'bedNo',
      width: 80,
      render: (value: number | null | undefined) => (
        <span style={{ fontWeight: 600, color: value ? 'var(--color-primary)' : 'var(--neutral-text-secondary)' }}>
          {value || '-'}
        </span>
      )
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', width: 220, ellipsis: true },
    {
      title: '二维码',
      dataIndex: 'qrCode',
      key: 'qrCodeImage',
      width: 92,
      render: (value: string) => (value ? <QRCodeCanvas value={value} size={42} /> : null),
    },
  ];

  // ─── JSX ─────────────────────────────────────────────────
  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          {isEntryPage ? (
            <div className="cutting-entry-nav">
              <div className="cutting-entry-nav-title">裁剪明细</div>
              <Button type="primary" className="cutting-entry-back-btn" onClick={() => resetActiveTask(true)}>
                返回
              </Button>
            </div>
          ) : (
            <div className="page-header">
              <h2 className="page-title" style={{ margin: 0 }}>裁剪管理</h2>
            </div>
          )}

          {/* ====== 任务列表（非entry时显示） ====== */}
          {isEntryPage ? null : (
            <Card size="small" title="裁剪任务" className="mb-sm">
              <PageStatCards
                activeKey={tasks.activeStatFilter}
                cards={[
                  {
                    key: 'all',
                    items: [
                      { label: '任务总数', value: tasks.cuttingStats.totalCount, unit: '条', color: 'var(--color-primary)' },
                      { label: '总数量', value: tasks.cuttingStats.totalQuantity, color: 'var(--color-success)' },
                    ],
                    onClick: () => tasks.handleStatClick('all'),
                    activeColor: 'var(--color-primary)',
                    activeBg: 'rgba(45, 127, 249, 0.1)',
                  },
                  {
                    key: 'pending',
                    items: [{ label: '待领取', value: tasks.cuttingStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                    onClick: () => tasks.handleStatClick('pending'),
                    activeColor: 'var(--color-warning)',
                    activeBg: '#fff7e6',
                  },
                  {
                    key: 'received',
                    items: [{ label: '已领取', value: tasks.cuttingStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                    onClick: () => tasks.handleStatClick('received'),
                    activeColor: 'var(--color-primary)',
                    activeBg: 'rgba(45, 127, 249, 0.1)',
                  },
                  {
                    key: 'bundled',
                    items: [{ label: '已完成', value: tasks.cuttingStats.bundledCount, unit: '条', color: 'var(--color-success)' }],
                    onClick: () => tasks.handleStatClick('bundled'),
                    activeColor: 'var(--color-success)',
                    activeBg: 'rgba(34, 197, 94, 0.15)',
                  },
                ]}
              />

              <StandardToolbar
                left={(
                  <StandardSearchBar
                    searchValue={tasks.taskQuery.orderNo || ''}
                    onSearchChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, orderNo: value, page: 1 }))}
                    searchPlaceholder="订单号/款号"
                    dateValue={tasks.taskDateRange}
                    onDateChange={tasks.setTaskDateRange}
                    statusValue={tasks.taskQuery.status || ''}
                    onStatusChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, status: value, page: 1 }))}
                    statusOptions={[
                      { label: '全部', value: '' },
                      { label: '待领取', value: 'pending' },
                      { label: '已领取', value: 'received' },
                      { label: '已完成', value: 'bundled' },
                    ]}
                    showSearchButton
                    onSearch={() => tasks.fetchTasks()}
                    showResetButton
                    onReset={() => {
                      tasks.setTaskQuery({ page: 1, pageSize: 10, status: '', orderNo: '', styleNo: '' });
                      tasks.setTaskDateRange(null);
                    }}
                  />
                )}
                right={(
                  <Button type="primary" onClick={createTask.openCreateTask}>
                    新建裁剪任务
                  </Button>
                )}
              />

              <ResizableTable<CuttingTask>
                storageKey="cutting-task-table-v2"
                autoFixedColumns={false}
                columns={[
                  {
                    title: '图片',
                    key: 'cover',
                    width: 72,
                    render: (_: any, record: any) => (
                      <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={48} borderRadius={6} />
                    )
                  },
                  {
                    title: '订单号',
                    dataIndex: 'productionOrderNo',
                    key: 'productionOrderNo',
                    width: 230,
                    render: (v: any, record: CuttingTask) => (
                      <a
                        onClick={(e) => { e.stopPropagation(); goToEntry(record); }}
                        title={String(v || '').trim() || '-'}
                        style={{ color: 'var(--primary-color)', cursor: 'pointer' }}
                      >
                        <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
                      </a>
                    ),
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    key: 'styleNo',
                    width: 200,
                    render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
                  },
                  { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
                  {
                    title: '附件',
                    key: 'attachments',
                    width: 100,
                    render: (_: any, record: any) => (
                      <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} onlyActive />
                    )
                  },
                  { title: '下单人', dataIndex: 'orderCreatorName', key: 'orderCreatorName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
                  {
                    title: '下单时间',
                    dataIndex: 'orderTime',
                    key: 'orderTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
                  },
                  { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const },
                  {
                    title: '裁剪数',
                    dataIndex: 'cuttingQuantity',
                    key: 'cuttingQuantity',
                    width: 90,
                    align: 'right' as const,
                    render: (v: unknown) => Number(v ?? 0) || 0,
                  },
                  {
                    title: '扎数',
                    dataIndex: 'cuttingBundleCount',
                    key: 'cuttingBundleCount',
                    width: 80,
                    align: 'right' as const,
                    render: (v: unknown) => Number(v ?? 0) || 0,
                  },
                  { title: '裁剪员', dataIndex: 'receiverName', key: 'receiverName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
                  {
                    title: <SortableColumnTitle
                      title="领取时间"
                      sortField={tasks.cuttingSortField}
                      fieldName="receivedTime"
                      sortOrder={tasks.cuttingSortOrder}
                      onSort={tasks.handleCuttingSort}
                      align="left"
                    />,
                    dataIndex: 'receivedTime',
                    key: 'receivedTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
                  },
                  {
                    title: <SortableColumnTitle
                      title="完成时间"
                      sortField={tasks.cuttingSortField}
                      fieldName="bundledTime"
                      sortOrder={tasks.cuttingSortOrder}
                      onSort={tasks.handleCuttingSort}
                      align="left"
                    />,
                    dataIndex: 'bundledTime',
                    key: 'bundledTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
                  },
                  {
                    title: '备注',
                    dataIndex: 'remarks',
                    key: 'remarks',
                    width: 150,
                    ellipsis: true,
                    render: (v: any) => v || '-',
                  },
                  {
                    title: <SortableColumnTitle title="预计出货" fieldName="expectedShipDate" onSort={tasks.handleCuttingSort} sortField={tasks.cuttingSortField} sortOrder={tasks.cuttingSortOrder} />,
                    dataIndex: 'expectedShipDate',
                    key: 'expectedShipDate',
                    width: 120,
                    render: (v: any) => v ? formatDateTime(v) : '-',
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 120,
                    render: (_: any, record: CuttingTask) => {
                      const orderNo = String((record as unknown as any)?.productionOrderNo || '').trim();
                      const frozen = tasks.isOrderFrozenById(orderNo);
                      const isPending = record.status === 'pending';
                      const isReceived = record.status === 'received';
                      return (
                        <RowActions
                          actions={[
                            {
                              key: 'edit',
                              label: '编辑',
                              title: frozen ? '编辑（订单已关单）' : '编辑',
                              disabled: frozen,
                              onClick: () => {
                                tasks.setQuickEditRecord(record);
                                tasks.setQuickEditVisible(true);
                              },
                            },
                            ...(isPending
                              ? [{
                                  key: 'receive',
                                  label: '领取',
                                  title: '领取任务',
                                  disabled: frozen || tasks.receiveTaskLoading,
                                  onClick: () => tasks.handleReceiveTask(record),
                                  primary: true,
                                }]
                              : []),
                            ...(!isPending
                              ? [{
                                  key: 'entry',
                                  label: isReceived ? '生成菲号' : '查看',
                                  title: isReceived ? '进入填写数量生成菲号' : '查看详情',
                                  disabled: frozen,
                                  onClick: () => goToEntry(record),
                                  primary: isReceived,
                                }]
                              : []),
                            ...(tasks.isAdmin && record.status !== 'pending'
                              ? [{
                                  key: 'rollback',
                                  label: '退回',
                                  title: '退回',
                                  disabled: frozen || tasks.rollbackTaskLoading,
                                  danger: true,
                                  onClick: () => handleRollbackActive(record),
                                }]
                              : []),
                          ]}
                        />
                      );
                    }
                  },
                ]}
                dataSource={tasks.sortedTaskList}
                rowKey={(row) => row.id || row.productionOrderId}
                loading={tasks.taskLoading}
                minColumnWidth={70}
                pagination={{
                  current: tasks.taskQuery.page,
                  pageSize: tasks.taskQuery.pageSize,
                  total: tasks.taskTotal,
                  showTotal: (total) => `共 ${total} 条`,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100', '200'],
                  onChange: (page, pageSize) => tasks.setTaskQuery(prev => ({ ...prev, page, pageSize })),
                }}
              />
            </Card>
          )}

          {/* ====== Entry页面（任务详情 + 菲号编辑） ====== */}
          {isEntryPage && activeTask ? (
            <>
              <div ref={bundles.editSectionRef} />

              <div className="cutting-entry-layout mb-sm">
                <div className="cutting-entry-main">
                  <div className="cutting-entry-info">
                    <ProductionOrderHeader
                      orderNo={String(activeTask.productionOrderNo || '').trim()}
                      styleNo={String(activeTask.styleNo || '').trim()}
                      styleName={String(activeTask.styleName || '').trim()}
                      styleId={activeTask?.styleId}
                      color={String(bundles.entryColorText || activeTask.color || '').trim()}
                      sizeItems={bundles.entryOrderDetailLoading ? [] : bundles.entrySizeItems.map((x) => ({ size: x.size, quantity: Number(x.quantity || 0) || 0 }))}
                      totalQuantity={bundles.entrySizeItems.length
                        ? bundles.entrySizeItems.reduce((s, x) => s + (Number(x.quantity || 0) || 0), 0)
                        : (Number(activeTask?.orderQuantity ?? 0) || 0)}
                      coverSize={160}
                    />
                  </div>

                  <div>
                    {tasks.isAdmin && activeTask && activeTask.status !== 'pending' ? (
                      <div className="cutting-entry-actions">
                        <Button
                          danger
                          onClick={() => handleRollbackActive(activeTask)}
                          loading={tasks.rollbackTaskLoading}
                          disabled={tasks.isOrderFrozenById((activeTask as unknown as any)?.productionOrderNo)}
                        >
                          退回
                        </Button>
                      </div>
                    ) : null}

                    <Form layout="vertical">
                      {activeTask?.status === 'bundled' ? null : (
                        <>
                          {bundles.bundlesInput.map((row, index) => (
                            <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                              <Input
                                placeholder="颜色"
                                style={{ width: 140 }}
                                value={row.color}
                                disabled={bundles.importLocked}
                                onChange={(e) => bundles.handleChangeRow(index, 'color', e.target.value)}
                              />
                              <Input
                                placeholder="尺码"
                                style={{ width: 120 }}
                                value={row.size}
                                disabled={bundles.importLocked}
                                onChange={(e) => bundles.handleChangeRow(index, 'size', e.target.value)}
                              />
                              <Input
                                placeholder="SKU"
                                style={{ width: 200 }}
                                value={row.skuNo}
                                disabled={bundles.importLocked}
                                onChange={(e) => bundles.handleChangeRow(index, 'skuNo', e.target.value)}
                              />
                              <InputNumber
                                placeholder="数量"
                                style={{ width: 120 }}
                                min={0}
                                value={row.quantity}
                                onChange={(value) => bundles.handleChangeRow(index, 'quantity', value || 0)}
                              />
                              <Button onClick={() => bundles.handleRemoveRow(index)} disabled={bundles.importLocked || bundles.bundlesInput.length === 1}>
                                删除
                              </Button>
                            </Space>
                          ))}
                          <Form.Item>
                            <Space>
                              <Button type="dashed" onClick={bundles.handleAddRow} disabled={bundles.importLocked}>
                                新增一行
                              </Button>
                              <Button type="dashed" onClick={bundles.handleAutoImport} disabled={!activeTask}>
                                一键导入(20件/扎)
                              </Button>
                              <Button
                                onClick={() => {
                                  bundles.setImportLocked(false);
                                  bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
                                }}
                                disabled={!activeTask}
                              >
                                清空
                              </Button>
                              <Button type="primary" loading={bundles.generateLoading} onClick={bundles.handleGenerate}>
                                生成菲号
                              </Button>
                            </Space>
                          </Form.Item>
                        </>
                      )}
                    </Form>

                    <Card size="small" title="面辅料采购明细" style={{ marginTop: 12 }} loading={bundles.entryPurchaseLoading}>
                      <ResizableTable<MaterialPurchase>
                        storageKey="cutting-entry-purchase-table"
                        columns={purchaseColumns}
                        dataSource={bundles.entryPurchases}
                        rowKey={(r) =>
                          String(
                            r?.id ??
                            `${(r as unknown as any)?.materialType || ''}-${(r as unknown as any)?.materialCode || ''}-${(r as unknown as any)?.supplierName || ''}`
                          )
                        }
                        loading={bundles.entryPurchaseLoading}
                        pagination={false}
                        size="small"
                        scroll={{ x: 'max-content' }}
                      />
                    </Card>
                  </div>

                  <div className="cutting-entry-footer">
                    <div className="cutting-entry-footer-grid">
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">裁剪人</div>
                        <div className="cutting-entry-value">{String(activeTask.receiverName || '').trim() || '-'}</div>
                      </div>
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">领取时间</div>
                        <div className="cutting-entry-value">{formatDateTime(activeTask.receivedTime) || '-'}</div>
                      </div>
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">完成时间</div>
                        <div className="cutting-entry-value">{formatDateTime(activeTask.bundledTime) || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" onClick={() => print.openBatchPrint(bundles.selectedBundles)} disabled={!bundles.selectedBundles.length}>
                  打印菲号
                </Button>
                <Button
                  type="default"
                  onClick={() => {
                    if (!bundles.selectedBundles.length) {
                      message.warning('请先勾选要打印的批次');
                      return;
                    }
                    setCuttingSheetPrintOpen(true);
                  }}
                  disabled={!bundles.selectedBundles.length}
                >
                  打印裁剪单
                </Button>
                <Button onClick={bundles.clearBundleSelection} disabled={!bundles.selectedBundles.length}>
                  清除勾选
                </Button>
                <Tag color={bundles.selectedBundles.length ? 'blue' : 'default'}>{`已选：${bundles.selectedBundles.length}`}</Tag>
              </Space>

              <ResizableTable<CuttingBundleRow>
                storageKey="cutting-bundle-table"
                columns={columns as any}
                dataSource={bundles.dataSource}
                rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}
                size="small"
                rowSelection={{
                  selectedRowKeys: bundles.selectedBundleRowKeys,
                  onChange: (keys, rows) => {
                    bundles.setSelectedBundleRowKeys(keys);
                    bundles.setSelectedBundles((rows as CuttingBundleRow[]) || []);
                  },
                }}
                loading={bundles.listLoading}
                scroll={{ x: 'max-content' }}
                pagination={{
                  current: bundles.queryParams.page,
                  pageSize: bundles.queryParams.pageSize,
                  total: bundles.total,
                  showTotal: (total) => `共 ${total} 条`,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100', '200'],
                  onChange: (page, pageSize) => bundles.setQueryParams(prev => ({ ...prev, page, pageSize })),
                }}
              />

              {/* 打印预览弹窗 */}
              <ResizableModal
                open={print.printPreviewOpen}
                title={`批量打印（${print.printBundles.length}张）`}
                width={modalWidth}
                centered
                onCancel={() => print.setPrintPreviewOpen(false)}
                footer={[
                  <Button key="clear" onClick={bundles.clearBundleSelection} disabled={!bundles.selectedBundles.length}>
                    清除勾选
                  </Button>,
                  <Button key="cancel" onClick={() => print.setPrintPreviewOpen(false)}>
                    关闭
                  </Button>,
                  <Button key="print" type="primary" onClick={print.triggerPrint} disabled={!print.printBundles.length}>
                    下载/打印
                  </Button>,
                ]}
                initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>打印纸规格</span>
                  <Select
                    value={print.printConfig.paperSize}
                    style={{ width: 150 }}
                    options={[
                      { label: '7cm × 4cm', value: '7x4' },
                      { label: '10cm × 5cm', value: '10x5' },
                    ]}
                    onChange={(v) => print.setPrintConfig((p) => ({ ...p, paperSize: v as '7x4' | '10x5' }))}
                  />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginLeft: 16 }}>二维码大小</span>
                  <InputNumber
                    min={60}
                    max={150}
                    value={print.printConfig.qrSize}
                    onChange={(v) => print.setPrintConfig((p) => ({ ...p, qrSize: Math.max(60, Number(v) || 84) }))}
                    addonAfter="px"
                    style={{ width: 120 }}
                  />
                  <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)', marginLeft: 16 }}>💡 每页打印一张菲号标签</span>
                </div>

                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--primary-color)',
                    color: '#fff',
                    marginBottom: '8px',
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  共 {print.printBundles.length} 张菲号标签，实际尺寸：{print.printConfig.paperSize === '7x4' ? '7cm × 4cm' : '10cm × 5cm'}（一页一张，居中显示）
                </div>
                <div
                  style={{
                    padding: '10px 16px',
                    background: '#d4edda',
                    color: '#155724',
                    marginBottom: '16px',
                    borderRadius: '4px',
                    border: '1px solid #28a745',
                    fontSize: '13px',
                    lineHeight: '1.6',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>✅ 使用说明：</div>
                  <div>• 点击"下载/打印"后直接选择打印机或"另存为PDF"即可</div>
                  <div>• 标签已按固定尺寸设置，无需手动调整纸张大小</div>
                  <div>• 每张标签独占一页，居中显示，方便裁剪</div>
                  <div>• 建议使用专用标签打印机或A4纸打印后裁剪</div>
                </div>
                <div
                  style={{
                    maxHeight: 'calc(85vh - 310px)',
                    overflowY: 'auto',
                    padding: '16px',
                    background: 'var(--color-bg-subtle)',
                  }}
                >
                  {print.printBundles.map((b, idx) => {
                    const paperRatio = print.printConfig.paperSize === '7x4' ? (70 / 40) : (100 / 50);
                    const previewWidth = 280;
                    const previewHeight = previewWidth / paperRatio;

                    return (
                      <div
                        key={b.id || `${b.qrCode || ''}-${idx}`}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
                          margin: '0 auto 16px',
                          background: 'var(--neutral-white)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '8px',
                        }}
                      >
                        <div style={{
                          width: '100%',
                          height: '100%',
                          border: '1px solid #000',
                          padding: '6px',
                          display: 'flex',
                          gap: '6px',
                        }}>
                          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
                            {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={Math.min(previewHeight - 20, print.printConfig.qrSize)} includeMargin /> : null}
                          </div>
                          <div style={{
                            flex: '1 1 auto',
                            fontSize: '11px',
                            lineHeight: '1.3',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-around',
                          }}>
                            <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                            <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                            <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                            <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                            <div>{`数量：${Number(b.quantity || 0)}`}</div>
                            <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ResizableModal>

            </>
          ) : null}

          {/* ====== 新建裁剪任务弹窗 ====== */}
          <ResizableModal
            open={createTask.createTaskOpen}
            title="新建裁剪任务"
            width={modalWidth}
            centered
            onCancel={() => createTask.setCreateTaskOpen(false)}
            okText="创建"
            confirmLoading={createTask.createTaskSubmitting}
            onOk={createTask.handleSubmitCreateTask}
            initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          >
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space wrap>
                <span>款号</span>
                <AutoComplete
                  value={createTask.createStyleNo}
                  style={{ width: 260 }}
                  placeholder="输入或搜索款号"
                  options={createTask.createStyleOptions.map((x) => ({
                    value: x.styleNo,
                    label: x.styleName ? `${x.styleNo}（${x.styleName}）` : x.styleNo,
                  }))}
                  onSearch={(v) => createTask.fetchStyleInfoOptions(v)}
                  onChange={(v) => createTask.handleStyleNoChange(v)}
                  filterOption={false}
                  allowClear
                  onClear={() => createTask.handleStyleNoChange('')}
                />
                <span>裁剪单号</span>
                <Input
                  value={createTask.createOrderNo}
                  style={{ width: 220 }}
                  placeholder="不填自动生成"
                  onChange={(e) => createTask.setCreateOrderNo(e.target.value)}
                />
              </Space>
              {createTask.createStyleName ? (
                <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
              ) : null}
            </Card>

            {/* 工序进度单价预览 */}
            {(createTask.createProcessPrices.length > 0 || createTask.processPricesLoading) && (
              <Card
                size="small"
                style={{ marginBottom: 12 }}
                title={
                  <Space>
                    <span>工序进度单价</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      （将随订单反推至大货生产）
                    </Typography.Text>
                  </Space>
                }
              >
                {createTask.processPricesLoading ? (
                  <Spin size="small" />
                ) : (
                  <Space wrap>
                    {createTask.createProcessPrices.map((p, i) => (
                      <Tag key={i} color="blue">
                        {p.processName}{p.unitPrice != null ? ` ¥${p.unitPrice}` : ' 未配置'}
                      </Tag>
                    ))}
                  </Space>
                )}
              </Card>
            )}

            <Card size="small" title="自定义裁剪单" extra={
              <Button type="dashed" onClick={createTask.handleCreateBundleAdd}>
                新增一行
              </Button>
            }>
              {createTask.createBundles.map((row, index) => (
                <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Input
                    placeholder="颜色"
                    style={{ width: 160 }}
                    value={row.color}
                    onChange={(e) => createTask.handleCreateBundleChange(index, 'color', e.target.value)}
                  />
                  <Input
                    placeholder="尺码"
                    style={{ width: 140 }}
                    value={row.size}
                    onChange={(e) => createTask.handleCreateBundleChange(index, 'size', e.target.value)}
                  />
                  <InputNumber
                    placeholder="数量"
                    style={{ width: 140 }}
                    min={0}
                    value={row.quantity}
                    onChange={(value) => createTask.handleCreateBundleChange(index, 'quantity', value || 0)}
                  />
                  <Button onClick={() => createTask.handleCreateBundleRemove(index)} disabled={createTask.createBundles.length === 1}>
                    删除
                  </Button>
                </Space>
              ))}
            </Card>
          </ResizableModal>

          {/* 快速编辑弹窗 */}
          <QuickEditModal
            visible={tasks.quickEditVisible}
            loading={tasks.quickEditSaving}
            initialValues={{
              remarks: tasks.quickEditRecord?.remarks,
              expectedShipDate: tasks.quickEditRecord?.expectedShipDate,
            }}
            onSave={tasks.handleQuickEditSave}
            onCancel={() => {
              tasks.setQuickEditVisible(false);
              tasks.setQuickEditRecord(null);
            }}
          />

          {/* 裁剪单打印弹窗 */}
          <CuttingSheetPrintModal
            open={cuttingSheetPrintOpen}
            onCancel={() => setCuttingSheetPrintOpen(false)}
            bundles={bundles.selectedBundles}
            styleImageUrl={(activeTask as any)?.styleImageUrl}
          />

        </Card>
      </div>
    </Layout>
  );
};

export default CuttingManagement;
