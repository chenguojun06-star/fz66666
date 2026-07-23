import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer, Spin, Empty, Tag, Table, Tooltip, Button, Alert } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  PreOrderDeliveryPredictionResponse,
  PreOrderTimelineNode,
  CapacityGapResponse,
  FactoryCapacityGap,
  FactoryActiveOrderDTO,
} from '@/services/intelligence/intelligenceTypes';

interface FactoryInsightDrawerProps {
  open: boolean;
  onClose: () => void;
  factoryName: string;
  orderQuantity: number;
  plannedDeadline?: string;
  styleNo?: string;
}

const RISK_COLOR: Record<string, string> = {
  safe: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
};

const GAP_LEVEL_META: Record<string, { color: string; label: string }> = {
  safe: { color: 'var(--color-success)', label: '产能充足' },
  tight: { color: 'var(--color-warning)', label: '产能紧张' },
  gap: { color: 'var(--color-danger)', label: '产能缺口' },
  critical: { color: 'var(--color-danger)', label: '严重缺口' },
};

const FactoryInsightDrawer: React.FC<FactoryInsightDrawerProps> = ({
  open,
  onClose,
  factoryName,
  orderQuantity,
  plannedDeadline,
  styleNo,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PreOrderDeliveryPredictionResponse | null>(null);
  const [gapList, setGapList] = useState<FactoryCapacityGap | null>(null);
  const [activeOrders, setActiveOrders] = useState<FactoryActiveOrderDTO[]>([]);

  // 用 ref 保存最新参数，避免 loadAll 依赖闭包过期 + 防抖控制
  const paramsRef = useRef({ factoryName, orderQuantity, styleNo, plannedDeadline });
  paramsRef.current = { factoryName, orderQuantity, styleNo, plannedDeadline };

  const loadAll = useCallback(async () => {
    const { factoryName: fn, orderQuantity: qty, styleNo: sn, plannedDeadline: dl } = paramsRef.current;
    if (!fn) return;
    setLoading(true);
    setError(null);
    try {
      const [predRes, gapRes, ordersRes] = await Promise.all([
        intelligenceApi.predictPreOrderDelivery({
          factoryName: fn,
          orderQuantity: qty,
          styleNo: sn,
          plannedDeadline: dl,
        }),
        intelligenceApi.getCapacityGap(),
        intelligenceApi.getFactoryActiveOrders(fn),
      ]);
      setPrediction(predRes.data ?? null);
      const gapResp: CapacityGapResponse | undefined = gapRes.data;
      setGapList(gapResp?.factories.find((f) => f.factoryName === fn) ?? null);
      setActiveOrders(ordersRes.data ?? []);
    } catch (e: any) {
      console.error('[FactoryInsightDrawer] load failed', e);
      setError(e?.message || '加载工厂动态失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载策略：
  // 1. open 从 false→true：立即加载
  // 2. factoryName 变化：立即加载
  // 3. orderQuantity/plannedDeadline 变化：防抖 600ms 重新加载（避免连续修改雪崩）
  const prevOpenRef = useRef(false);
  const prevFactoryRef = useRef(factoryName);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const openedNow = open && !prevOpenRef.current;
    const factoryChanged = open && prevFactoryRef.current !== factoryName;
    prevOpenRef.current = open;
    prevFactoryRef.current = factoryName;

    if (!open) return;
    if (!factoryName) return;

    if (openedNow || factoryChanged) {
      // 立即加载
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void loadAll();
      return;
    }

    // 参数变化防抖
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void loadAll();
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [open, factoryName, orderQuantity, plannedDeadline, loadAll]);

  const renderTimeline = (nodes: PreOrderTimelineNode[]) => {
    if (!nodes || nodes.length === 0) return <Empty description="无时间线数据" />;
    const sorted = [...nodes].sort((a, b) => a.daysFromToday - b.daysFromToday);
    return (
      <div style={{ position: 'relative', padding: '24px 12px 12px' }}>
        <div style={{ position: 'relative', height: 60 }}>
          <div style={{ position: 'absolute', top: 11, left: 12, right: 12, height: 2, background: 'var(--color-border, #e8e8e8)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {sorted.map((n) => {
              const color = RISK_COLOR[n.riskLevel] || 'var(--color-text-secondary)';
              return (
                <Tooltip key={n.type} title={`${n.label}: ${n.date}（${n.daysFromToday >= 0 ? '+' : ''}${n.daysFromToday}天）`}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid var(--color-bg-container, #fff)', boxShadow: `0 0 0 2px ${color}33` }} />
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {n.label}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color }}>
                      {n.daysFromToday >= 0 ? `+${n.daysFromToday}天` : `${n.daysFromToday}天`}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const orderColumns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 130, ellipsis: true },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110, ellipsis: true },
    { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 70 },
    {
      title: '进度', dataIndex: 'productionProgress', key: 'productionProgress', width: 90,
      render: (v: number) => v != null ? `${v}%` : '-',
    },
    {
      title: '交期', dataIndex: 'plannedEndDate', key: 'plannedEndDate', width: 110,
      render: (v: string) => v ? dayjs(v).format('MM-DD') : '-',
    },
    {
      title: '剩余天数', dataIndex: 'daysToDeadline', key: 'daysToDeadline', width: 80,
      render: (v: number) => {
        const color = v < 0 ? 'var(--color-danger)' : v <= 7 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
        return <span style={{ color, fontWeight: 600 }}>{v < 0 ? `逾期${-v}天` : `${v}天`}</span>;
      },
    },
    {
      title: '风险', dataIndex: 'riskLevel', key: 'riskLevel', width: 70,
      render: (v: string) => {
        const meta = { safe: { c: 'var(--color-success)', t: '正常' }, warning: { c: 'var(--color-warning)', t: '关注' }, danger: { c: 'var(--color-danger)', t: '高危' } }[v] || { c: 'var(--color-text-quaternary)', t: '-' };
        return <Tag style={{ color: meta.c, borderColor: meta.c, background: 'transparent' }}>{meta.t}</Tag>;
      },
    },
  ];

  return (
    <Drawer
      title={<span style={{ fontSize: 15, fontWeight: 600 }}>{factoryName} — 工厂全动态详情</span>}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
      extra={
        <Button size="small" type="default" icon={<ReloadOutlined />} onClick={loadAll} loading={loading} style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}>
          刷新
        </Button>
      }
    >
      <Spin spinning={loading}>
        {error && (
          <Alert
            type="error"
            message={error}
            action={<Button size="small" onClick={loadAll} loading={loading}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        {/* Section 1: 三档交期预测时间线 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>
            交期预测时间线
            {prediction?.confidence != null && (
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                置信度 {prediction.confidence}%
              </span>
            )}
          </div>
          {prediction ? (
            <>
              {renderTimeline(prediction.timelineNodes)}
              <div style={{ padding: '8px 12px', background: 'var(--color-bg-layout, #f5f5f5)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                {prediction.rationale}
              </div>
              {prediction.factoryDailyVelocity > 0 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  <span>工厂日均产能 <b style={{ color: 'var(--color-info)' }}>{prediction.factoryDailyVelocity}</b> 件/天</span>
                  <span>在手总负载 <b style={{ color: 'var(--color-text-primary)' }}>{prediction.factoryPendingQuantity}</b> 件（含本单 {orderQuantity}）</span>
                </div>
              )}
              {prediction.likelyDelayed && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)', borderRadius: 4, fontSize: 12, color: 'var(--color-danger)' }}>
                  预计延期：最可能完工日期晚于计划交期，建议调整交期或增加产能
                </div>
              )}
            </>
          ) : (
            <Empty description="暂无预测数据" />
          )}
        </div>

        {/* Section 2: 产能缺口分析 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>产能缺口分析</div>
          {gapList ? (
            <div style={{ padding: '10px 12px', background: 'var(--color-bg-layout, #f5f5f5)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Tag style={{
                  color: GAP_LEVEL_META[gapList.gapLevel]?.color,
                  borderColor: GAP_LEVEL_META[gapList.gapLevel]?.color,
                  background: 'transparent',
                  fontWeight: 600,
                }}>
                  {GAP_LEVEL_META[gapList.gapLevel]?.label || gapList.gapLevel}
                </Tag>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  在手 {gapList.pendingQuantity} 件 · 日产 {gapList.dailyCapacity} 件/天 · 预计 {gapList.estimatedDaysToComplete} 天
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>{gapList.advice}</div>
            </div>
          ) : (
            <Empty description="暂无缺口分析数据" />
          )}
        </div>

        {/* Section 3: 在产订单明细 */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>
            在产订单明细（{activeOrders.length} 单）
          </div>
          <Table
            dataSource={activeOrders}
            columns={orderColumns}
            rowKey="orderId"
            size="small"
            pagination={{ pageSize: 8, size: 'small' }}
            scroll={{ x: 660 }}
            locale={{ emptyText: <Empty description="该工厂暂无在产订单" /> }}
          />
        </div>
      </Spin>
    </Drawer>
  );
};

export default FactoryInsightDrawer;
