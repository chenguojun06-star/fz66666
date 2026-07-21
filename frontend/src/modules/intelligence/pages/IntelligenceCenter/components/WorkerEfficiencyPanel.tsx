import React from 'react';
import { LiveDot } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

interface WorkerEfficiencyPanelProps {
  workers: any;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const WorkerEfficiencyPanel: React.FC<WorkerEfficiencyPanelProps> = ({
  workers, collapsedPanels, toggleCollapse,
}) => {
  return (
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('workers')}>
        <LiveDot size={7} />
        人效实时动态
        <CollapseChevron panelKey="workers" collapsed={!!collapsedPanels['workers']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['workers'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        <table className="c-table">
          <thead>
            <tr><th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th>评级</th></tr>
          </thead>
          <tbody>
            {workers?.workers?.slice(0, 7).map((w: any) => (
              <tr key={w.workerName ?? w.workerId}>
                <td>{w.workerName}</td>
                <td style={{ color: w.speedScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.speedScore}</td>
                <td style={{ color: w.qualityScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.qualityScore}</td>
                <td>{w.stabilityScore}</td>
                <td>{w.versatilityScore}</td>
                <td>{w.attendanceScore}</td>
                <td><b style={{ color: '#00e5ff' }}>{w.overallScore}</b></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {(() => {
                    const grd = w.overallScore >= 85 ? { g: 'A', c: '#39ff14' }
                      : w.overallScore >= 70 ? { g: 'B', c: '#00e5ff' }
                      : w.overallScore >= 55 ? { g: 'C', c: '#f7a600' }
                      : { g: 'D', c: '#e03030' };
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <b style={{ color: grd.c, border: `1px solid ${grd.c}55`, padding: '0 3px', borderRadius: 3, fontSize: 14 }}>{grd.g}</b>
                        {w.trend === 'UP' ? '' : w.trend === 'DOWN' ? '' : ''}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            )) ?? <tr><td colSpan={8} className="c-empty-td">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkerEfficiencyPanel;
