import React from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import { LiveDot, Sparkline } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';
import LiveScanFeed from '../LiveScanFeed';

interface PulsePanelProps {
  pulse: any;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
  isLowEnd: boolean;
  minFactorySilentMinutes: number | null;
}

const PulsePanel: React.FC<PulsePanelProps> = ({
  pulse, collapsedPanels, toggleCollapse, isLowEnd, minFactorySilentMinutes,
}) => {
  return (
    <div className="c-card c-scanline-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('pulse')}>
        <LiveDot />
        实时生产脉搏
        <span className="c-card-badge cyan-badge">{pulse?.scanRatePerHour ?? 0} 件/时</span>
        <CollapseChevron panelKey="pulse" collapsed={!!collapsedPanels['pulse']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['pulse'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
        <div style={{ margin: '6px 0 4px' }}>
          {!isLowEnd && <Sparkline pts={(pulse?.timeline ?? []).map((p: any) => Number(p.quantity) || 0)} color="#00e5ff" width={340} height={52} />}
          {!isLowEnd && <div className="c-sparkline-label">
            {(pulse?.timeline ?? []).map((p: any, i: number) => <span key={i}>{p.time.slice(-5)}</span>)}
          </div>}
        </div>
        {(pulse?.factoryActivity?.length ?? 0) > 0 ? (
          <div className="c-factory-activity-list">
            {pulse!.factoryActivity.map((f: any) => {
              const mins = f.minutesSinceLastScan;
              const timeStr = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.floor(mins/60)}h${mins%60}m前`;
              return (
                <div key={f.factoryName} className={`c-factory-activity-row${f.active ? '' : ' inactive'}`}>
                  <span className="c-fa-dot" style={{ background: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e03030' }} />
                  <span className="c-fa-name">{f.factoryName}</span>
                  <span className="c-fa-time" style={{ color: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e03030' }}>{timeStr}</span>
                  <span className="c-fa-qty">{f.todayQty.toLocaleString()}<em>件</em></span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="c-all-ok">
            <CheckCircleOutlined style={{ marginRight: 6 }} />
            今日暂无扫码记录
          </div>
        )}
        <LiveScanFeed
          minMinutesSinceLastScan={minFactorySilentMinutes}
          currentScanRatePerHour={Number(pulse?.scanRatePerHour) || 0}
        />
      </div>
    </div>
  );
};

export default PulsePanel;
