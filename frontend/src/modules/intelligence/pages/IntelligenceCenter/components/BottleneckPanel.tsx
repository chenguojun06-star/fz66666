import React from 'react';
import { LiveDot } from './IntelligenceWidgets';
import { AutoScrollBox, BottleneckRow } from './OrderScrollPanel';
import CollapseChevron from '../CollapseChevron';

interface BottleneckPanelProps {
  factoryBottleneck: any[];
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const BottleneckPanel: React.FC<BottleneckPanelProps> = ({
  factoryBottleneck, collapsedPanels, toggleCollapse,
}) => {
  return (
    <div className="c-card c-breathe-cyan">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('bottleneck')}>
        <LiveDot size={7} color="#00e5ff" />
        工厂工序卡点
        <span className="c-card-badge cyan-badge">{factoryBottleneck.length} 家工厂</span>
        <span style={{ fontSize: 14, color: '#4a8aaa', letterSpacing: 0 }}>点击整行或订单号可直达 →</span>
        <CollapseChevron panelKey="bottleneck" collapsed={!!collapsedPanels['bottleneck']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['bottleneck'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        <AutoScrollBox className="c-orders-scroll">
          {factoryBottleneck.map(f => <BottleneckRow key={f.factoryName} item={f} />)}
          {!factoryBottleneck.length && <div className="c-empty">暂无在制订单</div>}
        </AutoScrollBox>
      </div>
    </div>
  );
};

export default BottleneckPanel;
