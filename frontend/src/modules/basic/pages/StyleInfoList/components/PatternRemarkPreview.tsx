import React, { useState } from 'react';
import { Skeleton, Tag } from 'antd';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';

/** 样衣备注日志预览（展示最近 3 条，与小程序「备注日志」tab 数据同源：t_order_remark where targetType=pattern） */
const PatternRemarkPreview: React.FC<{ patternId: string }> = ({ patternId }) => {
  const [list, setList] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!patternId) return;
    let cancelled = false;
    setLoading(true);
    remarkApi.list({ targetType: 'pattern', targetNo: patternId })
      .then((res: any) => {
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setList(arr.slice(0, 3));
      })
      .catch(() => { if (!cancelled) setList([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patternId]);

  if (loading) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (list.length === 0) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        暂无备注日志
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((r) => (
        <div
          key={r.id}
          style={{
            padding: '8px 10px',
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>
              <strong>{r.authorName || '匿名'}</strong>
              {r.authorRole && <Tag style={{ marginLeft: 8 }}>{r.authorRole}</Tag>}
            </span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              {r.createTime ? String(r.createTime).replace('T', ' ').substring(0, 16) : ''}
            </span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--color-text-secondary)' }}>
            {r.content}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PatternRemarkPreview;
