import React from 'react';
import { Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { FinishedInventory } from './finishedInventoryTypes';
import { StyleNoForecastHover } from './StyleNoForecastHover';
import type { FinishedInventoryRow } from './flattenBySku';
import { mergeAcrossRows } from './flattenBySku';

/**
 * 颜色/尺码最多渲染的数量，超出以「+N」折叠，避免多码款把行高撑爆。
 */
const MAX_VISIBLE_TAGS = 6;

function renderTagGroup(values: string[] | undefined, fallback: string | undefined, color: string) {
  const list = values && values.length > 0 ? values : fallback ? [fallback] : [];
  if (list.length === 0) {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
  }
  const visible = list.slice(0, MAX_VISIBLE_TAGS);
  const rest = list.length - visible.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {visible.map((v, i) => (
        <Tag key={i} color={color} style={{ margin: 0 }}>
          {v}
        </Tag>
      ))}
      {rest > 0 && (
        <Tooltip title={list.slice(MAX_VISIBLE_TAGS).join('、')}>
          <Tag style={{ margin: 0, background: 'var(--color-border-light)' }}>+{rest}</Tag>
        </Tooltip>
      )}
    </div>
  );
}

export function getMainBasicColumns(): ColumnsType<FinishedInventoryRow> {
  return [
    {
      title: '图片',
      dataIndex: 'styleImage',
      width: 72,
      align: 'center',
      render: (_, record) =>
        mergeAcrossRows(
          <StyleCoverThumb
            src={record.styleImage || null}
            styleNo={record.styleNo}
            color={record.color}
            size={48}
            borderRadius={4}
          />,
          record
        ),
    },
    {
      title: '成品信息',
      width: 200,
      align: 'left' as const,
      render: (_, record) =>
        mergeAcrossRows(
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              lineHeight: 1.45,
              textAlign: 'left',
            }}
          >
            <StyleNoForecastHover styleNo={record.styleNo} />
            <div
              style={{
                fontSize: 13,
                color: 'var(--neutral-text)',
                fontWeight: 500,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={record.styleName}
            >
              {record.styleName || '-'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
              工厂: {record.factoryName || '-'}
            </div>
          </div>,
          record
        ),
    },
    {
      title: '颜色 & 尺码',
      width: 170,
      render: (_, record) =>
        mergeAcrossRows(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {renderTagGroup(record.colors, record.color, 'blue')}
            {renderTagGroup(record.sizes, record.size, 'default')}
          </div>,
          record
        ),
    },
    {
      // D-228：一个商品编码一行——原实现把一款下全部编码堆在同一单元格，
      // 多码款（15 个编码）行高失控。改为款级信息 rowSpan 合并、编码每行一个。
      title: '商品编码',
      dataIndex: '__skuCode',
      width: 210,
      render: (_: unknown, record: FinishedInventoryRow) => {
        if (!record.__skuCode) {
          return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
        }
        return (
          <Tooltip title={record.__skuCode}>
            <span
              style={{
                fontSize: 13,
                fontFamily: 'var(--font-family-mono, monospace)',
                color: 'var(--color-text)',
              }}
            >
              {record.__skuCode}
            </span>
          </Tooltip>
        );
      },
    },
  ];
}

// 保留导出以便其他地方复用类型
export type { FinishedInventory };
