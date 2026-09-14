import React from 'react';
import { Button, Card, Tooltip } from 'antd';
import type { FactoryRank } from '@/services/intelligence/intelligenceApi';
import { getLeaderboardScoreColor } from '../chartConfigs';

interface Props {
  leaderboard: FactoryRank[];
  lbLoading: boolean;
  lbCollapsed: boolean;
  onToggleCollapse: () => void;
}

const FactoryLeaderboard: React.FC<Props> = ({ leaderboard, lbLoading, lbCollapsed, onToggleCollapse }) => {
  if (leaderboard.length === 0) return null;

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}
      loading={lbLoading}
      title={<span className="u-fs-14 u-fw-600">工厂绩效榜</span>}
      extra={
        <Button type="link" onClick={onToggleCollapse} style={{ padding: 0 }}>
          {lbCollapsed ? '展开' : '收起'}
        </Button>
      }
    >
      {!lbCollapsed && (
        <div className="u-d-flex u-fwrap-wrap u-gap-8">
          {leaderboard.map((r) => {
            const scoreColor = getLeaderboardScoreColor(r.totalScore);
            return (
              <div key={r.factoryId} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 6,
                background: 'var(--color-fill-tertiary)',
                border: '1px solid var(--color-border-secondary)',
                minWidth: 190,
              }}>
                <span className="u-fs-13">{r.medal || `#${r.rank}`}</span>
                <span className="u-fw-600 u-fs-14 u-flex-1 u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>
                  {r.factoryName}
                </span>
                <Tooltip title={`质量${r.qualityScore} · 速度${r.speedScore} · 交期${r.deliveryScore} · 成本${r.costScore}`}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{r.totalScore}</span>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default FactoryLeaderboard;
