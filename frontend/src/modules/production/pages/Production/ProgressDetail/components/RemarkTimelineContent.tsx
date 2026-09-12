// RemarkTimelineContent — 订单备注时间线子组件
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Tag, Button, Input, Empty, Table } from 'antd';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';
import { formatDateTime } from '@/utils/datetime';

interface RemarkTimelineContentProps {
  targetType: string;
  targetNo: string;
  canAddRemark?: boolean;
}

const RemarkTimelineContent: React.FC<RemarkTimelineContentProps> = ({
  targetType, targetNo, canAddRemark = false,
}) => {
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRemarks = useCallback(async () => {
    if (!targetNo) return;
    setLoading(true);
    try {
      const res: any = await remarkApi.list({ targetType, targetNo });
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setRemarks(list);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [targetType, targetNo]);

  useEffect(() => { if (targetNo) fetchRemarks(); }, [targetNo, fetchRemarks]);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await remarkApi.add({ targetType, targetNo, authorRole: '工序质检', content: trimmed });
      setContent('');
      fetchRemarks();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400 }}>
      {canAddRemark && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="添加备注…" style={{ flex: 1 }} />
          <Button type="primary" onClick={handleAdd} loading={submitting} disabled={!content.trim()}>提交</Button>
        </div>
      )}
      <Spin spinning={loading}>
        {remarks.length === 0 && !loading ? (
          <Empty description="暂无备注" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          // D-362g：对齐全站日志标准四列（操作时间/操作类型/操作内容/操作人）
          <Table
            size="small"
            rowKey="id"
            dataSource={remarks}
            pagination={false}
            columns={[
              { title: '操作时间', dataIndex: 'createTime', key: 'time', width: 150, render: (v: string) => <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{formatDateTime(v)}</span> },
              { title: '操作类型', dataIndex: 'authorRole', key: 'type', width: 130, render: (v: string) => v ? <Tag style={{ marginRight: 0 }}>{v}</Tag> : <span>备注</span> },
              { title: '操作内容', dataIndex: 'content', key: 'content', render: (v: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{v}</span> },
              { title: '操作人', dataIndex: 'authorName', key: 'operator', width: 110, render: (v: string) => v || '匿名' },
            ]}
          />
        )}
      </Spin>
    </div>
  );
};

export default RemarkTimelineContent;
