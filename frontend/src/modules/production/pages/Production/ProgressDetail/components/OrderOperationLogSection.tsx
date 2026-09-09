import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Spin, Tag, Typography } from 'antd';
import api from '@/utils/api';

interface OrderOperationLogItem {
  id?: string;
  orderNo?: string;
  action?: string;
  operator?: string;
  remark?: string;
  createTime?: string;
}

/**
 * 大货订单操作记录面板
 * 数据源：t_order_operation_log（同一的"谁在何时做了什么"操作记录）
 */
const OrderOperationLogSection: React.FC<{ orderNo?: string; orderId?: number | string }> = ({ orderNo, orderId }) => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<OrderOperationLogItem[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!orderNo && !orderId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (orderNo) params.orderNo = String(orderNo);
      else if (orderId != null) params.orderId = String(orderId);
      const res: any = await api.get('/order/operation-log/list', { params });
      if (res.code === 200) {
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch {
      // 加载失败不打扰主流程
    } finally {
      setLoading(false);
    }
  }, [orderNo, orderId]);

  useEffect(() => { load(); }, [load]);

  const visibleLogs = showAll ? logs : logs.slice(0, 20);

  return (
    <div style={{ background: 'var(--color-bg-base)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, border: '1px solid var(--color-border-light)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>操作记录</Typography.Title>
        <a style={{ marginLeft: 'auto', fontSize: 12 }} onClick={load}>刷新</a>
      </div>
      <Spin spinning={loading}>
        {logs.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作记录" style={{ margin: '8px 0' }} />
        ) : (
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {visibleLogs.map((item, idx) => (
              <div
                key={item.id ?? idx}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px dashed var(--color-border-light)', fontSize: 13 }}
              >
                <Tag color="blue" style={{ marginInlineEnd: 0, flexShrink: 0 }}>订单</Tag>
                <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, fontSize: 12, lineHeight: '22px' }}>{item.createTime ?? '-'}</span>
                <span style={{ fontWeight: 500, flexShrink: 0, lineHeight: '22px' }}>{item.operator ?? '-'}</span>
                <span style={{ lineHeight: '22px', wordBreak: 'break-all' }}>
                  {item.action}
                  {item.remark ? `：${item.remark}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {logs.length > 20 && (
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <a style={{ fontSize: 12 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '收起，仅显示 20 条' : `查看全部（共 ${logs.length} 条）`}
            </a>
          </div>
        )}
      </Spin>
    </div>
  );
};

export default OrderOperationLogSection;