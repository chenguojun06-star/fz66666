import React from 'react';
import styles from './OverdueFactoryCardWidget.module.css';

export interface OverdueFactoryOrder {
  orderNo: string;
  styleNo?: string;
  progress: number;
  overdueDays: number;
  quantity: number;
  plannedEndDate?: string;
}

export interface OverdueFactoryGroup {
  factoryName: string;
  totalOrders: number;
  totalQuantity: number;
  avgProgress: number;
  avgOverdueDays: number;
  activeWorkers: number;
  estimatedCompletionDays: number;
  orders: OverdueFactoryOrder[];
}

export interface OverdueFactoryCardData {
  overdueCount: number;
  totalQuantity: number;
  avgProgress: number;
  avgOverdueDays: number;
  factoryGroupCount: number;
  factoryGroups: OverdueFactoryGroup[];
}

const ProgressRing: React.FC<{ percent: number; size?: number; danger?: boolean }> = ({
  percent,
  size = 40,
  danger = false,
}) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(Math.max(percent, 0), 100) / 100) * circ;
  const color = danger ? '#ff7875' : percent >= 70 ? '#52c41a' : percent >= 40 ? '#faad14' : '#ff7875';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
};

const StatChip: React.FC<{ label: string; value: string | number; unit?: string; highlight?: boolean }> = ({
  label, value, unit, highlight,
}) => (
  <div className={`${styles.overdueStatChip} ${highlight ? styles.overdueStatChipHighlight : ''}`}>
    <div className={styles.overdueStatValue}>{value}<span className={styles.overdueStatUnit}>{unit || ''}</span></div>
    <div className={styles.overdueStatLabel}>{label}</div>
  </div>
);

const OverdueFactoryCardWidget: React.FC<{
  data: OverdueFactoryCardData;
  onNavigate: (path: string) => void;
}> = ({ data, onNavigate }) => {
  if (!data || !data.factoryGroups?.length) return null;

  return (
    <div className={styles.overdueCardWrapper}>
      <div className={styles.overdueSummaryBar}>
        <div className={styles.overdueSummaryTitle}>
          <span className={styles.overdueAlertDot} />
          逾期订单总览
        </div>
        <div className={styles.overdueSummaryStats}>
          <StatChip label="逾期订单" value={data.overdueCount} unit="张" highlight />
          <StatChip label="总件数" value={data.totalQuantity} unit="件" />
          <StatChip label="平均进度" value={data.avgProgress} unit="%" />
          <StatChip label="平均延期" value={data.avgOverdueDays} unit="天" highlight />
          <StatChip label="涉及工厂" value={data.factoryGroupCount} unit="家" />
        </div>
      </div>

      {data.factoryGroups.map((factory, fi) => (
        <div key={`factory-${fi}`} className={styles.overdueFactoryCard}>
          <div className={styles.overdueFactoryHeader}>
            <div className={styles.overdueFactoryName}>
              <span className={styles.overdueFactoryIcon}>🏭</span>
              {factory.factoryName}
            </div>
            <div className={styles.overdueFactoryBadge}>
              {factory.totalOrders}张订单 · {factory.totalQuantity}件
            </div>
          </div>

          <div className={styles.overdueFactoryMetrics}>
            <div className={styles.overdueMetricRing}>
              <ProgressRing percent={factory.avgProgress} size={48} danger={factory.avgProgress < 50} />
              <div className={styles.overdueMetricRingLabel}>
                <span className={styles.overdueMetricRingValue}>{factory.avgProgress}</span>
                <span className={styles.overdueMetricRingUnit}>%</span>
              </div>
            </div>
            <div className={styles.overdueMetricItems}>
              <div className={styles.overdueMetricItem}>
                <span className={styles.overdueMetricLabel}>平均延期</span>
                <span className={`${styles.overdueMetricValue} ${factory.avgOverdueDays > 7 ? styles.overdueMetricDanger : ''}`}>
                  {factory.avgOverdueDays}天
                </span>
              </div>
              <div className={styles.overdueMetricItem}>
                <span className={styles.overdueMetricLabel}>预计完成</span>
                <span className={styles.overdueMetricValue}>
                  {factory.estimatedCompletionDays > 0 ? `${factory.estimatedCompletionDays}天` : '—'}
                </span>
              </div>
              <div className={styles.overdueMetricItem}>
                <span className={styles.overdueMetricLabel}>生产人数</span>
                <span className={styles.overdueMetricValue}>{factory.activeWorkers != null ? factory.activeWorkers : '—'}人</span>
              </div>
            </div>
          </div>

          <div className={styles.overdueOrderList}>
            {factory.orders.map((order, oi) => (
              <div
                key={`order-${fi}-${oi}`}
                className={styles.overdueOrderItem}
                onClick={() => onNavigate(`/production?orderNo=${encodeURIComponent(order.orderNo)}`)}
              >
                <div className={styles.overdueOrderLeft}>
                  <span
                    className={styles.overdueOrderNo}
                    data-orderno={order.orderNo}
                  >
                    {order.orderNo}
                  </span>
                  {order.styleNo && <span className={styles.overdueOrderStyle}>{order.styleNo}</span>}
                </div>
                <div className={styles.overdueOrderRight}>
                  <span className={`${styles.overdueOrderProgress} ${order.progress < 50 ? styles.overdueOrderDanger : ''}`}>
                    {order.progress}%
                  </span>
                  <span className={styles.overdueOrderDays}>
                    延{order.overdueDays}天
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OverdueFactoryCardWidget;
