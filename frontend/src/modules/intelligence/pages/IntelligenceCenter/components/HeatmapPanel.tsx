import React from 'react';
import { Tooltip } from 'antd';
import { LiveDot } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

interface HeatmapPanelProps {
  heatmap: any;
  heatmapCellMap: Map<string, any>;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
  isLowEnd: boolean;
}

const HeatmapPanel: React.FC<HeatmapPanelProps> = ({
  heatmap, heatmapCellMap, collapsedPanels, toggleCollapse, isLowEnd,
}) => {
  return (
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('heatmap')}>
        <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#e03030' : '#39ff14'} />
        质量缺陷热力图
        {heatmap && (
          <span className="c-card-badge red-badge">
            总缺陷 {heatmap.totalDefects}
          </span>
        )}
        <CollapseChevron panelKey="heatmap" collapsed={!!collapsedPanels['heatmap']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['heatmap'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        {heatmap?.cells?.length ? (
          <>
            <div className="c-heatmap-meta">
              风险工序：<b style={{ color: '#e03030' }}>{heatmap.worstProcess}</b>
              &nbsp;·&nbsp;风险工厂：<b style={{ color: '#e03030' }}>{heatmap.worstFactory}</b>
            </div>
            {!isLowEnd && <div className="c-heatmap-grid" style={{ gridTemplateColumns: `52px repeat(${(heatmap.factories || []).length}, 1fr)` }}>
              <div />
              {(heatmap.factories || []).map((f: string) => (
                <Tooltip key={f} title={f} placement="top">
                  <div className="c-heat-head">{f}</div>
                </Tooltip>
              ))}
              {(heatmap.processes || []).map((proc: string) => (
                <React.Fragment key={proc}>
                  <div className="c-heat-row-label">{proc}</div>
                  {(heatmap.factories || []).map((fac: string) => {
                    const cell = heatmapCellMap.get(`${proc}|${fac}`);
                    const alpha = cell ? Math.min(cell.intensity, 0.9) : 0;
                    return (
                      <div key={fac} className="c-heat-cell"
                        style={{ background: `rgba(224,48,48,${alpha})`, color: alpha > 0.45 ? 'var(--color-bg-base)' : '#aaa' }}>
                        {cell?.defectCount || ''}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>}
            {isLowEnd && <div style={{ fontSize: 14, color: '#7aaec8', padding: '8px 0' }}>
              共 {heatmap.totalDefects} 个缺陷，涉及 {(heatmap.processes || []).length} 个工序、{(heatmap.factories || []).length} 个工厂
            </div>}
          </>
        ) : <div className="c-empty">暂无缺陷数据</div>}
      </div>
    </div>
  );
};

export default HeatmapPanel;
