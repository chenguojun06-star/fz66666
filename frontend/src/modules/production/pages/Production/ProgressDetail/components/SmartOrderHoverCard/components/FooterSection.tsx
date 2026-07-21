/**
 * SmartOrderHoverCard 底部区块
 *  - 智能进度分析（瓶颈/人员/资源/风险）
 *  - 跟单 + 备注
 */
import React from 'react';
import type { ProductionOrder } from '@/types/production';
import { renderProgressInsight } from '../../../utils/progressIntelligence';
import type { ProgressInsight } from '../../../utils/progressIntelligence';

interface Props {
  order: ProductionOrder;
  progressInsight: ProgressInsight | null;
}

const FooterSection: React.FC<Props> = ({ order, progressInsight }) => (
  <>
    {/*  智能进度分析 */}
    {progressInsight && renderProgressInsight(progressInsight)}

    {/* 跟单 + 备注 */}
    {(order.merchandiser || (order as any).operationRemark) && (
      <div style={{
        borderTop: '1px solid var(--color-bg-subtle)', marginTop: 7, paddingTop: 6,
        display: 'flex', gap: 10, flexWrap: 'wrap',
      }}>
        {order.merchandiser && (
          <span>
            <span style={{ color: 'var(--color-text-quaternary)' }}>跟单 </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{order.merchandiser}</span>
          </span>
        )}
        {(order as any).operationRemark && (
          <span style={{
            color: '#d46b08', background: 'rgba(250,173,20,0.1)',
            padding: '1px 5px', borderRadius: 3,
          }}>
            {(order as any).operationRemark}
          </span>
        )}
      </div>
    )}
  </>
);

export default React.memo(FooterSection);
