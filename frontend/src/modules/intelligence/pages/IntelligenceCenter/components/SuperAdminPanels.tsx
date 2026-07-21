import React, { lazy, Suspense } from 'react';
import CollapseChevron from '../CollapseChevron';

const AgentGraphPanel = lazy(() => import('../../../components/AgentGraphPanel'));
const ABTestStatsPanel = lazy(() => import('../../../components/ABTestStatsPanel'));

interface SuperAdminPanelsProps {
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const SuperAdminPanels: React.FC<SuperAdminPanelsProps> = ({ collapsedPanels, toggleCollapse }) => {
  return (
    <>
      <div style={{ padding: '0 24px 4px' }}>
        <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('graphmas')}>
          <span style={{ fontSize: 14, color: '#c084fc', fontWeight: 600 }}> 多代理图分析（Graph MAS）</span>
          <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(192,132,252,0.15)', color: '#c084fc' }}>
            Plan · Act · Reflect v4.0
          </span>
          <CollapseChevron panelKey="graphmas" collapsed={!!collapsedPanels['graphmas']} />
        </div>
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['graphmas'] ? 0 : 600, transition: 'max-height 0.3s ease' }}>
        <div style={{ padding: '0 24px 20px' }}>
          <Suspense fallback={<div style={{ padding: 16, textAlign: 'center', color: '#888' }}>加载中…</div>}>
            <AgentGraphPanel />
          </Suspense>
        </div>
      </div>

      <div style={{ padding: '0 24px 4px' }}>
        <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('abtest')}>
          <span style={{ fontSize: 14, color: 'var(--color-accent-sky)', fontWeight: 600 }}> A/B 测试统计</span>
          <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(56,189,248,0.15)', color: 'var(--color-accent-sky)' }}>
            Scene Comparison
          </span>
          <CollapseChevron panelKey="abtest" collapsed={!!collapsedPanels['abtest']} />
        </div>
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['abtest'] ? 0 : 400, transition: 'max-height 0.3s ease' }}>
        <div style={{ padding: '0 24px 20px' }}>
          <Suspense fallback={<div style={{ padding: 16, textAlign: 'center', color: '#888' }}>加载中…</div>}>
            <ABTestStatsPanel />
          </Suspense>
        </div>
      </div>
    </>
  );
};

export default SuperAdminPanels;
