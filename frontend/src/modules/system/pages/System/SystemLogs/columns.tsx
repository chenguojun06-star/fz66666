import React from 'react';
import { Tag, Button } from 'antd';
import { formatDateTimeSecond } from '@/utils/datetime';
import { OperationLog } from '@/types/operation-log';
import { normalizeLoginStatus, getStatusText, OPERATION_COLOR_MAP } from './helpers';

/** 登录日志列定义 */
export const getLoginColumns = () => [
  { title: '用户名', dataIndex: 'username', key: 'username', width: 140 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 140 },
  { title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 150 },
  {
    title: '登录时间',
    dataIndex: 'loginTime',
    key: 'loginTime',
    width: 180,
    render: (v: unknown) => formatDateTimeSecond(v),
  },
  {
    title: '状态',
    dataIndex: 'loginStatus',
    key: 'loginStatus',
    width: 110,
    render: (v: unknown) => {
      const status = normalizeLoginStatus(v as string);
      return <Tag color={status === 'success' ? 'green' : 'red'}>{getStatusText(status)}</Tag>;
    },
  },
  { title: '消息', dataIndex: 'message', key: 'message', ellipsis: true },
];

/** 操作日志列定义（需要外部传入查看详情回调） */
export const getOperationColumns = (onViewDetails: (record: OperationLog) => void) => [
  {
    title: '模块',
    dataIndex: 'module',
    key: 'module',
    width: 130,
    minWidth: 100,
    resizable: true,
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 110, resizable: true },
  { title: '目标类型', dataIndex: 'targetType', key: 'targetType', width: 110, resizable: true },
  {
    title: '目标名称',
    dataIndex: 'targetName',
    key: 'targetName',
    width: 160,
    resizable: true,
    ellipsis: true,
    render: (_: string, record: OperationLog) => record.targetName || record.targetId || '-',
  },
  {
    title: '时间',
    dataIndex: 'operationTime',
    key: 'operationTime',
    width: 170,
    resizable: true,
    render: (v: unknown) => formatDateTimeSecond(v),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 90,
    resizable: true,
    render: (v: 'success' | 'failure') => (
      <Tag color={v === 'success' ? 'green' : 'red'}>
        {v === 'success' ? '成功' : '失败'}
      </Tag>
    ),
  },
  {
    title: '原因',
    dataIndex: 'reason',
    key: 'reason',
    ellipsis: true,
    width: 200,
    resizable: true,
    render: (v: string) => v || '-',
  },
  {
    title: '操作内容',
    dataIndex: 'changeSummary',
    key: 'changeSummary',
    width: 280,
    resizable: true,
    ellipsis: true,
    render: (v: string, record: OperationLog) => {
      if (v) {
        // 优先解析 JSON 数组格式，渲染为「标签：旧→新」摘要
        let brief = '';
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) {
            brief = parsed
              .filter((it: any) => it && typeof it.label === 'string')
              .slice(0, 2)
              .map((it: any) => `${it.label}：${String(it.old ?? '').substring(0, 12)}→${String(it.new ?? '').substring(0, 12)}`)
              .join('；');
            if (parsed.length > 2) brief += `；（共${parsed.length}项变更）`;
          }
        } catch {
          // 非 JSON：直接截断展示
          brief = v.length > 60 ? v.substring(0, 60) + '...' : v;
        }
        return <span style={{ color: 'var(--color-text-secondary)' }}>{brief || '-'}</span>;
      }
      if (record.details) {
        try {
          const obj = JSON.parse(record.details);
          const brief = Object.entries(obj)
            .filter(([k]) => !['id', 'orderId', 'styleId', 'purchaseId'].includes(k))
            .slice(0, 3)
            .map(([k, val]) => `${k}=${String(val).substring(0, 20)}`)
            .join(', ');
          return <span style={{ color: 'var(--color-text-tertiary)' }}>{brief || '-'}</span>;
        } catch {
          return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
        }
      }
      return '-';
    },
  },
  {
    title: '操作',
    dataIndex: 'operation',
    key: 'operation',
    width: 120,
    resizable: true,
    render: (v: string) => <Tag color={OPERATION_COLOR_MAP[v] || 'default'}>{v}</Tag>,
  },
  {
    title: '详情',
    key: 'details',
    width: 90,
    resizable: true,
    render: (_: unknown, record: OperationLog) => (
      <Button type="link" onClick={() => onViewDetails(record)}>
        查看
      </Button>
    ),
  },
];
