import React from 'react';
import { LiveDot, AnimatedNum, medalColor } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

interface RankingPanelProps {
  ranking: any;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const RankingPanel: React.FC<RankingPanelProps> = ({
  ranking, collapsedPanels, toggleCollapse,
}) => {
  return (
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('ranking')}>
        <LiveDot size={7} color="#ffd700" />
        工厂绩效排行榜
        <span className="c-card-badge purple-badge">实时评分</span>
        <CollapseChevron panelKey="ranking" collapsed={!!collapsedPanels['ranking']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['ranking'] ? 0 : 500, transition: 'max-height 0.28s ease' }}>
        {ranking?.rankings?.length ? (
          ranking.rankings.slice(0, 5).map((r: any, i: number) => (
            <div key={r.factoryId} className="c-rank-row">
              <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#7a8999' }}>
                {i < 3 ? ['','',''][i] : `#${r.rank}`}
              </span>
              <span className="c-rank-name">{r.factoryName}</span>
              <div className="c-rank-bar-wrap">
                <div className="c-rank-bar" style={{ width: `${r.totalScore}%`, background: i === 0 ? 'linear-gradient(90deg,#ffd700,#f7a600)' : 'linear-gradient(90deg,#00e5ff,#0098aa)' }} />
              </div>
              <span className="c-rank-score"><AnimatedNum val={r.totalScore} /></span>
            </div>
          ))
        ) : <div className="c-empty">暂无排行数据</div>}
      </div>
    </div>
  );
};

export default RankingPanel;
