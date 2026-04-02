import React, { useCallback, useEffect, useState } from 'react';
import { Button, Descriptions, message, Space, Spin, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';

interface CuttingTask {
  id: string;
  status: 'pending' | 'received' | 'completed';
  receiverName?: string;
  receivedTime?: string;
  orderQuantity?: number;
  styleNo?: string;
}

interface Props {
  orderId: string;
  orderNo: string;
  onDataChanged?: () => void;
}

/**
 * 裁剪快速面板 — NodeDetailModal 裁剪节点专用 Tab
 * 功能：显示裁剪任务状态 + 领取任务 + 跳转到裁剪管理页
 */
const CuttingQuickPanel: React.FC<Props> = ({ orderId, orderNo, onDataChanged }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [task, setTask] = useState<CuttingTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!orderId && !orderNo) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: CuttingTask[] } }>(
        '/production/cutting-task/list',
        { params: { orderNo, page: 1, pageSize: 1 } }
      );
      if (res.code === 200 && res.data?.records?.length) {
        setTask(res.data.records[0]);
      } else {
        setTask(null);
      }
    } catch (_) {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNo]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleReceive = async () => {
    if (!task?.id) {
      message.warning('未找到裁剪任务');
      return;
    }
    setReceiving(true);
    try {
      const res = await api.post<{ code: number; message: string }>('/production/cutting-task/receive', {
        taskId: task.id,
        receiverId: user?.id,
        receiverName: user?.name,
      });
      if (res.code === 200) {
        message.success('领取成功');
        fetchTask();
        onDataChanged?.();
      } else {
        message.error(res.message || '领取失败');
      }
    } finally {
      setReceiving(false);
    }
  };

  const handleNavigate = () => {
    navigate(`/production/cutting?orderNo=${encodeURIComponent(orderNo)}`);
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待领取', color: 'orange' },
    received: { text: '已领取', color: 'processing' },
    completed: { text: '已完成', color: 'success' },
  };
  const status = task ? (statusMap[task.status] ?? { text: task.status, color: 'default' }) : null;

  return (
    <Spin spinning={loading}>
      <div style={{ padding: '8px 0' }}>
        {task ? (
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="状态">
              <Tag color={status?.color}>{status?.text}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="订单数量">
              {task.orderQuantity ?? '-'}
            </Descriptions.Item>
            {task.receiverName && (
              <Descriptions.Item label="裁剪员">{task.receiverName}</Descriptions.Item>
            )}
          </Descriptions>
        ) : (
          <div style={{ color: '#999', marginBottom: 12, fontSize: 13 }}>
            暂无裁剪任务记录
          </div>
        )}

        <Space>
          {task?.status === 'pending' && (
            <Button type="primary" loading={receiving} onClick={handleReceive}>
              领取任务
            </Button>
          )}
          <Button onClick={handleNavigate}>
            前往裁剪管理 →
          </Button>
        </Space>
      </div>
    </Spin>
  );
};

export default CuttingQuickPanel;
