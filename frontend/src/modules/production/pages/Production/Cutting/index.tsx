import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { App, Button, Card, Select, Space } from 'antd';

import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { CuttingTask } from '@/types/production';
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
  useCuttingBom,
} from './hooks';
import { CuttingCreateTaskModal, CuttingEntryView } from './components';
import { useBundleColumns, useTaskColumns } from './columns';

const CuttingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { modalWidth } = useViewport();
  const params = useParams();
  const routeOrderNo = useMemo(() => {
    const raw = String(params?.orderNo || '').trim();
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
  const [bundleMode, setBundleMode] = useState<'auto' | 'free'>('auto');
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

  const bom = useCuttingBom({ message, activeTask, isEntryPage });

  const processDetail = useProcessDetail({ message, fetchProductionList: tasks.fetchTasks });

  const _openProcessForCuttingTask = async (record: CuttingTask) => {
    const orderNo = String(record.productionOrderNo || '').trim();
    if (!orderNo) { message.warning('该裁剪任务缺少订单号'); return; }
    try {
      const res = await productionOrderApi.list({ orderNo, page: 1, pageSize: 1 });
      const order = (res?.data?.records ?? [])[0];
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
      const res = await api.get<{ code: number; data: { records: CuttingTask[] } }>('/production/cutting-task', {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundles.dataSource]);

  useEffect(() => {
    print.setPrintUnlocked(false);
    print.setHighlightedBundleIds([]);
    bundles.clearBundleSelection();
    print.setPrintBundles([]);
    print.setPrintPreviewOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id]);

  const handleRollbackActive = (task: CuttingTask) => {
    tasks.handleRollbackTask(task, () => {
      if (activeTask?.id === task.id) {
        resetActiveTask();
      }
    });
  };

  const columns = useBundleColumns(activeTask);

  const taskColumns = useTaskColumns({
    tasks,
    goToEntry,
    handleRollbackActive,
    onOpenRemark: (orderNo: string) => {
      setRemarkOrderNo(orderNo);
      setRemarkOpen(true);
    },
  });

  const handleReceiveClick = useCallback(async () => {
    if (!activeTask) return;
    const ok = await tasks.handleReceiveTask(activeTask);
    if (ok && routeOrderNo) {
      await syncActiveTaskByOrderNo(routeOrderNo);
    }
  }, [tasks.handleReceiveTask, activeTask, routeOrderNo]);

  return (
    <>
        <PageLayout
          title={isEntryPage ? '裁剪明细' : '裁剪管理'}
          titleExtra={isEntryPage ? (
            <Space>
              {activeTask?.status === 'pending' && (
                <Button
                  type="primary"
                  loading={tasks.receiveTaskLoading}
                  onClick={handleReceiveClick}
                >
                  领取
                </Button>
              )}
              <Button type="primary" className="cutting-entry-back-btn" onClick={() => resetActiveTask(true)}>
                返回
              </Button>
            </Space>
          ) : undefined}
        >

          {isEntryPage ? null : (
            <Card className="mb-sm">
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
                extraRight={
                  <button
                    type="button"
                    onClick={() => tasks.setShowAllTasks(v => !v)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: '1px solid var(--color-border-antd)',
                      background: 'var(--color-bg-base)',
                      color: !tasks.showAllTasks ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      lineHeight: 1.4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tasks.showAllTasks ? '只看进行中' : '显示全部'}
                  </button>
                }
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
                    无资料下单
                  </Button>
                )}
              />
              </StickyFilterBar>

              {/* 裁剪延期提醒已内联到 PageStatCards hints */}

              <ResizableTable<CuttingTask>
                stickyHeader
                storageKey="cutting-task-table-v2"
                scroll={{ x: 'max-content' }}
                columns={taskColumns}
                dataSource={tasks.sortedTaskList}
                rowKey={(row) => row.id || row.productionOrderId}
                loading={tasks.taskLoading}
                emptyDescription="暂无裁剪数据"
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
            <CuttingEntryView
              activeTask={activeTask}
              tasks={tasks}
              bundles={bundles}
              bom={bom}
              print={print}
              bundleMode={bundleMode}
              setBundleMode={setBundleMode}
              existingCutQtyByKey={existingCutQtyByKey}
              columns={columns}
              modalWidth={modalWidth}
              message={message}
              onOpenCuttingSheetPrint={() => setCuttingSheetPrintOpen(true)}
              onRollbackActive={handleRollbackActive}
            />
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
              receiverName: activeTask?.receiverName,
              creatorName: activeTask?.creatorName,
              orderCreatorName: activeTask?.orderCreatorName,
              expectedShipDate: activeTask?.expectedShipDate,
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
