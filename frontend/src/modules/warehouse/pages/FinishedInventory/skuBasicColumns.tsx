import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { styleImageColumn } from '@/components/common/styleImageColumns';
import type { StyleImageMap } from '@/hooks/useStyleCoverImages';
import type { SKUDetail } from './finishedInventoryTypes';

/**
 * 出库弹窗「商品编码明细」表的基础列。
 *
 * @param args.imageMap 款号/SKU → 图片 URL（来自 useStyleCoverImages，
 *   由父级 index.tsx 汇总本表所有 sku 后一次性批量解析）。
 *   传空对象也能渲染，只是显示占位灰块——**不做任何字符串猜测**。
 */
export function getSkuBasicColumns(args?: {
  imageMap?: StyleImageMap;
}): ColumnsType<SKUDetail> {
  const imageMap = args?.imageMap ?? {};
  return [
    // 款式图：以前这张表只有编码/颜色/尺码，出库时"看不出要发的是哪件货"
    styleImageColumn<SKUDetail>({ imageMap, skuCode: (r) => r.sku }),
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
