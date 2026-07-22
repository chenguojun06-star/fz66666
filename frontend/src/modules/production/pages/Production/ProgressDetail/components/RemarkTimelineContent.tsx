// RemarkTimelineContent — 订单备注时间线子组件
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Tag, Button, Input, Empty } from 'antd';
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
          <Input.TextArea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="添加备注…" style={{ flex: 1 }} />
          <Button type="primary" onClick={handleAdd} loading={submitting} disabled={!content.trim()}>提交</Button>
        </div>
      )}
      <Spin spinning={loading}>
        {remarks.length === 0 && !loading ? (
          <Empty description="暂无备注" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflow: 'auto' }}>
            {remarks.map((r) => (
              <div key={r.id} style={{ padding: '8px 10px', background: 'var(--color-bg-container)', borderRadius: 6, border: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>
                    <strong style={{ fontSize: 14 }}>{r.authorName || '匿名'}</strong>
                    {r.authorRole && <Tag style={{ marginLeft: 6, fontSize: 14 }}>{r.authorRole}</Tag>}
                  </span>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>{formatDateTime(r.createTime)}</span>
                </div>
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.content}</div>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
};

export default RemarkTimelineContent;
