import React, { useCallback, useState } from 'react';
import { Popover, Typography } from 'antd';
import { cuttingApi, type MaterialUsageChain } from '@/services/production/cuttingApi';

const { Text } = Typography;

interface MaterialUsageChainCellProps {
  orderNo?: string;
  materialCode?: string;
  unit?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: unknown): string => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * D-823 采购详情页「裁剪用料」链路单元格。
 *
 * 点击展开该物料行的全链路：采购-到货-已领出-退回（采购侧，同表其他列）
 * ↔ 裁剪计划-领出-实际消耗-余料-已回库（裁剪侧，来自 t_cutting_material_usage）。
 * 懒加载：仅点击时才拉 chain，避免详情页 N 行齐发请求。
 */
const MaterialUsageChainCell: React.FC<MaterialUsageChainCellProps> = ({ orderNo, materialCode, unit }) => {
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<MaterialUsageChain | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orderNo || !materialCode || chain || loading) return;
    setLoading(true);
    try {
      const res = await cuttingApi.chain(orderNo, materialCode);
      setChain(res);
    } catch {
      // 链路拉取失败静默：内容区显示「暂无链路数据」，不阻塞采购详情
    } finally {
      setLoading(false);
    }
  }, [orderNo, materialCode, chain, loading]);

  if (!orderNo || !materialCode) {
    return <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
  }

  const remnant = chain ? num(chain.cuttingRemnant) : 0;
  const hasCutting = chain && (num(chain.cuttingPlanned) > 0 || num(chain.cuttingActualUsed) > 0);

  const content = loading ? (
    <Text type="secondary">链路加载中…</Text>
  ) : !chain ? (
    <Text type="secondary">暂无链路数据</Text>
  ) : (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">采购侧：</Text>
        采购 <Text strong>{fmt(chain.purchaseQuantity)}</Text>
        {' · '}到货 <Text strong>{fmt(chain.arrivedQuantity)}</Text>
        {' · '}已领出 <Text strong>{fmt(chain.usedQuantity)}</Text>
        {' · '}退回 <Text strong>{fmt(chain.returnQuantity)}</Text>
        {' · '}采购剩余 <Text strong style={{ color: '#1677ff' }}>{fmt(chain.purchaseRemaining)}</Text>
      </div>
      <div>
        <Text type="secondary">裁剪侧：</Text>
        计划 <Text strong>{fmt(chain.cuttingPlanned)}</Text>
        {' · '}领出 <Text strong>{fmt(chain.cuttingIssued)}</Text>
        {' · '}实际消耗 <Text strong>{fmt(chain.cuttingActualUsed)}</Text>
        {' · '}余料{' '}
        <Text strong style={{ color: remnant > 0 ? '#fa8c16' : undefined }}>{fmt(chain.cuttingRemnant)}</Text>
        {' · '}已回库 <Text strong style={{ color: '#52c41a' }}>{fmt(chain.remnantInbounded)}</Text>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <span
        className="u-cur-pointer"
        title="查看该物料的采购↔裁剪全链路"
        style={{
          color: hasCutting ? 'var(--color-primary)' : 'var(--color-text-quaternary)',
          fontWeight: hasCutting ? 600 : 400,
        }}
      >
        {hasCutting ? `余料 ${fmt(remnant)}${unit ? ' ' + unit : ''}` : '未裁剪'}
      </span>
    </Popover>
  );
};

export default MaterialUsageChainCell;
