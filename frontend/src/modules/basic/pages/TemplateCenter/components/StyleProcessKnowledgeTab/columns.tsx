import React from 'react';
import { Tag, Space, Tooltip } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { ColumnsType } from 'antd/es/table';
import type { ProcessKnowledgeItem } from '@/services/intelligence/intelligenceApi';
import { formatMoney } from '@/utils/format';
import { STAGE_COLOR } from './constants';
import TrendTag from './TrendTag';

export const buildColumns = (): ColumnsType<ProcessKnowledgeItem> => [
  {
    title: '工序名称',
    dataIndex: 'processName',
    width: 140,
    fixed: 'left',
    render: (v, r) => (
      <Space>
        <strong>{v}</strong>
        {r.abnormalCount && r.abnormalCount > 0 ? (
          <Tooltip title={`${r.abnormalCount} 条异常价格记录（偏离均价±30%）`}>
            <Tag color="warning" style={{ marginLeft: 0 }}>
              <WarningOutlined /> {r.abnormalCount}
            </Tag>
          </Tooltip>
        ) : null}
      </Space>
    ),
  },
  {
    title: '节点',
    dataIndex: 'progressStage',
    width: 80,
    render: (v) =>
      v ? (
        <Tag color={STAGE_COLOR[v] || 'default'} style={{ fontSize: 14 }}>
          {v}
        </Tag>
      ) : (
        '-'
      ),
  },
  {
    title: '用款数',
    dataIndex: 'usageCount',
    width: 80,
    sorter: (a, b) => a.usageCount - b.usageCount,
    render: (v) => (
      <Tag color="processing" style={{ minWidth: 36, textAlign: 'center' }}>
        {v} 款
      </Tag>
    ),
  },
  {
    title: '价格区间（元）',
    key: 'priceRange',
    width: 150,
    render: (_, r) =>
      r.minPrice != null && r.maxPrice != null ? (
        <Space size={4}>
          <span style={{ color: 'var(--color-success)' }}>{formatMoney(r.minPrice)}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>~</span>
          <span style={{ color: 'var(--color-error)' }}>{formatMoney(r.maxPrice)}</span>
        </Space>
      ) : (
        '-'
      ),
  },
  {
    title: '历史均价',
    dataIndex: 'avgPrice',
    width: 100,
    sorter: (a, b) => (a.avgPrice ?? 0) - (b.avgPrice ?? 0),
    render: (v) => (v != null ? formatMoney(v) : '-'),
  },
  {
    title: (
      <Tooltip title="AI 加权建议价（最近 3 条权重 ×2）">
        <Space size={4}>
          <XiaoyunCloudAvatar size={18} active />
          AI建议价
        </Space>
      </Tooltip>
    ),
    dataIndex: 'suggestedPrice',
    width: 110,
    render: (v) =>
      v != null ? (
        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{formatMoney(v)}</span>
      ) : (
        '-'
      ),
  },
  {
    title: '价格趋势',
    dataIndex: 'priceTrend',
    width: 90,
    render: (v) => <TrendTag trend={v} />,
  },
  {
    title: '最近使用',
    dataIndex: 'lastUsedTime',
    width: 120,
    render: (v) => v || '-',
  },
];
