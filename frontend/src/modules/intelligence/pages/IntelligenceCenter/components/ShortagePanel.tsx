import React from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import { risk2color, LiveDot } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

interface ShortagePanelProps {
  shortage: any;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const ShortagePanel: React.FC<ShortagePanelProps> = ({
  shortage, collapsedPanels, toggleCollapse,
}) => {
  return (
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('shortage')}>
        <LiveDot color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
        面料 &amp; 辅料缺口预警
        <CollapseChevron panelKey="shortage" collapsed={!!collapsedPanels['shortage']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['shortage'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        {shortage?.shortageItems?.length ? (
          shortage.shortageItems.slice(0, 6).map((item: any, idx: number) => (
            <div key={`${item.materialCode}-${idx}`} className="c-shortage-row">
              <span className="c-shortage-risk" style={{ color: risk2color(item.riskLevel), borderColor: risk2color(item.riskLevel) }}>
                {item.riskLevel}
              </span>
              <span className="c-shortage-name">{item.materialName}</span>
              <span className="c-shortage-qty">缺&nbsp;{item.shortageQuantity}&nbsp;{item.unit}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 14, flexShrink: 0, fontWeight: 600,
                color: item.riskLevel === 'HIGH' ? '#e03030' : item.riskLevel === 'MEDIUM' ? '#f7a600' : '#39ff14',
              }}>
                {item.riskLevel === 'HIGH' ? ' 库存严重不足' : item.riskLevel === 'MEDIUM' ? '库存偏紧' : '适量补充'}
              </span>
            </div>
          ))
        ) : (
          <div className="c-all-ok">
            <CheckCircleOutlined style={{ marginRight: 6 }} />
            所有面辅料库存充足
          </div>
        )}
        {shortage?.summary && <div className="c-summary">{shortage.summary}</div>}
      </div>
    </div>
  );
};

export default ShortagePanel;
