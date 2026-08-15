import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Spin, Tag, Typography } from 'antd';
import api from '@/utils/api';

interface StyleOperationLogItem {
  id?: number;
  styleId?: number;
  bizType?: string;
  action?: string;
  operator?: string;
  remark?: string;
  createTime?: string;
}

const BIZ_TAG: Record<string, { color: string; text: string }> = {
  style: { color: 'blue', text: '款式' },
  pattern: { color: 'purple', text: '打版' },
  sample: { color: 'orange', text: '样衣' },
  maintenance: { color: 'green', text: '维护' },
};

/**
 * 款式操作记录面板
 * 数据源：t_style_operation_log（D-069 起款式级 BOM 操作日志写入该表，不再污染生产要求字段）
 */
const OperationLogSection: React.FC<{ styleId?: string | number; styleNo?: string }> = ({ styleId, styleNo }) => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<StyleOperationLogItem[]>([]);

  const load = useCallback(async () => {
    if (!styleId && !styleNo) return;
    setLoading(true);
    try {
      const params = styleId ? { styleId: String(styleId) } : { styleNo };
      const res: any = await api.get('/style/operation-log/list', { params });
      if (res.code === 200) {
        setLogs(Array.isArray(res.data) ? res.data.slice(0, 30) : []);
      }
    } catch {
      // 操作记录加载失败不打扰主流程
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '16px 24px', marginBottom: 16, border: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>操作记录</Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          （物料清单同步、库存检查、生成采购任务等款式级操作日志）
        </Typography.Text>
        <a style={{ marginLeft: 'auto', fontSize: 12 }} onClick={load}>刷新</a>
      </div>
      <Spin spinning={loading}>
        {logs.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作记录" style={{ margin: '8px 0' }} />
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {logs.map((item, idx) => {
              const tag = BIZ_TAG[item.bizType ?? ''] ?? { color: 'default', text: item.bizType || '日志' };
              return (
                <div
                  key={item.id ?? idx}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px dashed #f0f0f0', fontSize: 13 }}
                >
                  <Tag color={tag.color} style={{ marginInlineEnd: 0, flexShrink: 0 }}>{tag.text}</Tag>
                  <span style={{ color: '#8c8c8c', flexShrink: 0, fontSize: 12, lineHeight: '22px' }}>{item.createTime ?? '-'}</span>
                  <span style={{ fontWeight: 500, flexShrink: 0, lineHeight: '22px' }}>{item.operator ?? '-'}</span>
                  <span style={{ lineHeight: '22px', wordBreak: 'break-all' }}>
                    {item.action}
                    {item.remark ? `：${item.remark}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Spin>
    </div>
  );
};

export default OperationLogSection;
