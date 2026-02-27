/**
 * SmartMiniDashboard — 生产进度智能迷你看板
 * 显示：风险分布迷你卡片 + 智能文字摘要
 * 数据：从当前页 orders 实时计算，零 API 请求
 */
import React, { useMemo } from 'react';
import { Tooltip } from 'antd';
import {
  FireOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { ProductionOrder } from '@/types/production';
import { calcSmartPrediction } from '../utils/smartPredict';

interface GlobalStats {
  totalOrders: number;
  totalQuantity: number;
  delayedOrders: number;
  delayedQuantity: number;
  todayOrders: number;
  todayQuantity: number;
}

interface Props {
  orders: ProductionOrder[];
  globalStats: GlobalStats;
}

/* ── 迷你数字卡 ── */
interface MiniCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  bg: string;
  tooltip?: string;
}

const MiniCard: React.FC<MiniCardProps> = ({ icon, label, value, sub, color, bg, tooltip }) => (
  <Tooltip title={tooltip}>
    <div style={{
      flex: '1 1 0',
      minWidth: 100,
      background: bg,
      borderRadius: 10,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: tooltip ? 'help' : 'default',
      transition: 'transform 0.15s',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontSize: 16, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: color + 'aa', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  </Tooltip>
);

/* ── 智能文字摘要行 ── */
interface SummaryItem {
  text: string;
  color: string;
  icon: React.ReactNode;
}

const SummaryBar: React.FC<{ items: SummaryItem[] }> = ({ items }) => (
  <div style={{
    display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
    padding: '8px 14px',
    background: '#fafafa',
    borderRadius: 8,
    border: '1px solid #f0f0f0',
    marginTop: 10,
  }}>
    {items.map((item, i) => (
      <span key={i} style={{ fontSize: 12, color: item.color, display: 'flex', alignItems: 'center', gap: 4 }}>
        {item.icon} {item.text}
      </span>
    ))}
  </div>
);

/* ── 主组件 ── */
const SmartMiniDashboard: React.FC<Props> = ({ orders, globalStats }) => {
  const stats = useMemo(() => {
    let safe = 0, warning = 0, danger = 0, completed = 0, unknown = 0;
    let totalProgress = 0;
    let avgDailyRate = 0;
    let rateCount = 0;
    let fastestOrder: ProductionOrder | null = null;
    let fastestRate = 0;

    orders.forEach((o) => {
      const p = calcSmartPrediction({
        orderQuantity: o.orderQuantity,
        completedQuantity: o.completedQuantity || 0,
        productionProgress: o.productionProgress || 0,
        createTime: o.createTime,
        plannedEndDate: o.plannedEndDate,
        status: o.status,
      });

      if (p.risk === 'safe')      safe++;
      else if (p.risk === 'warning') warning++;
      else if (p.risk === 'danger')  danger++;
      else if (p.risk === 'completed') completed++;
      else unknown++;

      totalProgress += o.productionProgress || 0;

      if (p.dailyRate > 0) {
        avgDailyRate += p.dailyRate;
        rateCount++;
        if (p.dailyRate > fastestRate) {
          fastestRate = p.dailyRate;
          fastestOrder = o;
        }
      }
    });

    const avgProgress = orders.length > 0 ? Math.round(totalProgress / orders.length) : 0;
    const avgRate = rateCount > 0 ? Math.round((avgDailyRate / rateCount) * 10) / 10 : 0;

    return { safe, warning, danger, completed, unknown, avgProgress, avgRate, fastestOrder, fastestRate };
  }, [orders]);

  /* 文字摘要生成 */
  const summaryItems = useMemo((): SummaryItem[] => {
    const items: SummaryItem[] = [];
    const inProgress = orders.filter(o => o.status === 'production').length;

    if (inProgress > 0) {
      items.push({ text: `${inProgress} 个订单生产中`, color: '#1677ff', icon: <FireOutlined /> });
    }
    if (stats.safe > 0) {
      items.push({ text: `${stats.safe} 个预计准时完成`, color: '#52c41a', icon: <CheckCircleOutlined /> });
    }
    if (stats.warning > 0) {
      items.push({ text: `${stats.warning} 个需要跟进`, color: '#fa8c16', icon: <WarningOutlined /> });
    }
    if (stats.danger > 0) {
      items.push({ text: `${stats.danger} 个高危，需紧急处理`, color: '#ff4d4f', icon: <ThunderboltOutlined /> });
    }
    if (stats.avgRate > 0) {
      items.push({ text: `当前页平均 ${stats.avgRate} 件/天`, color: '#8c8c8c', icon: <RiseOutlined /> });
    }
    if (stats.fastestOrder) {
      items.push({
        text: `最快：${(stats.fastestOrder as ProductionOrder).orderNo} ${stats.fastestRate} 件/天`,
        color: '#52c41a',
        icon: <ClockCircleOutlined />,
      });
    }
    if (items.length === 0) {
      items.push({ text: '暂无生产中订单', color: '#8c8c8c', icon: <ClockCircleOutlined /> });
    }
    return items;
  }, [orders, stats]);

  if (orders.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* 迷你卡片行 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <MiniCard
          icon={<FireOutlined />}
          label="全部订单" value={globalStats.totalOrders}
          sub={`共 ${globalStats.totalQuantity} 件`}
          color="#1677ff" bg="#e6f4ff"
          tooltip="所有筛选范围内的订单总数"
        />
        <MiniCard
          icon={<CheckCircleOutlined />}
          label="当前页均进度" value={`${stats.avgProgress}%`}
          sub={stats.avgRate > 0 ? `${stats.avgRate} 件/天` : undefined}
          color="#52c41a" bg="#f6ffed"
          tooltip="当前页订单的平均生产进度"
        />
        <MiniCard
          icon={<WarningOutlined />}
          label="需跟进" value={stats.warning}
          sub="余量不足5天"
          color="#fa8c16" bg="#fff7e6"
          tooltip="预计完成日期距交期不足5天的订单"
        />
        <MiniCard
          icon={<ThunderboltOutlined />}
          label="高危预警" value={stats.danger}
          sub={globalStats.delayedOrders > 0 ? `含 ${globalStats.delayedOrders} 个已延期` : '预计延期'}
          color="#ff4d4f" bg="#fff2f0"
          tooltip="按当前速度预计会延期交货的订单"
        />
      </div>

      {/* 智能文字摘要 */}
      <SummaryBar items={summaryItems} />
    </div>
  );
};

export default SmartMiniDashboard;
