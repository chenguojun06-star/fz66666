import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tag } from 'antd';
import { ReloadOutlined, TrophyOutlined, CrownOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { FactoryLeaderboardResponse, FactoryRank } from '@/services/production/productionApi';

const medalIcon: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', none: '' };

const DimBar: React.FC<{ value: number; color: string; label: string }> = ({ value, color, label }) => (
  <div className="dim-bar-row">
    <span className="dim-bar-label">{label}</span>
    <div className="dim-bar-track">
      <div className="dim-bar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
    <span className="dim-bar-value">{value}</span>
  </div>
);

const FactoryCard: React.FC<{ item: FactoryRank }> = ({ item }) => (
  <div className={`factory-rank-card ${item.rank <= 3 ? 'top-rank' : ''}`}>
    <div className="rank-badge">
      {item.medal !== 'none' ? <span style={{ fontSize: 28 }}>{medalIcon[item.medal]}</span> : (
        <span className="rank-number">{item.rank}</span>
      )}
    </div>
    <div className="rank-body">
      <div className="rank-header">
        <span className="rank-factory-name">{item.factoryName}</span>
        <span className="rank-total-score">{item.totalScore}<small>分</small></span>
      </div>
      <div className="rank-dims">
        <DimBar value={item.qualityScore} color="#52c41a" label="质量" />
        <DimBar value={item.speedScore} color="#1677ff" label="速度" />
        <DimBar value={item.deliveryScore} color="#722ed1" label="交付" />
        <DimBar value={item.costScore} color="#fa8c16" label="成本" />
      </div>
    </div>
  </div>
);

const FactoryLeaderboardPanel: React.FC = () => {
  const [data, setData] = useState<FactoryLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getFactoryLeaderboard() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          <CrownOutlined style={{ color: '#faad14', marginRight: 6 }} />
          工厂绩效排行榜
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {/* 前三名领奖台 */}
      {data?.rankings && data.rankings.length >= 3 && (
        <div className="leaderboard-podium">
          {[1, 0, 2].map(idx => {
            const r = data.rankings[idx];
            if (!r) return null;
            return (
              <div key={r.factoryId} className={`podium-stand rank-${idx + 1}`}>
                <span style={{ fontSize: 32 }}>{medalIcon[r.medal] || ''}</span>
                <div className="podium-factory">{r.factoryName}</div>
                <div className="podium-score">{r.totalScore}分</div>
                <div className={`podium-pillar h-${idx + 1}`} />
              </div>
            );
          })}
        </div>
      )}

      <Spin spinning={loading}>
        {data?.rankings?.length ? (
          <div className="factory-rank-list">
            {data.rankings.map(r => <FactoryCard key={r.factoryId} item={r} />)}
          </div>
        ) : !loading && <Empty description="暂无排行数据" />}
      </Spin>
    </div>
  );
};

export default FactoryLeaderboardPanel;
