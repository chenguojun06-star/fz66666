import React from 'react';
import type { FactoryCapacityItem } from '@/services/production/productionApi';

const FactoryCapacityCard: React.FC<{ stat: FactoryCapacityItem }> = ({ stat }) => (
  <div
    style={{
      marginTop: 8,
      padding: '6px 10px',
      background: 'var(--color-bg-container, var(--color-bg-container))',
      border: '1px solid var(--color-border, #e8e8e8)',
      borderRadius: 6,
      fontSize: 14,
      lineHeight: '20px',
      color: 'var(--color-text-secondary, #888)',
    }}
  >
    {stat.matchScore > 0 && (
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, color: stat.matchScore >= 70 ? 'var(--color-success)' : stat.matchScore >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
          推荐指数 {stat.matchScore}分
        </span>
        {stat.matchScore >= 70 && <span style={{ background: 'var(--status-success-bg)', color: 'var(--color-success)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid var(--status-success-border)' }}>推荐</span>}
        {stat.capacitySource === 'configured' && <span style={{ background: 'var(--status-warning-bg)', color: 'var(--color-warning)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid #ffd591' }}>配置产能</span>}
        {stat.capacitySource === 'none' && <span style={{ background: '#FFF1F0', color: 'var(--color-danger)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid #ffa39e' }}>无产能数据</span>}
      </div>
    )}
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <span>生产中 <b style={{ color: 'var(--color-text-primary)' }}>{stat.totalOrders}</b> 单</span>
      <span>共 <b style={{ color: 'var(--color-text-primary)' }}>{stat.totalQuantity?.toLocaleString() ?? 0}</b> 件</span>
      <span>
        货期完成率
        <b style={{ marginLeft: 4, color: stat.deliveryOnTimeRate < 0 ? '#888' : stat.deliveryOnTimeRate >= 80 ? 'var(--color-success)' : stat.deliveryOnTimeRate >= 60 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
          {stat.deliveryOnTimeRate < 0 ? '暂无' : `${stat.deliveryOnTimeRate}%`}
        </b>
      </span>
      {stat.atRiskCount > 0 ? <span style={{ color: 'var(--color-warning)' }}>高风险 <b>{stat.atRiskCount}</b> 单</span> : null}
      {stat.overdueCount > 0 ? <span style={{ color: 'var(--color-danger)' }}>逾期 <b>{stat.overdueCount}</b> 单</span> : null}
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border, #e8e8e8)' }}>
      <span>生产人数 <b style={{ color: 'var(--color-text-primary)' }}>{stat.activeWorkers}</b> 人</span>
      {stat.avgDailyOutput > 0 ? <span>日均产量 <b style={{ color: 'var(--color-info)' }}>{stat.avgDailyOutput}</b> 件/天{stat.capacitySource === 'configured' ? '（配置值）' : ''}</span> : null}
      {stat.estimatedCompletionDays > 0 ? (
        <span>
          预计
          <b style={{ marginInline: 4, color: stat.estimatedCompletionDays > 30 ? 'var(--color-danger)' : stat.estimatedCompletionDays > 15 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {stat.estimatedCompletionDays}
          </b>
          天可完工
        </span>
      ) : null}
      {stat.activeWorkers <= 0 && stat.avgDailyOutput <= 0 ? <span style={{ color: 'var(--color-text-quaternary)' }}>暂无产能数据（该车间近30天无扫码记录）</span> : null}
    </div>
  </div>
);

export default FactoryCapacityCard;
