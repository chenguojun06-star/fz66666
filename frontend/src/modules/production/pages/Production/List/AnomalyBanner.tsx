import React from 'react';
import { Alert } from 'antd';
import type { AnomalyItem } from '@/services/intelligence/intelligenceApi';

interface AnomalyBannerProps {
  visible: boolean;
  items: AnomalyItem[];
  onClose: () => void;
  onItemClick: (item: AnomalyItem) => void;
}

const TYPE_LABELS: Record<string, string> = {
  output_spike: '产量异常',
  quality_spike: '质量异常',
  idle_worker: '工人空闲',
  night_scan: '夜间扫码',
};

const AnomalyBanner: React.FC<AnomalyBannerProps> = ({ visible, items, onClose, onItemClick }) => {
  if (!visible || items.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <Alert
        type={items.some(i => i.severity === 'critical') ? 'error' : 'warning'}
        showIcon
        closable
        onClose={onClose}
        title={
          <span style={{ fontWeight: 600, fontSize: 13 }}>
             智能异常检测：发现 {items.length} 条异常
          </span>
        }
        description={
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {items.slice(0, 5).map((item, idx) => {
              const severityColor = item.severity === 'critical' ? '#ff4d4f' : '#fa8c16';
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onItemClick(item)}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  title="点击定位对应订单"
                >
                  <span style={{ color: severityColor, fontWeight: 700, minWidth: 60 }}>
                    [{TYPE_LABELS[item.type] ?? item.type}]
                  </span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)', minWidth: 80 }}>{item.targetName}</span>
                  <span>{item.description}</span>
                  {item.deviationRatio > 0 && (
                    <span style={{ color: severityColor, marginLeft: 4 }}>
                      偏差 {(item.deviationRatio * 100).toFixed(0)}%
                    </span>
                  )}
                </button>
              );
            })}
            {items.length > 5 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>…还有 {items.length - 5} 条，建议继续按异常项逐条处理</div>
            )}
          </div>
        }
      />
    </div>
  );
};

export default AnomalyBanner;
