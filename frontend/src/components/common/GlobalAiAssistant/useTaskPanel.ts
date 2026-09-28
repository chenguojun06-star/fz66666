/**
 * useTaskPanel — 任务面板状态管理与回调
 *
 * 内部包含 useTaskManager 调用，统一管理：
 * - 任务面板开关 / 视图切换（chat ↔ tasks）
 * - 任务表单 CRUD（创建/编辑/删除/认领/完成）
 * - 任务轮询（panelView === 'tasks' 时自动 startPolling）
 */
import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import api from '@/utils/api';
import { useTaskManager } from './useTaskManager';
import type { PanelView, TaskItem } from './types';

type MessageApi = ReturnType<typeof import('antd').App.useApp>['message'];

interface UseTaskPanelParams {
  refreshPendingTasks: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  messageApi: MessageApi;
  currentUser?: { id?: string | number; name?: string; username?: string };
}

export function useTaskPanel({
  refreshPendingTasks,
  setIsOpen,
  messageApi,
  currentUser,
}: UseTaskPanelParams) {
  const {
    tasks: myTasks,
    loading: tasksLoading,
    stats: taskStats,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    claimTask,
    completeTask,
    startPolling,
    stopPolling,
  } = useTaskManager();

  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('chat');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);

  const switchToTasks = useCallback(() => {
    setPanelView('tasks');
    fetchTasks();
    startPolling();
  }, [fetchTasks, startPolling]);

  const openTaskPanel = useCallback(() => {
    // D-315：统一待办面板——铃铛/浮标角标/智能气泡入口全部打开聊天面板的「待办任务」视图，
    // 不再挂独立的 TaskAggregationPanel，避免同一批待办在两套界面割裂展示
    setIsOpen(true);
    switchToTasks();
    refreshPendingTasks();
  }, [switchToTasks, refreshPendingTasks, setIsOpen]);

  const closeTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(false);
  }, []);

  const switchToChat = useCallback(() => {
    setPanelView('chat');
    stopPolling();
  }, [stopPolling]);

  const handleTaskCreate = useCallback(() => {
    setEditingTask(null);
    setShowTaskForm(true);
  }, []);

  const handleTaskEdit = useCallback((task: TaskItem) => {
    setEditingTask(task);
    setShowTaskForm(true);
  }, []);

  const handleTaskSave = useCallback(async (data: { title: string; description?: string; priority: string; module: string; orderNo?: string; endTime?: string }) => {
    setTaskSaving(true);
    try {
      if (editingTask?.id) {
        await updateTask(editingTask.id, data as Record<string, unknown>);
      } else {
        await createTask(data);
      }
      setShowTaskForm(false);
      setEditingTask(null);
    } catch (e) { console.error('[GlobalAiAssistant] 保存任务失败:', e); messageApi.error('保存任务失败'); } finally { setTaskSaving(false); }
  }, [editingTask, createTask, updateTask, messageApi]);

  const handleTaskDelete = useCallback(async (taskId: string) => {
    await deleteTask(taskId);
    setShowTaskForm(false);
    setEditingTask(null);
  }, [deleteTask]);

  const handleTaskClaim = useCallback(async (taskId: string) => {
    await claimTask(taskId);
  }, [claimTask]);

  // D-613：系统待办岗位池在面板内直接领取（当前仅裁剪任务有领取接口），领取即归到当前登录人名下
  const handleSystemClaim = useCallback(async (task: TaskItem) => {
    if (task.taskType !== 'CUTTING_TASK') return;
    const cuttingTaskId = String(task.id || '').replace(/^CUT_/, '');
    if (!cuttingTaskId) return;
    try {
      await api.post('/production/cutting-task/receive', {
        taskId: cuttingTaskId,
        receiverId: currentUser?.id != null ? String(currentUser.id) : undefined,
        receiverName: currentUser?.name || currentUser?.username,
      });
      messageApi.success('领取成功，任务已归到你名下');
      await fetchTasks();
      refreshPendingTasks();
    } catch (e) {
      console.error('[GlobalAiAssistant] 面板领取裁剪任务失败:', e);
      messageApi.error((e as Error)?.message || '领取失败');
    }
  }, [currentUser, fetchTasks, refreshPendingTasks, messageApi]);

  const handleTaskComplete = useCallback(async (taskId: string) => {
    await completeTask(taskId);
  }, [completeTask]);

  useEffect(() => {
    if (panelView === 'tasks') startPolling(); else stopPolling();
    return () => stopPolling();
  }, [panelView, startPolling, stopPolling]);

  return {
    isTaskPanelOpen,
    setIsTaskPanelOpen,
    panelView,
    setPanelView,
    showTaskForm,
    setShowTaskForm,
    editingTask,
    setEditingTask,
    taskSaving,
    myTasks,
    tasksLoading,
    taskStats,
    openTaskPanel,
    closeTaskPanel,
    switchToTasks,
    switchToChat,
    handleTaskCreate,
    handleTaskEdit,
    handleTaskSave,
    handleTaskDelete,
    handleTaskClaim,
    handleTaskComplete,
    handleSystemClaim,
    startPolling,
    stopPolling,
  };
}
