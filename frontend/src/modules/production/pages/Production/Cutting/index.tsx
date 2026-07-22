import React, { useEffect, useState, useCallback } from 'react';
import { App, Button, Space } from 'antd';

import PageLayout from '@/components/common/PageLayout';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { CuttingTask } from '@/types/production';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import { useProcessDetail } from '../List/hooks';
import { productionOrderApi } from '@/services/production/productionApi';

import '../../../styles.css';

import {
  useCuttingTasks,
  useCuttingBundles,
  useCuttingPrint,
  useCuttingCreateTask,
  useCuttingBom,
  useCuttingRouteParams,
} from './hooks';
import { CuttingEntryView, CuttingTaskListView, CuttingModals } from './components';
import { useBundleColumns, useTaskColumns } from './columns';

const CuttingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const navigate = useNavigate();
  const { modalWidth } = useViewport();

  const { routeOrderNo, isEntryPage, autoPrintBundleIds, autoPrintEnabled, location } = useCuttingRouteParams();

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
    // syncActiveTaskByOrderNo 是非 memoized 的普通函数，加入 deps 会使 callback 每次渲染重建
    // tasks.handleReceiveTask 已在 deps 中，无需整个 tasks 对象
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <CuttingTaskListView
              tasks={tasks}
              taskColumns={taskColumns}
              onCreateTask={createTask.openCreateTask}
            />
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

          <CuttingModals
            createTask={createTask}
            tasks={tasks}
            processDetail={processDetail}
            bundles={bundles}
            activeTask={activeTask}
            user={user}
            cuttingSheetPrintOpen={cuttingSheetPrintOpen}
            setCuttingSheetPrintOpen={setCuttingSheetPrintOpen}
            remarkOpen={remarkOpen}
            setRemarkOpen={setRemarkOpen}
            remarkOrderNo={remarkOrderNo}
          />

        </PageLayout>
    </>
  );
};

export default CuttingManagement;
