import React from 'react';
import type { ReportPreviewData } from './types';
import styles from './ReportPreviewCardWidget.module.css';

interface Props {
  data: ReportPreviewData;
}

const ReportPreviewCardWidget: React.FC<Props> = ({ data }) => {
  const changeClass = (change: string | null): string => {
    if (!change) return styles.kpiChangeFlat;
    if (change.startsWith('+') && change !== '+0.0%') return styles.kpiChangeUp;
    if (change.startsWith('-')) return styles.kpiChangeDown;
    return styles.kpiChangeFlat;
  };

  const rankBadgeClass = (rank: number): string => {
    if (rank === 1) return `${styles.rankBadge} ${styles.rankBadge1}`;
    if (rank === 2) return `${styles.rankBadge} ${styles.rankBadge2}`;
    if (rank === 3) return `${styles.rankBadge} ${styles.rankBadge3}`;
    return styles.rankBadge;
  };

  return (
    <div className={styles.reportWrapper}>
      {/* Header */}
      <div className={styles.reportHeader}>
        <div className={styles.reportTitle}>
          📊 运营{data.typeLabel}看板
        </div>
        <div className={styles.reportMeta}>
          周期：{data.rangeLabel} · 范围：{data.scope}
        </div>
      </div>

      {/* KPI */}
      <div className={styles.reportSection}>
        <div className={styles.sectionTitle}>📈 核心指标</div>
        <div className={styles.kpiGrid}>
          {data.kpis.map((kpi, i) => (
            <div key={i} className={styles.kpiCard}>
              <div className={styles.kpiName}>{kpi.name}</div>
              <div className={styles.kpiValue}>
                {kpi.current.toLocaleString()}
                <span className={styles.kpiUnit}>{kpi.unit}</span>
              </div>
              {kpi.change && (
                <div className={`${styles.kpiChange} ${changeClass(kpi.change)}`}>
                  环比 {kpi.change}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 扫码类型分布 */}
      {data.scanTypes.length > 0 && data.scanTypes.some(s => s.count > 0) && (
        <div className={styles.reportSection}>
          <div className={styles.sectionTitle}>🔍 扫码类型分布</div>
          <div className={styles.distRow}>
            {data.scanTypes.map((s, i) => (
              <div key={i} className={styles.distChip}>
                {s.name} <strong>{s.count}</strong> 次（{s.percent}%）
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 工厂排名 */}
      {data.factoryRanking.length > 0 && (
        <div className={styles.reportSection}>
          <div className={styles.sectionTitle}>🏭 工厂排名 Top {data.factoryRanking.length}</div>
          <div className={styles.rankList}>
            {data.factoryRanking.map(f => (
              <div key={f.rank} className={styles.rankItem}>
                <span className={rankBadgeClass(f.rank)}>{f.rank}</span>
                <span className={styles.rankName}>{f.name || '未命名'}</span>
                <span className={styles.rankMeta}>
                  {f.scanCount} 次 / {f.scanQty} 件
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 风险概览 */}
      <div className={styles.reportSection}>
        <div className={styles.sectionTitle}>⚠️ 风险概览</div>
        <div className={styles.riskGrid}>
          <div className={`${styles.riskChip} ${styles.riskChipDanger}`}>
            <div className={styles.riskValue}>{data.riskSummary.overdueCount}</div>
            <div className={styles.riskLabel}>逾期订单</div>
          </div>
          <div className={styles.riskChip}>
            <div className={styles.riskValue}>{data.riskSummary.highRiskCount}</div>
            <div className={styles.riskLabel}>高风险</div>
          </div>
          <div className={styles.riskChip}>
            <div className={styles.riskValue}>{data.riskSummary.stagnantCount}</div>
            <div className={styles.riskLabel}>停滞订单</div>
          </div>
        </div>
      </div>

      {/* 逾期订单 Top 5 */}
      {data.overdueOrders.length > 0 && (
        <div className={styles.reportSection}>
          <div className={styles.sectionTitle}>🔴 逾期订单 Top {data.overdueOrders.length}</div>
          <div className={styles.orderList}>
            {data.overdueOrders.map((o, i) => (
              <div key={i} className={styles.orderItem}>
                <div>
                  <span className={styles.orderNo}>{o.orderNo}</span>
                  {o.styleName ? ` · ${o.styleName}` : ''}
                </div>
                <div className={styles.orderMeta}>
                  {o.factoryName || '—'} · {o.quantity} 件 · 进度 {o.progress}%
                  {o.plannedEndDate ? ` · 计划完成 ${o.plannedEndDate}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高风险订单 Top 5 */}
      {data.highRiskOrders.length > 0 && (
        <div className={styles.reportSection}>
          <div className={styles.sectionTitle}>🟡 高风险订单 Top {data.highRiskOrders.length}</div>
          <div className={styles.orderList}>
            {data.highRiskOrders.map((o, i) => (
              <div key={i} className={`${styles.orderItem} ${styles.highRisk}`}>
                <div>
                  <span className={styles.orderNo}>{o.orderNo}</span>
                  {o.styleName ? ` · ${o.styleName}` : ''}
                </div>
                <div className={styles.orderMeta}>
                  {o.factoryName || '—'} · {o.quantity} 件 · 进度 {o.progress}%
                  {o.plannedEndDate ? ` · 计划完成 ${o.plannedEndDate}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 成本汇总 */}
      <div className={styles.reportSection}>
        <div className={styles.sectionTitle}>💰 成本汇总</div>
        <div className={styles.distRow}>
          <div className={styles.distChip}>
            扫码总成本 <strong>¥ {data.costSummary.totalCost}</strong>
          </div>
          <div className={styles.distChip}>
            扫码记录 <strong>{data.costSummary.scanCount}</strong> 条
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPreviewCardWidget;
