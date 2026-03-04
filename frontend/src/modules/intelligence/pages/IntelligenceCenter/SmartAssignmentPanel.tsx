import React, { useState, useCallback } from 'react';
import { Input, Button, Tag } from 'antd';
import { TeamOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { WorkerRecommendation } from '@/services/production/productionApi';

const levelColor: Record<string, string> = {
  excellent: '#39ff14',
  good: '#00e5ff',
  normal: '#f7a600',
};
const levelLabel: Record<string, string> = { excellent: '优秀', good: '良好', normal: '一般' };

/** 智能派工推荐面板 */
const SmartAssignmentPanel: React.FC = () => {
  const [stage, setStage] = useState('');
  const [qty, setQty]   = useState('');
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<WorkerRecommendation[]>([]);
  const [stageName, setStageName] = useState('');
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const s = stage.trim();
    if (!s) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.recommendAssignment({
        stageName: s,
        quantity: qty ? Number(qty) : undefined,
      }) as any;
      const d = res?.data ?? res;
      setRecs(d?.recommendations ?? []);
      setStageName(d?.stageName ?? s);
      if (!(d?.recommendations?.length)) setError('该工序暂无足够的历史扫码数据，无法生成推荐');
    } catch {
      setError('推荐失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [stage, qty]);

  const STAGES = ['裁剪', '车缝', '尾部', '质检', '入库', '采购'];

  return (
    <div className="c-card">
      <div className="c-card-title">
        <TeamOutlined style={{ marginRight: 6, color: '#a78bfa' }} />
        智能派工推荐
        <span className="c-card-badge" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderColor: '#a78bfa' }}>
          AI 综合评分
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6d8a' }}>
          输入工序名 → AI 推荐最佳工人
        </span>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#4a6d8a' }} />}
          placeholder="工序名，如：车缝"
          value={stage}
          onChange={e => setStage(e.target.value)}
          onPressEnter={handleSearch}
          style={{
            width: 160,
            background: 'rgba(167,139,250,0.06)',
            border: '1px solid rgba(167,139,250,0.25)',
            color: '#e2f0ff',
          }}
        />
        <Input
          placeholder="件数（可选）"
          value={qty}
          onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))}
          style={{
            width: 120,
            background: 'rgba(167,139,250,0.06)',
            border: '1px solid rgba(167,139,250,0.25)',
            color: '#e2f0ff',
          }}
        />
        <Button
          type="primary"
          loading={loading}
          onClick={handleSearch}
          style={{ background: 'rgba(167,139,250,0.2)', borderColor: 'rgba(167,139,250,0.5)', color: '#a78bfa' }}
        >
          推荐
        </Button>
      </div>

      {/* 快捷工序 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STAGES.map(s => (
          <button
            key={s}
            className="c-suggest-btn"
            style={{ borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa' }}
            onClick={() => { setStage(s); }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {!recs.length && !loading && !error && (
        <div className="c-empty">选择工序后点击推荐，AI 将综合历史效率给出最优人选</div>
      )}

      {recs.length > 0 && (
        <>
          <div style={{ color: '#4a6d8a', fontSize: 12, marginBottom: 8 }}>
            工序「<b style={{ color: '#a78bfa' }}>{stageName}</b>」推荐工人清单（按综合评分排序）
          </div>
          <table className="c-table">
            <thead>
              <tr><th>排名</th><th>工人</th><th>综合评分</th><th>日均产量</th><th>vs 均值</th><th>评级</th><th>推荐理由</th></tr>
            </thead>
            <tbody>
              {recs.slice(0, 8).map((r, i) => {
                const col = levelColor[r.level] ?? '#888';
                return (
                  <tr key={r.operatorName}>
                    <td style={{ color: i < 3 ? ['#ffd700', '#c0c0c0', '#cd7f32'][i] : '#4a6d8a', fontWeight: 700 }}>
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                    </td>
                    <td style={{ color: '#e2f0ff', fontWeight: 600 }}>{r.operatorName}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                          <div style={{ width: `${r.score}%`, height: '100%', background: col, borderRadius: 2 }} />
                        </div>
                        <b style={{ color: col }}>{r.score}</b>
                      </div>
                    </td>
                    <td style={{ color: '#00e5ff' }}>{r.avgPerDay} 件/天</td>
                    <td style={{ color: (r.vsAvgPct ?? 0) >= 0 ? '#39ff14' : '#ff4136' }}>
                      {(r.vsAvgPct ?? 0) >= 0 ? '+' : ''}{r.vsAvgPct}%
                    </td>
                    <td>
                      <Tag style={{ background: `${col}22`, color: col, borderColor: col, fontSize: 11 }}>
                        {levelLabel[r.level] ?? r.level}
                      </Tag>
                    </td>
                    <td style={{ color: '#4a6d8a', fontSize: 11, maxWidth: 180 }}>{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default SmartAssignmentPanel;
