/**
 * SmartOrderHoverCard 顶部区块
 *  - 款号 / 款名 / 平台 Tag / EC单号
 *  - 工厂名 / 交期标签
 */
import React from 'react';
import { Tag } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { getPlatformTag } from '@/utils/platform';

interface Props {
  order: ProductionOrder;
  deadline: { text: string; color: string } | null;
}

const HeaderSection: React.FC<Props> = ({ order, deadline }) => (
  <>
    {/* 顶部：款号 + 款名 + EC单号 */}
    {(order.styleNo || order.ecOrderNo) && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6, flexWrap: 'wrap',
      }}>
        {order.styleNo && (
          <span style={{
            fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-bg-subtle)',
            padding: '1px 7px', borderRadius: 10, fontWeight: 600,
          }}>
            款号 {order.styleNo}
          </span>
        )}
        {order.styleName && (
          <span className="u-fs-11 u-ov-hidden u-ws-nowrap" style={{ color: 'var(--color-text-muted)', maxWidth: 100, textOverflow: 'ellipsis' }}>
            {order.styleName}
          </span>
        )}
        {order.ecOrderNo && (
          <>
            {order.ecPlatform && (
              <Tag color={getPlatformTag(order.ecPlatform).color} style={{ margin: 0, fontSize: 12, padding: '0 6px', lineHeight: '16px', borderRadius: 10 }}>
                {getPlatformTag(order.ecPlatform).label}
              </Tag>
            )}
            <span style={{
              fontSize: 12, color: 'var(--color-primary)', background: 'var(--status-processing-bg)',
              padding: '1px 7px', borderRadius: 10, fontWeight: 600,
            }}>
              {order.ecOrderNo}
            </span>
          </>
        )}
      </div>
    )}

    {/* 工厂 + 交期 */}
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 8,
    }}>
      <span className="u-fw-600 u-fs-11" style={{ color: 'var(--color-text-secondary)' }}>
        {order.factoryName || '工序进度'}
      </span>
      {deadline && (
        <span style={{
          fontSize: 12, fontWeight: 700, color: deadline.color,
          background: deadline.color + '18', padding: '2px 8px', borderRadius: 10,
        }}>
          {deadline.text}
        </span>
      )}
    </div>
  </>
);

export default React.memo(HeaderSection);
