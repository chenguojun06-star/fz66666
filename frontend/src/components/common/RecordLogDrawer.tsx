import React, { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Spin, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import api from '@/utils/api';

/**
 * RecordLogDrawer — 通用记录日志侧滑看板（D-362i）。
 *
 * 数据源：t_operation_log（全站操作日志 AOP 落库）GET /system/operation-log/list。
 * 解决"页面只有操作按钮没有日志痕迹，要跑去系统日志中心翻"的问题：
 * 任何列表页传 module / targetType（可选 targetId 精确到单据）即可挂出本抽屉。
 *
 * @example
 * <RecordLogDrawer
 *   open={logOpen} onClose={() => setLogOpen(false)}
 *   title="出库日志" targetType="出货单" targetIds={[record.outstockNo]}
 * />
 */
export interface RecordLogDrawerFilter {
  /** 业务模块，如 仓库管理 / 订单 / 采购单（后端 resolveModuleByUri 落库值） */
  module?: string;
  /** 业务对象类型，如 出货单 / 物料入库单 / 订单 */
  targetType?: string;
  /** 单个业务对象ID（服务端精确过滤，配合单行「日志」按钮） */
  targetId?: string;
  /**
   * 多个候选ID（客户端过滤）：同一业务在不同链路的日志 targetId 形态可能不同
   * （如出库=AOP取outstockNo/回入库=出库记录id），一并传入即可都查到。
   * 提供时拉取最近 200 条再本地匹配（抽屉场景足够）。
   */
  targetIds?: string[];
}

interface OperationLogItem {
  id?: string | number;
  module?: string;
  operation?: string;
  operatorName?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  reason?: string;
  details?: string;
  changeSummary?: string;
  operationTime?: string;
  status?: string;
  errorMessage?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  filter: RecordLogDrawerFilter;
}

const PAGE_SIZE = 200;

const RecordLogDrawer: React.FC<Props> = ({ open, onClose, title, filter }) => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<OperationLogItem[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: PAGE_SIZE };
      if (filter.module) params.module = filter.module;
      if (filter.targetType) params.targetType = filter.targetType;
      if (filter.targetId) params.targetId = filter.targetId;
      const res = await api.get('/system/operation-log/list', { params });
      const data = res?.data || res;
      const records: OperationLogItem[] = data?.records || data || [];
      if (filter.targetIds && filter.targetIds.length > 0) {
        const ids = new Set(filter.targetIds.map(String));
        const matched = records.filter((r) => r.targetId && ids.has(String(r.targetId)));
        setLogs(matched);
        setTotal(matched.length);
      } else {
        setLogs(records);
        setTotal(data?.total || records.length);
      }
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [open, filter.module, filter.targetType, filter.targetId, filter.targetIds]);

  useEffect(() => {
    load();
  }, [load]);

  const renderContent = (item: OperationLogItem) => {
    const parts = [item.targetName, item.details, item.changeSummary, item.reason]
      .filter((v) => v && String(v).trim());
    if (item.status === 'failure' && item.errorMessage) parts.push(`失败原因: ${item.errorMessage}`);
    return parts.length > 0 ? (
      <span style={{ wordBreak: 'break-all' }}>{parts.join('｜')}</span>
    ) : <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={title || '操作日志'}
      width={760}
      footer={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            共 {total} 条{filter.targetIds && total >= PAGE_SIZE ? '（仅匹配最近 200 条）' : ''}
          </span>
          <Button icon={<ReloadOutlined />} size="small" onClick={() => { void load(); }}>刷新</Button>
        </div>
      )}
    >
      <Spin spinning={loading}>
        {logs.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作日志" style={{ marginTop: 60 }} />
        ) : (
          <Table
            size="small"
            rowKey={(r) => String(r.id ?? r.operationTime)}
            dataSource={logs}
            pagination={false}
            columns={[
              {
                title: '操作时间',
                dataIndex: 'operationTime',
                key: 'time',
                width: 160,
                render: (v: string) => <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{v ?? '-'}</span>,
              },
              {
                title: '操作类型',
                dataIndex: 'operation',
                key: 'type',
                width: 150,
                render: (_: unknown, item: OperationLogItem) => (
                  <span style={{ fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Tag color={item.status === 'failure' ? 'red' : 'blue'} style={{ marginInlineEnd: 4 }}>
                      {item.status === 'failure' ? '失败' : (item.operation || '-')}
                    </Tag>
                    {item.status !== 'failure' && (item.targetType || item.module || '')}
                  </span>
                ),
              },
              {
                title: '操作内容',
                key: 'content',
                render: (_: unknown, item: OperationLogItem) => renderContent(item),
              },
              {
                title: '操作人',
                dataIndex: 'operatorName',
                key: 'operator',
                width: 110,
                render: (v: string) => v || '-',
              },
            ]}
          />
        )}
      </Spin>
    </SideDrawer>
  );
};

export default RecordLogDrawer;
