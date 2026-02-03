/**
 * 工序进度与单价网格展示组件
 * 用于在生产进度详情页以网格形式展示工序进度和单价信息
 */
import React from 'react';
import { Card, Typography, InputNumber } from 'antd';
import LiquidProgressBar from './LiquidProgressBar';
import { getProgressColorStatus } from '@/utils/progressColor';

const { Text } = Typography;

/**
 * 进度节点类型定义
 */
export type ProgressNode = {
  id: string;
  name: string;
  unitPrice?: number;
};

/**
 * 节点统计信息
 */
export type NodeStat = {
  done: number;
  total: number;
  remaining: number;
  percent: number;
};

/**
 * 工序进度与单价展示组件属性
 */
export interface HorizontalProgressPriceViewProps {
  /** 进度节点列表 */
  nodes: ProgressNode[];
  /** 节点统计数据 */
  nodeStats: Record<string, NodeStat>;
  /** 总数量 */
  totalQty: number;
  /** 是否可编辑单价 */
  canEdit?: boolean;
  /** 单价变更回调 */
  onPriceChange?: (nodeId: string, newPrice: number) => void;
  /** 是否冻结（订单已完成） */
  frozen?: boolean;
  /** 订单交期（用于计算进度条颜色状态） */
  plannedEndDate?: string | null;
}

/**
 * 限制百分比在0-100范围内
 */
const clampPercent = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

/**
 * 根据进度和交期计算状态
 */
const getProgressStatus = (
  percent: number,
  frozen: boolean,
  plannedEndDate?: string | null
): 'normal' | 'warning' | 'danger' | undefined => {
  if (frozen || percent >= 100) return undefined; // 已完成不显示状态
  // 根据订单交期计算颜色状态
  return getProgressColorStatus(plannedEndDate);
};

/**
 * 工序进度与单价网格展示组件
 */
const HorizontalProgressPriceView: React.FC<HorizontalProgressPriceViewProps> = ({
  nodes = [],
  nodeStats = {},
  totalQty = 0,
  canEdit = false,
  onPriceChange,
  frozen = false,
  plannedEndDate,
}) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return (
      <Card size="small">
        <Text type="secondary">暂无工序数据</Text>
      </Card>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* 竖向网格容器 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {nodes.map((node) => {
          const stat = nodeStats[node.name] || {
            done: 0,
            total: totalQty,
            remaining: totalQty,
            percent: 0,
          };
          const percent = clampPercent(stat.percent);
          const unitPrice = Number(node.unitPrice) || 0;
          const hasPrice = unitPrice > 0;
          const status = getProgressStatus(percent, frozen, plannedEndDate);

          return (
            <Card
              key={node.id}
              size="small"
              style={{
                background: frozen
                  ? 'linear-gradient(135deg, rgba(248, 250, 252, 0.85), rgba(241, 245, 249, 0.7))'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 249, 250, 0.8))',
                border: percent >= 100
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : '1px solid rgba(15, 23, 42, 0.08)',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
              }}
              styles={{
                body: {
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                },
              }}
            >
              {/* 工序名称 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <Text
                  strong
                  style={{
                    fontSize: "var(--font-size-md)",
                    color: frozen ? 'rgba(15, 23, 42, 0.6)' : 'rgba(15, 23, 42, 0.88)',
                  }}
                >
                  {node.name}
                </Text>
                <Text
                  style={{
                    fontSize: "var(--font-size-xl)",
                    fontWeight: 700,
                    color:
                      percent >= 100
                        ? 'var(--color-success)'
                        : percent > 0
                        ? 'var(--color-info)'
                        : 'rgba(15, 23, 42, 0.45)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {percent}%
                </Text>
              </div>

              {/* 进度条 */}
              <div>
                <LiquidProgressBar
                  percent={percent}
                  height={32}
                  status={status}
                />
              </div>

              {/* 数量统计 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '8px 12px',
                  background: 'rgba(15, 23, 42, 0.03)',
                  borderRadius: 8,
                  border: '1px solid rgba(15, 23, 42, 0.06)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text type="secondary" style={{ fontSize: "var(--font-size-xs)" }}>
                    已完成
                  </Text>
                  <Text
                    strong
                    style={{
                      fontSize: "var(--font-size-lg)",
                      color: 'var(--color-success)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.done}
                  </Text>
                </div>
                <div
                  style={{
                    width: 1,
                    background: 'rgba(15, 23, 42, 0.08)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text type="secondary" style={{ fontSize: "var(--font-size-xs)" }}>
                    总数量
                  </Text>
                  <Text
                    strong
                    style={{
                      fontSize: "var(--font-size-lg)",
                      color: 'rgba(15, 23, 42, 0.65)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.total}
                  </Text>
                </div>
                <div
                  style={{
                    width: 1,
                    background: 'rgba(15, 23, 42, 0.08)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text type="secondary" style={{ fontSize: "var(--font-size-xs)" }}>
                    剩余
                  </Text>
                  <Text
                    strong
                    style={{
                      fontSize: "var(--font-size-lg)",
                      color: stat.remaining > 0 ? 'var(--color-warning)' : 'rgba(15, 23, 42, 0.45)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.remaining}
                  </Text>
                </div>
              </div>

              {/* 工序单价 */}
              {hasPrice && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.05), rgba(24, 144, 255, 0.02))',
                    borderRadius: 8,
                    border: '1px solid rgba(24, 144, 255, 0.15)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: 'rgba(15, 23, 42, 0.65)',
                      minWidth: 60,
                    }}
                  >
                    工序单价
                  </Text>
                  <InputNumber
                    size="middle"
                    min={0}
                    precision={2}
                    value={unitPrice}
                    disabled={!canEdit || frozen}
                    onChange={(value) => {
                      if (onPriceChange) {
                        onPriceChange(node.id, Number(value) || 0);
                      }
                    }}
                    prefix="¥"
                    style={{
                      flex: 1,
                      fontWeight: 600,
                    }}
                    styles={{
                      input: {
                        fontSize: "var(--font-size-base)",
                        fontWeight: 600,
                        color: '#1890ff',
                      },
                    }}
                  />
                </div>
              )}

              {/* 预估总价（如果有单价） */}
              {hasPrice && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 8,
                    borderTop: '1px dashed rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: "var(--font-size-xs)" }}>
                    预估总价
                  </Text>
                  <Text
                    strong
                    style={{
                      fontSize: "var(--font-size-md)",
                      color: '#f5222d',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ¥{(unitPrice * stat.total).toFixed(2)}
                  </Text>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 总计卡片 */}
      <Card
        size="small"
        style={{
          marginTop: 16,
          background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.08), rgba(24, 144, 255, 0.04))',
          border: '1px solid rgba(24, 144, 255, 0.2)',
          borderRadius: 12,
        }}
        styles={{
          body: {
            padding: 16,
          },
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 24,
          }}
        >
          {/* 总工序数 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: "var(--font-size-sm)" }}>
              总工序数
            </Text>
            <Text
              strong
              style={{
                fontSize: "var(--font-size-xxl)",
                color: '#1890ff',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {nodes.length}
            </Text>
          </div>

          {/* 已完成工序 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: "var(--font-size-sm)" }}>
              已完成工序
            </Text>
            <Text
              strong
              style={{
                fontSize: "var(--font-size-xxl)",
                color: '#52c41a',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {nodes.filter((n) => {
                const stat = nodeStats[n.name] || { percent: 0 };
                return stat.percent >= 100;
              }).length}
            </Text>
          </div>

          {/* 总单价 */}
          {nodes.some((n) => (Number(n.unitPrice) || 0) > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: "var(--font-size-sm)" }}>
                工序总单价
              </Text>
              <Text
                strong
                style={{
                  fontSize: "var(--font-size-xxl)",
                  color: '#f5222d',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ¥
                {nodes
                  .reduce((sum, n) => sum + (Number(n.unitPrice) || 0), 0)
                  .toFixed(2)}
              </Text>
            </div>
          )}

          {/* 预估总成本 */}
          {nodes.some((n) => (Number(n.unitPrice) || 0) > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: "var(--font-size-sm)" }}>
                预估总成本（{totalQty}件）
              </Text>
              <Text
                strong
                style={{
                  fontSize: "var(--font-size-xxl)",
                  color: '#ff4d4f',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ¥
                {nodes
                  .reduce((sum, n) => sum + (Number(n.unitPrice) || 0) * totalQty, 0)
                  .toFixed(2)}
              </Text>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default HorizontalProgressPriceView;
