import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Spin, Table, Tag, Typography } from 'antd';
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
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!styleId && !styleNo) return;
    setLoading(true);
    try {
      const params = styleId ? { styleId: String(styleId) } : { styleNo };
      const res: any = await api.get('/style/operation-log/list', { params });
      if (res.code === 200) {
        setLogs(Array.isArray(res.data) ? res.data : []);
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

  const visibleLogs = showAll ? logs : logs.slice(0, 20);

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
          // D-360r：对齐订单生产日志的表格布局（操作时间/操作类型/操作内容/操作人），全站日志口径统一
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <Table
              size="small"
              rowKey={(r) => String(r.id ?? r.createTime)}
              dataSource={visibleLogs}
              pagination={false}
              columns={[
                { title: '操作时间', dataIndex: 'createTime', key: 'time', width: 150, render: (v: string) => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{v ?? '-'}</span> },
                { title: '操作类型', dataIndex: 'action', key: 'type', width: 150, render: (_: unknown, item) => {
                  const tag = BIZ_TAG[item.bizType ?? ''] ?? { color: 'default', text: item.bizType || '日志' };
                  return (
                    <span style={{ fontWeight: 500 }}>
                      <Tag color={tag.color} style={{ marginInlineEnd: 4 }}>{tag.text}</Tag>
                      {item.action ?? '-'}
                    </span>
                  );
                } },
                { title: '操作内容', dataIndex: 'remark', key: 'content', render: (v: string) => <span style={{ wordBreak: 'break-all' }}>{v || '-'}</span> },
                { title: '操作人', dataIndex: 'operator', key: 'operator', width: 110, render: (v: string) => v || '-' },
              ]}
            />
          </div>
        )}
        {logs.length > 20 && (
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <a style={{ fontSize: 12 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? `收起，仅显示 20 条` : `查看全部（共 ${logs.length} 条）`}
            </a>
          </div>
        )}
      </Spin>
    </div>
  );
};

export default OperationLogSection;
