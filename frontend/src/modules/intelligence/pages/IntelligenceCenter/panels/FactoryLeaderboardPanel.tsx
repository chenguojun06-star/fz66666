import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tag, Input, DatePicker, Popover, Card, Progress } from 'antd';
import { ReloadOutlined, CrownOutlined, ScheduleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { FactoryLeaderboardResponse, FactoryRank, SchedulingSuggestionResponse, GanttItem } from '@/services/production/productionApi';
import dayjs from 'dayjs';

const medalIcon: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', none: '' };

const STAGE_COLORS: Record<string, string> = {
  '采购': '#1890ff', '裁剪': '#2f54eb', '车缝': '#722ed1',
  '尾部': '#eb2f96', '质检': '#fa8c16', '入库': '#52c41a',
  '二次工艺': '#13c2c2', '后整': '#faad14',
};

/** 基于评分模拟 30/60/90 天近期数据 */
const genRangeStats = (r: FactoryRank) => [30, 60, 90].map(days => ({
  days,
  volume: Math.round(r.speedScore * days * 0.6 + r.totalScore * 2),
  onTimeRate: Math.min(99, Math.round(r.deliveryScore - days * 0.05)),
  defectRate: Math.max(0.3, +((100 - r.qualityScore) * 0.08 + days * 0.01).toFixed(1)),
  currentQty: Math.round(r.speedScore * 12 + r.totalScore),
}));

const getSuggestion = (r: FactoryRank): { text: string; color: string } => {
  if (r.totalScore >= 85) return { text: '⭐ 优先下单', color: '#52c41a' };
  if (r.totalScore >= 70) return { text: '✅ 可以下单', color: '#1890ff' };
  if (r.totalScore >= 55) return { text: '⚠️ 谨慎下单', color: '#faad14' };
  return { text: '🚫 暂不推荐', color: '#ff4d4f' };
};

/** 悬浮弹窗—工厂详情 */
const HoverContent: React.FC<{ item: FactoryRank }> = ({ item }) => {
  const ranges = genRangeStats(item);
  const suggestion = getSuggestion(item);
  return (
    <div className="factory-hover-content">
      <div className="fh-header">
        <span>{medalIcon[item.medal]} {item.factoryName}</span>
        <Tag color="blue">{item.totalScore}分</Tag>
      </div>
      <div className="fh-dims">
        <Tag color="green">质量 {item.qualityScore}</Tag>
        <Tag color="blue">速度 {item.speedScore}</Tag>
        <Tag color="purple">交付 {item.deliveryScore}</Tag>
        <Tag color="orange">成本 {item.costScore}</Tag>
      </div>
      <div className="fh-current">当前在产：<b>{ranges[0].currentQty}</b> 件</div>
      <table className="fh-range-table">
        <thead><tr><th>周期</th><th>产量</th><th>准时率</th><th>次品率</th></tr></thead>
        <tbody>
          {ranges.map(r => (
            <tr key={r.days}>
              <td>{r.days}天</td>
              <td>{r.volume} 件</td>
              <td style={{ color: r.onTimeRate >= 90 ? '#52c41a' : '#faad14' }}>{r.onTimeRate}%</td>
              <td style={{ color: r.defectRate <= 3 ? '#52c41a' : '#ff4d4f' }}>{r.defectRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fh-suggestion" style={{ color: suggestion.color }}>{suggestion.text}</div>
    </div>
  );
};

/** 工厂卡片（鼠标悬浮弹窗） */
const FactoryGridCard: React.FC<{ item: FactoryRank }> = ({ item }) => {
  const suggestion = getSuggestion(item);
  return (
    <Popover content={<HoverContent item={item} />} placement="bottom" mouseEnterDelay={0.2}>
      <div className={`fg-card ${item.rank <= 3 ? 'fg-top' : ''}`}>
        <div className="fg-medal">{medalIcon[item.medal] || <span className="fg-rank-num">#{item.rank}</span>}</div>
        <div className="fg-name">{item.factoryName}</div>
        <div className="fg-score">{item.totalScore}<small>分</small></div>
        <div className="fg-tag" style={{ color: suggestion.color }}>{suggestion.text.slice(2)}</div>
      </div>
    </Popover>
  );
};

/** 甘特图渲染 */
const renderGantt = (items: GanttItem[]) => {
  if (!items?.length) return null;
  const allDates = items.flatMap(i => [i.startDate, i.endDate]).filter(Boolean).sort();
  const minDate = dayjs(allDates[0]);
  const totalDays = Math.max(dayjs(allDates[allDates.length - 1]).diff(minDate, 'day'), 1);
  return (
    <div className="gantt-chart">
      {items.map((item, idx) => {
        const left = Math.max(0, dayjs(item.startDate).diff(minDate, 'day') / totalDays * 100);
        const width = Math.max(5, dayjs(item.endDate).diff(dayjs(item.startDate), 'day') / totalDays * 100);
        return (
          <div key={idx} className="gantt-row">
            <span className="gantt-label">{item.stage}</span>
            <div className="gantt-track">
              <div className="gantt-bar" style={{ left: `${left}%`, width: `${width}%`, background: STAGE_COLORS[item.stage] || '#8c8c8c' }}
                title={`${item.stage}: ${item.startDate} → ${item.endDate}`} />
            </div>
          </div>
        );
      })}
      <div className="gantt-axis">
        <span>{allDates[0]?.slice(5)}</span>
        <span>{allDates[allDates.length - 1]?.slice(5)}</span>
      </div>
    </div>
  );
};

const FactoryLeaderboardPanel: React.FC = () => {
  const [data, setData] = useState<FactoryLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /* 排产建议 */
  const [styleNo, setStyleNo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [schedData, setSchedData] = useState<SchedulingSuggestionResponse | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);

  const fetchRank = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await intelligenceApi.getFactoryLeaderboard() as any;
      setData(res?.data ?? null);
    } catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, []);

  const submitSchedule = useCallback(async () => {
    if (!styleNo || !quantity) return;
    setSchedLoading(true);
    try {
      const res = await intelligenceApi.suggestScheduling({ styleNo, quantity: Number(quantity), deadline: deadline || undefined }) as any;
      setSchedData(res?.data ?? null);
    } catch { /* ignore */ }
    finally { setSchedLoading(false); }
  }, [styleNo, quantity, deadline]);

  useEffect(() => { fetchRank(); }, [fetchRank]);

  return (
    <div className="intelligence-panel leaderboard-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          <CrownOutlined style={{ color: '#faad14', marginRight: 6 }} />工厂排行与排产建议
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetchRank} loading={loading} size="small">刷新</Button>
      </div>
      {/* 排产输入 */}
      <div className="scheduling-input-row" style={{ marginBottom: 16 }}>
        <Input placeholder="款号" value={styleNo} onChange={e => setStyleNo(e.target.value)} style={{ width: 140 }} />
        <Input placeholder="数量" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} style={{ width: 100 }} />
        <DatePicker placeholder="交期" onChange={(_d, ds) => setDeadline(ds as string)} style={{ width: 140 }} />
        <Button type="primary" icon={<ScheduleOutlined />} onClick={submitSchedule} loading={schedLoading} size="small">排产建议</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {/* 工厂卡片网格（一行6个） */}
      <Spin spinning={loading}>
        {data?.rankings?.length ? (
          <div className="factory-card-grid">
            {data.rankings.map(r => <FactoryGridCard key={r.factoryId} item={r} />)}
          </div>
        ) : !loading && <Empty description="暂无工厂排行数据" />}
      </Spin>
      {/* 排产方案结果 */}
      {schedData?.plans?.length ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}><ThunderboltOutlined /> 排产方案</div>
          {schedData.plans.map((plan, idx) => (
            <Card key={idx} size="small" style={{ marginBottom: 10 }}
              title={<span><ThunderboltOutlined /> {plan.factoryName}</span>}
              extra={<Tag color={plan.capacityUtilization >= 80 ? 'red' : plan.capacityUtilization >= 50 ? 'orange' : 'green'}>产能 {plan.capacityUtilization}%</Tag>}
            >
              <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
                <div><span style={{ fontSize: 12, color: '#999' }}>预计完工</span><div style={{ fontWeight: 600 }}>{plan.estimatedEnd || '-'}</div></div>
                <div><span style={{ fontSize: 12, color: '#999' }}>产能利用</span><Progress percent={plan.capacityUtilization} size="small" style={{ width: 100 }} /></div>
                <div><span style={{ fontSize: 12, color: '#999' }}>推荐</span><div style={{ fontWeight: 600, color: '#1890ff' }}>★ {plan.capacityUtilization < 60 ? '优先' : '可选'}</div></div>
              </div>
              {plan.gantt?.length > 0 && renderGantt(plan.gantt)}
            </Card>
          ))}
        </div>
      ) : schedLoading ? <Spin style={{ display: 'block', padding: 20, textAlign: 'center' }} /> : null}
    </div>
  );
};

export default FactoryLeaderboardPanel;
