import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Select, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import PageLayout from '@/components/common/PageLayout';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { CuttingTask, MaterialPurchase } from '@/types/production';
import { ProductionOrderHeader, StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { formatDateTime } from '@/utils/datetime';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import CuttingSheetPrintModal from '@/components/common/CuttingSheetPrintModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';

import { useProcessDetail } from '../List/hooks';
import { productionOrderApi } from '@/services/production/productionApi';

import '../../../styles.css';

import {
  useCuttingTasks,
  useCuttingBundles,
  useCuttingPrint,
  useCuttingCreateTask,
} from './hooks';
import type { CuttingBundleRow } from './hooks';
import { CuttingCreateTaskModal, CuttingPrintPreviewModal, CuttingRatioPanel } from './components';
import { usePurchaseColumns, useBundleColumns } from './columns';

const CuttingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
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
  const autoPrintBundleIds = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return String(search.get('bundleIds') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [location.search]);
  const autoPrintEnabled = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return search.get('autoPrint') === '1';
  }, [location.search]);

  const [orderId, setOrderId] = useState<string>('');
  const [activeTask, setActiveTask] = useState<CuttingTask | null>(null);
  const [cuttingSheetPrintOpen, setCuttingSheetPrintOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');

  const tasks = useCuttingTasks({ message, isEntryPage });

  const bundles = useCuttingBundles({
    message, modal, activeTask, orderId, isEntryPage,
    ensureOrderUnlockedById: tasks.ensureOrderUnlockedById,
    syncActiveTaskByOrderNo,
  });

  const existingCutQtyByKey = bundles.allBundlesQtyMap;
  const print = useCuttingPrint({ message });
  const createTask = useCuttingCreateTask({ message, navigate, fetchTasks: tasks.fetchTasks });

  const processDetail = useProcessDetail({ message, fetchProductionList: tasks.fetchTasks });

  const _openProcessForCuttingTask = async (record: CuttingTask) => {
    const orderNo = String(record.productionOrderNo || '').trim();
    if (!orderNo) { message.warning('该裁剪任务缺少订单号'); return; }
    try {
      const res = await productionOrderApi.list({ orderNo, page: 1, pageSize: 1 } as any);
      const order = (res as any)?.data?.records?.[0];
      if (!order) { message.warning('未找到对应生产订单'); return; }
      processDetail.openProcessDetail(order, 'all');
    } catch {
      message.error('加载订单工序失败');
    }
  };

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
    print.setHighlightedBundleIds([]);
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

  useEffect(() => {
    if (!autoPrintEnabled || !autoPrintBundleIds.length || !bundles.dataSource.length) return;
    const matched = bundles.dataSource.filter((row) => row.id && autoPrintBundleIds.includes(String(row.id)));
    if (!matched.length) return;
    bundles.setSelectedBundleRowKeys(matched.map((row) => row.id as React.Key));
    bundles.setSelectedBundles(matched);
    print.openBatchPrint(matched, { highlightedBundleIds: autoPrintBundleIds });
    navigate(location.pathname, { replace: true });
  }, [autoPrintBundleIds, autoPrintEnabled, bundles.dataSource, location.pathname, navigate, print, bundles]);

  useEffect(() => {
    const hasQr = bundles.dataSource.some((r) => String(r?.qrCode || '').trim());
    if (hasQr) print.setPrintUnlocked(true);
  }, [bundles.dataSource]);

  useEffect(() => {
    print.setPrintUnlocked(false);
    print.setHighlightedBundleIds([]);
    bundles.clearBundleSelection();
    print.setPrintBundles([]);
    print.setPrintPreviewOpen(false);
  }, [activeTask?.id]);

  const handleRollbackActive = (task: CuttingTask) => {
    tasks.handleRollbackTask(task, () => {
      if (activeTask?.id === task.id) {
        resetActiveTask();
      }
    });
  };

  const purchaseColumns = usePurchaseColumns();
  const columns = useBundleColumns(activeTask);

  return (
    <>
        <PageLayout
          title={isEntryPage ? '裁剪明细' : '裁剪管理'}
          titleExtra={isEntryPage ? (
            <Button type="primary" className="cutting-entry-back-btn" onClick={() => resetActiveTask(true)}>
              返回
            </Button>
          ) : undefined}
        >

          {isEntryPage ? null : (
            <Card size="small" className="mb-sm">
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
                  },
                  {
                    key: 'pending',
                    items: [{ label: '待领取', value: tasks.cuttingStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                    onClick: () => tasks.handleStatClick('pending'),
                    activeColor: 'var(--color-warning)',
                  },
                  {
                    key: 'received',
                    items: [{ label: '已领取', value: tasks.cuttingStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                    onClick: () => tasks.handleStatClick('received'),
                    activeColor: 'var(--color-primary)',
                  },
                  {
                    key: 'bundled',
                    items: [{ label: '已完成', value: tasks.cuttingStats.bundledCount, unit: '条', color: 'var(--color-success)' }],
                    onClick: () => tasks.handleStatClick('bundled'),
                    activeColor: 'var(--color-success)',
                  },
                ]}
              />

              <StickyFilterBar>
              <StandardToolbar
                left={(
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <StandardSearchBar
                      searchValue={tasks.taskQuery.orderNo || ''}
                      onSearchChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, orderNo: value, page: 1 }))}
                      searchPlaceholder="订单号/款号/工厂名"
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
                        tasks.setTaskQuery((prev) => ({ page: 1, pageSize: prev.pageSize, status: '', orderNo: '', styleNo: '', orgUnitId: '', factoryType: '' }));
                        tasks.setTaskDateRange(null);
                      }}
                    />
                    <Select
                      value={tasks.taskQuery.factoryType || ''}
                      onChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, factoryType: value as 'INTERNAL' | 'EXTERNAL' | '', page: 1 }))}
                      options={[
                        { label: '全部工厂', value: '' },
                        { label: '内部工厂', value: 'INTERNAL' },
                        { label: '外发工厂', value: 'EXTERNAL' },
                      ]}
                      style={{ width: 132 }}
                      placeholder="工厂类型"
                    />
                  </div>
                )}
                right={(
                  <Button type="primary" onClick={createTask.openCreateTask}>
                    新建裁剪任务
                  </Button>
                )}
              />
              </StickyFilterBar>

              <ResizableTable<CuttingTask>
                stickyHeader
                storageKey="cutting-task-table-v2"
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: '图片',
                    key: 'cover',
                    width: 72,
                    render: (_: any, record: any) => (
                      <StyleCoverThumb src={record.styleCover || null} styleId={record.styleId} styleNo={record.styleNo} size={48} borderRadius={6} />
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
                    title: '生产方',
                    key: 'factoryName',
                    width: 120,
                    render: (_: any, record: CuttingTask) => {
                      const name = record.factoryName;
                      const type = record.factoryType;
                      if (!name) return '-';
                      return (
                        <Space size={4}>
                          <FactoryTypeTag factoryType={type} />
                          <span style={{ fontSize: 12 }}>{name}</span>
                        </Space>
                      );
                    },
                  },
                  { title: '下单人', dataIndex: 'orderCreatorName', key: 'orderCreatorName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
                  {
                    title: <SortableColumnTitle
                      title="下单时间"
                      sortField={tasks.cuttingSortField}
                      fieldName="orderTime"
                      sortOrder={tasks.cuttingSortOrder}
                      onSort={tasks.handleCuttingSort}
                      align="left"
                    />,
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
                    title: '纸样',
                    key: 'attachments',
                    width: 80,
                    render: (_: any, record: CuttingTask) => (
                      <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} onlyActive />
                    ),
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
                      const isCompleted = record.status === 'completed';
                      const canRollback = tasks.isAdmin && !isPending && !isCompleted;
                      return (
                        <RowActions
                          actions={[
                            {
                              key: 'edit',
                              label: '编辑',
                              title: isCompleted ? '已完成，不可编辑' : frozen ? '编辑（订单已关单/报废/完成）' : '编辑',
                              disabled: frozen || isCompleted,
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
                            ...(canRollback
                              ? [{
                                  key: 'rollback',
                                  label: '退回',
                                  title: '退回',
                                  disabled: frozen || tasks.rollbackTaskLoading,
                                  danger: true,
                                  onClick: () => handleRollbackActive(record),
                                }]
                              : []),
                            {
                              key: 'remark',
                              label: '备注',
                              onClick: () => {
                                setRemarkOrderNo(record.productionOrderNo);
                                setRemarkOpen(true);
                              },
                            },
                          ]}
                        />
                      );
                    }
                  },
                ]}
                dataSource={tasks.sortedTaskList}
                rowKey={(row) => row.id || row.productionOrderId}
                loading={tasks.taskLoading}
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
                      orderLines={bundles.entryOrderLines}
                      styleId={activeTask?.styleId}
                      styleCover={activeTask?.styleCover || null}
                      coverNode={(
                        <div style={{ width: 160, maxWidth: '100%' }}>
                          <StyleCoverGallery
                            styleId={activeTask?.styleId}
                            styleNo={String(activeTask.styleNo || '').trim()}
                            src={activeTask?.styleCover || null}
                            fit="cover"
                            borderRadius={8}
                          />
                        </div>
                      )}
                      color={String(bundles.entryColorText || activeTask.color || '').trim()}
                      sizeItems={bundles.entryOrderDetailLoading ? [] : bundles.entrySizeItems.map((x) => ({ size: x.size, quantity: Number(x.quantity || 0) || 0 }))}
                      totalQuantity={bundles.entrySizeItems.length
                        ? bundles.entrySizeItems.reduce((s, x) => s + (Number(x.quantity || 0) || 0), 0)
                        : (Number(activeTask?.orderQuantity ?? 0) || 0)}
                      coverSize={160}
                      matrixColumnMinWidth={36}
                      matrixGap={10}
                      matrixFontSize={13}
                    />
                  </div>

                  <div>
                    {tasks.isAdmin && activeTask && activeTask.status !== 'pending' && activeTask.status !== 'completed' ? (
                      <div className="cutting-entry-actions">
                        <Button
                          danger
                          onClick={() => handleRollbackActive(activeTask)}
                          loading={tasks.rollbackTaskLoading}
                          disabled={tasks.isOrderFrozenById((activeTask as unknown as any)?.productionOrderNo) || !!activeTask?.hasScanRecords}
                        >
                          退回
                        </Button>
                        {bundles.importLocked && bundles.dataSource.length > 0 && (
                          <Button
                            type="default"
                            icon={<PlusOutlined />}
                            onClick={bundles.handleAddBed}
                          >
                            增加床次
                          </Button>
                        )}
                      </div>
                    ) : null}

                    <Form layout="vertical">
                      <CuttingRatioPanel
                        entryColorText={bundles.entryColorText || String(activeTask?.color || '').trim()}
                        entrySizeItems={bundles.entrySizeItems}
                        entryOrderLines={bundles.entryOrderLines}
                        defaultTotalQty={Number(activeTask?.orderQuantity ?? 0) || 0}
                        sizeUsageMap={bundles.entrySizeUsageMap}
                        fabricUsageRows={bundles.entryFabricUsageRows}
                        arrivedFabricM={bundles.entryMainFabricArrived}
                        generating={bundles.generateLoading}
                        disabled={bundles.importLocked}
                        onConfirm={(rows) => {
                          bundles.setBundlesInput(rows);
                          bundles.handleGenerate(rows);
                        }}
                        onClear={() => {
                          bundles.setImportLocked(false);
                          bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
                        }}
                        existingCutQtyByKey={existingCutQtyByKey}
                      />
                    </Form>

                    <Card
                      size="small"
                      title="面辅料用量"
                      className="cutting-entry-purchase-card"
                      style={{ marginTop: 12 }}
                      loading={bundles.entryPurchaseLoading}
                    >
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

              <CuttingPrintPreviewModal
                modalWidth={modalWidth}
                print={print}
                bundles={{ selectedBundles: bundles.selectedBundles, clearBundleSelection: bundles.clearBundleSelection }}
              />

            </>
          ) : null}

          <CuttingCreateTaskModal createTask={createTask} />

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

          <CuttingSheetPrintModal
            open={cuttingSheetPrintOpen}
            onCancel={() => setCuttingSheetPrintOpen(false)}
            bundles={bundles.selectedBundles}
            styleImageUrl={activeTask?.styleCover}
            companyName={user?.tenantName}
            cuttingTask={activeTask ? {
              receiverName: (activeTask as any).receiverName,
              creatorName: (activeTask as any).creatorName,
              orderCreatorName: (activeTask as any).orderCreatorName,
            } : undefined}
          />

          <RejectReasonModal
            open={tasks.pendingRollbackTask !== null}
            title="确认退回该裁剪任务？"
            description="退回后会清空领取信息，并删除已生成的裁剪明细，可重新领取并重新生成。"
            loading={tasks.rollbackTaskLoading}
            onOk={tasks.confirmRollback}
            onCancel={tasks.cancelRollback}
          />

          <ProcessDetailModal
            visible={processDetail.processDetailVisible}
            onClose={processDetail.closeProcessDetail}
            record={processDetail.processDetailRecord}
            processType={processDetail.processDetailType}
            procurementStatus={processDetail.procurementStatus}
            processStatus={processDetail.processStatus}
            onDataChanged={tasks.fetchTasks}
          />

        </PageLayout>
        <RemarkTimelineModal
          open={remarkOpen}
          onClose={() => setRemarkOpen(false)}
          targetType="order"
          targetNo={remarkOrderNo}
          canAddRemark={true}
        />
    </>
  );
};

export default CuttingManagement;
