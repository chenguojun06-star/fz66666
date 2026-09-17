import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Skeleton, Table, Tag } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';

/**
 * D-445：多供应商比价抽屉。
 * 数据源：GET /api/material-color-card/price-comparison?keyword=物料名称
 * 聚合两个价格源（后端按单价升序返回）：
 *   ①色卡报价——供应商色卡条目（报价口径）
 *   ②采购成交——物料采购到货记录（真实成交口径，含数量与采购单号）
 */
interface PriceRow {
  source?: string;
  /** D-447：匹配依据——本物料/同款同色/同名同规格/同名/同成分同规格 */
  matchBasis?: string;
  supplierName?: string;
  cardName?: string;
  materialName?: string;
  color?: string;
  specifications?: string;
  fabricComposition?: string;
  unitPrice?: number;
  quantity?: number;
  purchaseNo?: string;
  materialId?: string;
}

interface PriceComparisonDrawerProps {
  open: boolean;
  materialId: string;
  materialName: string;
  onClose: () => void;
}

const PriceComparisonDrawer: React.FC<PriceComparisonDrawerProps> = ({ open, materialId, materialName, onClose }) => {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    try {
      const res = await api.get('/material-color-card/price-comparison', {
        params: { materialId },
      });
      const data = res?.data || res;
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    if (open && materialId) load();
    if (!open) setRows([]);
  }, [open, materialId, load]);

  const prices = rows.map((r) => Number(r.unitPrice) || 0).filter((p) => p > 0);
  const lowest = prices.length ? Math.min(...prices) : null;
  const highest = prices.length ? Math.max(...prices) : null;
  const suppliers = Array.from(new Set(rows.map((r) => String(r.supplierName || '').trim()).filter(Boolean)));

  return (
    <SideDrawer
      title={`多供应商比价${materialName ? ` - ${materialName}` : ''}`}
      open={open}
      onClose={onClose}
      width="85%"
      footer={null}
    >
      <div className="u-mb-8 u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
        匹配依据分级：同款同色（最可信）＞ 同名同规格 ＞ 同名 ＞ 同成分同规格。价格按"依据可信度 → 单价"排序。
      </div>
      {lowest != null && (
        <div
          className="u-mb-12 u-p-8px12px u-br-6 u-fs-13"
          style={{ background: 'var(--color-bg-subtle, #f5f5f5)', lineHeight: '22px' }}
        >
          共 <b>{rows.length}</b> 条报价 · <b>{suppliers.length}</b> 家供应商 ·
          最低 <b style={{ color: 'var(--color-success)' }}>{formatMoney(lowest)}</b>
          {highest != null && highest > lowest ? (
            <> · 最高 <b style={{ color: 'var(--color-danger)' }}>{formatMoney(highest)}</b> ·
              价差 <b>{highest > 0 ? `${Math.round(((highest - lowest) / highest) * 100)}%` : '-'}</b></>
          ) : null}
        </div>
      )}
      {loading ? (
        <Skeleton active />
      ) : rows.length === 0 ? (
        <Empty description="暂无该物料的比价数据（色卡报价与采购记录均未匹配）" />
      ) : (
        <Table
          size="middle"
          rowKey={(r, i) => `${r.source}-${r.supplierName}-${r.unitPrice}-${i}`}
          dataSource={rows}
          pagination={false}
          columns={[
            {
              title: '价格来源', dataIndex: 'source', width: 100,
              render: (v: string) => <Tag color={v === '色卡报价' ? 'blue' : v === '采购成交' ? 'green' : 'cyan'}>{v || '-'}</Tag>,
            },
            {
              title: '匹配依据', dataIndex: 'matchBasis', width: 130,
              render: (v: string) => {
                const map: Record<string, string> = {
                  本物料: 'cyan', 同款同色: 'green', 同名同规格: 'blue', 同名: 'orange', 同成分同规格: 'default',
                };
                return <Tag color={map[v] || 'default'}>{v || '-'}</Tag>;
              },
            },
            {
              title: '供应商', dataIndex: 'supplierName', width: 150, ellipsis: true,
              render: (v: string, r: PriceRow) => {
                const isLowest = Number(r.unitPrice) === lowest;
                return (
                  <span className="u-fw-600" style={{ color: isLowest ? 'var(--color-success)' : undefined }}>
                    {v || '-'}{isLowest ? '（最低价）' : ''}
                  </span>
                );
              },
            },
            { title: '物料名称', dataIndex: 'materialName', width: 200, ellipsis: true },
            { title: '颜色', dataIndex: 'color', width: 80, render: (v: string) => v || '-' },
            { title: '规格', dataIndex: 'specifications', width: 120, ellipsis: true, render: (v: string) => v || '-' },
            {
              title: '单价', dataIndex: 'unitPrice', width: 110, align: 'right' as const,
              render: (v: number, r: PriceRow) => (
                <span className="u-fw-600" style={{ color: Number(v) === lowest ? 'var(--color-success)' : undefined, fontSize: 14 }}>
                  {v != null ? formatMoney(v) : '-'}
                </span>
              ),
            },
            {
              title: '数量 / 参考', key: 'ref', width: 170,
              render: (_: unknown, r: PriceRow) =>
                r.source === '采购成交'
                  ? <span>{r.quantity != null ? `${r.quantity} 件` : '-'}{r.purchaseNo ? ` · ${r.purchaseNo}` : ''}</span>
                  : <span style={{ color: 'var(--color-text-tertiary)' }}>{r.materialId ? '物料档案' : '色卡报价'}</span>,
            },
          ]}
        />
      )}
    </SideDrawer>
  );
};

export default PriceComparisonDrawer;
