/**
 * D-532：组合商品（套装）可售库存面板。
 * 数据：GET /ec/stock/combo-list —— availableStock(套)=min(子SKU可用/单套数量)。
 * 展示在电商中心「智能库存」Tab 的库存明细下方，与 SKU 库存并列。
 */
import React from 'react';
import { Tag } from 'antd';
import { DeploymentUnitOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import api from '@/utils/api';
import type { ComboProductVO } from '@/services/warehouse/comboProductApi';

const ComboStockPanel: React.FC = () => {
  const [rows, setRows] = React.useState<ComboProductVO[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ec/stock/combo-list');
      const data = res?.data ?? res;
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    if (mounted) void load();
    return () => { mounted = false; };
  }, [load]);

  const columns = React.useMemo(() => [
    {
      title: '图片', key: 'cover', width: 60,
      render: (_: unknown, r: ComboProductVO) => (
        <StyleCoverThumb src={r.coverUrl || r.items?.[0]?.styleImage || null} styleNo={r.items?.[0]?.styleNo} size={40} />
      ),
    },
    {
      title: '组合编码', dataIndex: 'comboCode', width: 150,
      render: (v: string) => (
        <span className="u-fw-600" style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>
          <DeploymentUnitOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />{v}
        </span>
      ),
    },
    { title: '组合名称', dataIndex: 'comboName', width: 180, ellipsis: true },
    {
      title: '构成', key: 'items', width: 260,
      render: (_: unknown, r: ComboProductVO) => {
        const list = r.items || [];
        if (!list.length) return '-';
        return (
          <span title={list.map((i) => `${i.skuCode} × ${i.quantity}（可用${i.availableQty ?? 0}）`).join('\n')}>
            {list.slice(0, 2).map((i) => `${i.styleNo || i.skuCode}×${i.quantity}`).join(' + ')}
            {list.length > 2 ? ` +${list.length - 2}` : ''}
          </span>
        );
      },
    },
    {
      title: '最紧缺子SKU', key: 'bottleneck', width: 200,
      render: (_: unknown, r: ComboProductVO) => {
        const list = (r.items || []).filter((i) => (i.availableQty ?? 0) < i.quantity);
        if (!list.length) return <Tag color="green" style={{ margin: 0 }}>子SKU充足</Tag>;
        const worst = [...list].sort((a, b) => (a.availableQty || 0) - (b.availableQty || 0))[0];
        return <Tag color="red" style={{ margin: 0 }} title="该子SKU限制了套装可售套数">{worst.styleNo || worst.skuCode}（可用 {worst.availableQty ?? 0}）</Tag>;
      },
    },
    {
      title: '可售库存(套)', dataIndex: 'availableStock', width: 110, align: 'right' as const,
      render: (v: number) => (
        <span className="u-fw-600" style={{ color: v > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{v ?? 0}</span>
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => v === 'DISABLED' ? <Tag style={{ margin: 0 }}>已停用</Tag> : <Tag color="green" style={{ margin: 0 }}>启用中</Tag>,
    },
  ], []);

  return (
    <ResizableTable
      size="small"
      columns={columns as never}
      dataSource={rows}
      rowKey="id"
      loading={loading}
      pagination={false}
      emptyDescription="暂无组合商品——在「组合商品」页把两件不同款式搭成套装后，这里会显示套装可售库存"
    />
  );
};

export default ComboStockPanel;
