/**
 * AI 智能执行面板 - 业务逻辑 Hook
 *
 * 职责：
 *   1. 维护待审批命令列表与轮询同步（useSync 替代 setInterval）
 *   2. 维护详情抽屉与执行结果模态框的开关状态
 *   3. 提供查看详情 / 批准执行 / 拒绝命令等事件处理
 */
import { useState } from 'react';
import { Modal } from 'antd';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { useSync } from '@/utils/syncManager';
import type { ExecuteResult, PendingCommand } from './types';

export function useAiExecutionPanelData() {
  // =====================================================
  // 状态管理
  // =====================================================

  const [pendingCommands, setPendingCommands] = useState<PendingCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<PendingCommand | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =====================================================
  // 生命周期：自动轮询待审批命令
  // =====================================================

  // 实时同步：待审批命令（替代手动 setInterval）
  useSync<PendingCommand[] | null>(
    'ai-execution-pending-commands',
    async () => {
      try {
        const response = await intelligenceApi.getPendingCommands();
        return response?.pending ?? [];
      } catch (err: unknown) {
        console.error('Failed to fetch pending commands:', err);
        return null;
      }
    },
    (newData) => {
      if (newData !== null) {
        setPendingCommands(newData);
        setError(null);
      }
    },
    {
      interval: 30000,
      pauseOnHidden: true,
      onError: (err) => setError(err instanceof Error ? err.message : '获取待审批命令失败')
    }
  );

  // =====================================================
  // 数据获取
  // =====================================================

  const fetchPendingCommands = async () => {
    try {
      setLoading(true);
      const response = await intelligenceApi.getPendingCommands();
      setPendingCommands(response?.pending ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取待审批命令失败');
      console.error('Failed to fetch pending commands:', err);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // 事件处理：查看命令详情
  // =====================================================

  const handleViewDetail = (command: PendingCommand) => {
    setSelectedCommand(command);
    setShowDetail(true);
  };

  // =====================================================
  // 事件处理：执行命令
  // =====================================================

  const handleApproveCommand = async () => {
    if (!selectedCommand) return;

    try {
      setExecuting(true);
      const result = await intelligenceApi.approveCommand(selectedCommand.commandId, {
        remark: '用户在智能执行面板批准并执行'
      });

      setExecuteResult({
        success: result.status === 'SUCCESS',
        message: result.message || '命令已批准并执行',
        data: result.data,
        cascadedTasks: result.cascadedTasks,
        notifiedRecipients: result.notifiedRecipients
      });

      setShowResult(true);
      setShowDetail(false);

      // 刷新待审批列表
      await fetchPendingCommands();
    } catch (err: unknown) {
      setExecuteResult({
        success: false,
        message: err instanceof Error ? err.message : '批准并执行失败',
        error: err
      });
      setShowResult(true);
    } finally {
      setExecuting(false);
    }
  };

  // =====================================================
  // 事件处理：拒绝命令
  // =====================================================

  const handleRejectCommand = () => {
    if (!selectedCommand) return;

    Modal.confirm({
      width: '30vw',
      title: '确认拒绝',
      content: `确定要拒绝该命令吗？\n命令ID: ${selectedCommand.commandId}`,
      okText: '拒绝',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        try {
          setExecuting(true);
          await intelligenceApi.rejectCommand(selectedCommand.commandId, {
            reason: '用户手动拒绝'
          });

          Modal.success({
            title: '已拒绝',
            content: '该命令已被拒绝'
          });

          setShowDetail(false);
          await fetchPendingCommands();
        } catch (err: unknown) {
          Modal.error({
            title: '拒绝失败',
            content: err instanceof Error ? err.message : '拒绝命令出错'
          });
        } finally {
          setExecuting(false);
        }
      }
    });
  };

  return {
    // state
    pendingCommands,
    loading,
    selectedCommand,
    showDetail,
    executing,
    executeResult,
    showResult,
    error,
    // setters
    setShowDetail,
    setShowResult,
    setError,
    // actions
    fetchPendingCommands,
    handleViewDetail,
    handleApproveCommand,
    handleRejectCommand
  };
}
