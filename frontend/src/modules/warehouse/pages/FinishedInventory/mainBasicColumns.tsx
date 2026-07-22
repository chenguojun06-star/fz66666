import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { FinishedInventory } from './finishedInventoryTypes';
import { StyleNoForecastHover } from './StyleNoForecastHover';

export function getMainBasicColumns(): ColumnsType<FinishedInventory> {
  return [
    {
      title: '图片',
      dataIndex: 'styleImage',
      width: 72,
      align: 'center',
      render: (_, record) => (
        <StyleCoverThumb
          src={record.styleImage || null}
          styleNo={record.styleNo}
          color={record.color}
          size={48}
          borderRadius={4}
        />
      ),
    },
    {
      title: '成品信息',
      width: 220,
      align: 'left' as const,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, lineHeight: 1.5, textAlign: 'left' }}>
          <StyleNoForecastHover styleNo={record.styleNo} />
          <div style={{ fontSize: 14, color: 'var(--neutral-text)', fontWeight: 500 }}>{record.styleName || '-'}</div>
          <div style={{ fontSize: 14, color: 'var(--neutral-text-secondary)' }}>
            工厂: {record.factoryName || '-'}
          </div>
        </div>
      ),
    },
    {
      title: '颜色 & 尺码',
      width: 180,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {record.colors && record.colors.length > 0 ? (
              record.colors.map((c, i) => <Tag key={i} color="blue" style={{ margin: 0 }}>{c}</Tag>)
            ) : (
              <Tag color="blue" style={{ margin: 0 }}>{record.color}</Tag>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {record.sizes && record.sizes.length > 0 ? (
              record.sizes.map((s, i) => <Tag key={i} style={{ margin: 0, background: 'var(--color-border-light)', border: '1px solid var(--color-border-antd)' }}>{s}</Tag>)
            ) : (
              <Tag style={{ margin: 0, background: 'var(--color-border-light)', border: '1px solid var(--color-border-antd)' }}>{record.size}</Tag>
            )}
          </div>
        </div>
      ),
    },
  ];
}
