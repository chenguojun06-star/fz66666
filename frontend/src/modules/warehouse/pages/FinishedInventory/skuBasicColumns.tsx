import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SKUDetail } from './finishedInventoryTypes';

export function getSkuBasicColumns(): ColumnsType<SKUDetail> {
  return [
    {
      // D-226：完整商品编码放首列（真实 sku_code 原样输出，不简写）
      title: '商品编码',
      dataIndex: 'sku',
      key: 'sku',
      width: 220,
      render: (sku: string) => (
        <span title={sku} style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{sku || '-'}</span>
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      align: 'center',
      render: (color: string) => (
        <Tag color="blue">{color}</Tag>
      ),
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
      render: (size: string) => (
        <Tag color="green">{size}</Tag>
      ),
    },
    {
      title: '仓库位置',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      align: 'center',
    },
  ];
}
