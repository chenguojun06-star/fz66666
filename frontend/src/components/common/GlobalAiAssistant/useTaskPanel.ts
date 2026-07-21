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
import { useTaskManager } from './useTaskManager';
import type { PanelView, TaskItem } from './types';

type MessageApi = ReturnType<typeof import('antd').App.useApp>['message'];

interface UseTaskPanelParams {
  refreshPendingTasks: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  messageApi: MessageApi;
}

export function useTaskPanel({
  refreshPendingTasks,
  setIsOpen,
  messageApi,
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

  const openTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(true);
    setIsOpen(false);
    refreshPendingTasks();
  }, [refreshPendingTasks, setIsOpen]);

  const closeTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(false);
  }, []);

  const backToChat = useCallback(() => {
    setIsTaskPanelOpen(false);
    setIsOpen(true);
    setPanelView('chat');
  }, [setIsOpen]);

  const switchToTasks = useCallback(() => {
    setPanelView('tasks');
    fetchTasks();
    startPolling();
  }, [fetchTasks, startPolling]);

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
    backToChat,
    switchToTasks,
    switchToChat,
    handleTaskCreate,
    handleTaskEdit,
    handleTaskSave,
    handleTaskDelete,
    handleTaskClaim,
    handleTaskComplete,
    startPolling,
    stopPolling,
  };
}
