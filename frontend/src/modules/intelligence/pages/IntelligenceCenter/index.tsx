import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tag, Input, Button, Tooltip } from 'antd';
import {
  ThunderboltOutlined, SyncOutlined, RobotOutlined, SendOutlined,
  WarningOutlined, CheckCircleOutlined, DashboardOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type {
  LivePulseResponse, HealthIndexResponse, SmartNotificationResponse,
  WorkerEfficiencyResponse, DefectHeatmapResponse, FactoryLeaderboardResponse,
  MaterialShortageResult, SelfHealingResponse,
} from '@/services/production/productionApi';
import Layout from '@/components/Layout';
import './styles.css';

/* ═══════════════════════════════════════════════════
   工具函数 & 小组件
═══════════════════════════════════════════════════ */

const risk2color = (r: string) =>
  ({ HIGH: '#ff4136', MEDIUM: '#f7a600', LOW: '#39ff14' }[r] ?? '#39ff14');

const grade2color = (g: string) =>
  ({ A: '#39ff14', B: '#00e5ff', C: '#f7a600', D: '#ff4136' }[g] ?? '#888');

/** 实时绿色闪烁点 */
const LiveDot: React.FC<{ color?: string; size?: number }> = ({ color = '#39ff14', size = 8 }) => (
  <span className="live-dot" style={{ '--dot-color': color, '--dot-size': `${size}px` } as React.CSSProperties} />
);

/** 折线迷你图 */
const Sparkline: React.FC<{ pts: number[]; color?: string; width?: number; height?: number }> = ({
  pts, color = '#00e5ff', width = 160, height = 44,
}) => {
  if (!pts.length) return null;
  const max = Math.max(...pts, 1);
  const xs = pts.map((_, i) => (i / Math.max(pts.length - 1, 1)) * width);
  const ys = pts.map(v => height - (v / max) * (height - 4) - 2);
  const poly = pts.map((_, i) => `${xs[i]},${ys[i]}`).join(' ');
  const area = `${xs[0]},${height} ${poly} ${xs[xs.length - 1]},${height}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sg)" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r={i === pts.length - 1 ? 4 : 2.5}
          fill={color} opacity={i === pts.length - 1 ? 1 : 0.6} />
      ))}
    </svg>
  );
};

/* ─── 数据 hook ─── */
interface CockpitData {
  pulse:   LivePulseResponse | null;
  health:  HealthIndexResponse | null;
  notify:  SmartNotificationResponse | null;
  workers: WorkerEfficiencyResponse | null;
  heatmap: DefectHeatmapResponse | null;
  ranking: FactoryLeaderboardResponse | null;
  shortage: MaterialShortageResult | null;
  healing: SelfHealingResponse | null;
  loading: boolean;
}

function useCockpit() {
  const [data, setData] = useState<CockpitData>({
    pulse: null, health: null, notify: null, workers: null,
    heatmap: null, ranking: null, shortage: null, healing: null, loading: true,
  });
  const load = useCallback(async () => {
    setData(d => ({ ...d, loading: true }));
    const [rPulse, rHealth, rNotify, rWorkers, rHeatmap, rRanking, rShortage, rHealing] =
      await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.getHealthIndex(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getWorkerEfficiency(),
        intelligenceApi.getDefectHeatmap(), intelligenceApi.getFactoryLeaderboard(),
        intelligenceApi.getMaterialShortage(), intelligenceApi.runSelfHealing(),
      ]);
    const v = <T,>(r: PromiseSettledResult<{ code: number; data: T } | T>): T | null =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? (r.value as T)) : null;
    setData({
      pulse: v(rPulse), health: v(rHealth), notify: v(rNotify), workers: v(rWorkers),
      heatmap: v(rHeatmap), ranking: v(rRanking), shortage: v(rShortage), healing: v(rHealing),
      loading: false,
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, reload: load };
}

const medalColor = ['#ffd700', '#c0c0c0', '#cd7f32'];

/* ═══════════════════════════════════════════════════
   主页面组件
═══════════════════════════════════════════════════ */
const IntelligenceCenter: React.FC = () => {
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const [chatQ, setChatQ]           = useState('');
  const [chatA, setChatA]           = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* 秒计时：倒计时 + 时钟 */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNow(new Date());
      setCountdown(c => { if (c <= 1) { reload(); return 30; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reload]);

  const handleReload = () => { reload(); setCountdown(30); };
  const handleChat = async () => {
    if (!chatQ.trim()) return;
    setChatLoading(true); setChatA('');
    try {
      const res = await intelligenceApi.aiAdvisorChat(chatQ) as any;
      setChatA(res?.data?.answer || res?.answer || '暂无回复');
    } catch { setChatA('AI 服务暂不可用，请稍后重试。'); }
    finally { setChatLoading(false); }
  };

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing } = data;

  /* 派生警报数量 */
  const alertCount = (pulse?.stagnantFactories?.length ?? 0) + (shortage?.shortageItems?.length ?? 0);
  const healWarnCount = healing?.items?.filter(i => i.status !== 'OK' && !i.autoFixed).length ?? 0;
  const totalWarn = alertCount + healWarnCount + (notify?.pendingCount ?? 0);

  /* 格式化时钟 */
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });

  return (
    <Layout>
      <div className="cockpit-root">

        {/* ╔══════════════════════════════════════════════╗
            ║   顶栏  标题 · 时钟 · 系统状态 · 刷新      ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-header">
          {/* 左：LIVE + 标题 */}
          <div className="cockpit-header-left">
            <LiveDot size={10} />
            <span className="cockpit-badge-live">LIVE</span>
            <ThunderboltOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
            <span className="cockpit-title">智能运营驾驶舱</span>
            <span className="cockpit-subtitle">全链路实时指挥 · AI 决策引擎</span>
          </div>

          {/* 中：实时时钟 */}
          <div className="cockpit-clock">
            <span className="cockpit-time">{timeStr}</span>
            <span className="cockpit-date">{dateStr}</span>
          </div>

          {/* 右：告警数 + 系统状态 + 刷新 */}
          <div className="cockpit-header-right">
            {totalWarn > 0
              ? <span className="cockpit-alert-badge">
                  <WarningOutlined />
                  {totalWarn} 项预警
                </span>
              : <span className="cockpit-ok-badge">
                  <CheckCircleOutlined />
                  系统正常
                </span>
            }
            <Tooltip title={`${countdown}s 后自动刷新`}>
              <button className="cockpit-refresh-btn" onClick={handleReload} disabled={data.loading}>
                <SyncOutlined spin={data.loading} />
                {data.loading ? '加载中' : `${countdown}s`}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第一行：6 大核心 KPI 闪光数字卡            ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-6">

          {/* 今日生产扫码量 */}
          <div className="c-card c-kpi">
            <div className="c-kpi-label"><LiveDot size={7} />今日扫码量</div>
            <div className="c-kpi-val cyan neon-cyan">{pulse?.todayScanQty?.toLocaleString() ?? '—'}</div>
            <div className="c-kpi-unit">件</div>
            <div className="c-kpi-sub">速率&nbsp;<b style={{ color: '#00e5ff' }}>{pulse?.scanRatePerHour ?? '—'}</b>&nbsp;件/时</div>
          </div>

          {/* 活跃工厂 */}
          <div className="c-card c-kpi">
            <div className="c-kpi-label"><LiveDot size={7} />活跃工厂</div>
            <div className="c-kpi-val green neon-green">{pulse?.activeFactories ?? '—'}</div>
            <div className="c-kpi-unit">家</div>
            <div className="c-kpi-sub">员工&nbsp;<b style={{ color: '#39ff14' }}>{pulse?.activeWorkers ?? '—'}</b>&nbsp;人在线</div>
          </div>

          {/* 供应链健康 */}
          <div className="c-card c-kpi">
            <div className="c-kpi-label"><LiveDot size={7} color={grade2color(health?.grade ?? '')} />供应链健康</div>
            <div className="c-kpi-val" style={{ color: grade2color(health?.grade ?? ''), textShadow: `0 0 18px ${grade2color(health?.grade ?? '')}88` }}>
              {health?.healthIndex ?? '—'}
            </div>
            <div className="c-kpi-unit">分</div>
            <div className="c-kpi-sub">等级&nbsp;<b style={{ color: grade2color(health?.grade ?? '') }}>{health?.grade ?? '—'}&nbsp;级</b></div>
          </div>

          {/* 停工预警 */}
          <div className={`c-card c-kpi ${(pulse?.stagnantFactories?.length ?? 0) > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              停工预警
            </div>
            <div className="c-kpi-val" style={{ color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14' }}>
              {pulse?.stagnantFactories?.length ?? 0}
            </div>
            <div className="c-kpi-unit">家停滞</div>
            <div className="c-kpi-sub">
              {(pulse?.stagnantFactories?.length ?? 0) > 0
                ? <span className="blink-text">⚠️ 需立即处理</span>
                : '生产运转正常'}
            </div>
          </div>

          {/* 面料缺口 */}
          <div className={`c-card c-kpi ${(shortage?.shortageItems?.length ?? 0) > 0 ? 'c-kpi-warn' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料缺口
            </div>
            <div className="c-kpi-val" style={{ color: (shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14' }}>
              {shortage?.shortageItems?.length ?? 0}
            </div>
            <div className="c-kpi-unit">项缺料</div>
            <div className="c-kpi-sub">
              {(shortage?.shortageItems?.length ?? 0) > 0
                ? <span style={{ color: '#f7a600' }}>⚡ 请及时补单</span>
                : '库存储备充足'}
            </div>
          </div>

          {/* 待处理通知 */}
          <div className="c-card c-kpi">
            <div className="c-kpi-label"><LiveDot size={7} color="#7c4dff" />待处理通知</div>
            <div className="c-kpi-val purple">{notify?.pendingCount ?? '—'}</div>
            <div className="c-kpi-unit">条待发</div>
            <div className="c-kpi-sub">今日已发&nbsp;<b style={{ color: '#7c4dff' }}>{notify?.sentToday ?? 0}</b>&nbsp;条</div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第二行：实时脉搏折线 + 工厂排行榜          ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 实时生产脉搏 */}
          <div className="c-card c-scanline-card">
            <div className="c-card-title">
              <LiveDot />
              实时生产脉搏
              <span className="c-card-badge cyan-badge">{pulse?.scanRatePerHour ?? 0} 件/时</span>
            </div>
            <div style={{ margin: '6px 0 4px' }}>
              <Sparkline pts={(pulse?.timeline ?? []).map(p => p.count)} color="#00e5ff" width={340} height={52} />
              <div className="c-sparkline-label">
                {(pulse?.timeline ?? []).map((p, i) => <span key={i}>{p.time.slice(-5)}</span>)}
              </div>
            </div>
            {/* 停工工厂列表 */}
            {(pulse?.stagnantFactories?.length ?? 0) > 0 ? (
              <div className="c-stagnant-list">
                {pulse!.stagnantFactories.map(f => (
                  <div key={f.factoryName} className="c-stagnant-row">
                    <span className="c-stagnant-dot" />
                    <span className="c-stagnant-name">{f.factoryName}</span>
                    <span className="c-stagnant-time">已停滞 {Math.round(f.minutesSilent / 60)}h{Math.round(f.minutesSilent % 60)}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                所有工厂生产正常，系统稳定运转
              </div>
            )}
          </div>

          {/* 工厂绩效排行 */}
          <div className="c-card">
            <div className="c-card-title">
              🏆 工厂绩效排行榜
              <span className="c-card-badge purple-badge">实时评分</span>
            </div>
            {ranking?.rankings?.length ? (
              ranking.rankings.slice(0, 5).map((r, i) => (
                <div key={r.factoryId} className="c-rank-row">
                  <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#7a8999' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${r.rank}`}
                  </span>
                  <span className="c-rank-name">{r.factoryName}</span>
                  <div className="c-rank-bar-wrap">
                    <div className="c-rank-bar" style={{ width: `${r.totalScore}%`, background: i === 0 ? 'linear-gradient(90deg,#ffd700,#f7a600)' : 'linear-gradient(90deg,#00e5ff,#0098aa)' }} />
                  </div>
                  <span className="c-rank-score">{r.totalScore}</span>
                </div>
              ))
            ) : <div className="c-empty">暂无排行数据</div>}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第三行：面料缺口 + 缺陷热力图              ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-5-7">

          {/* 面料缺口预警 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料 &amp; 辅料缺口预警
            </div>
            {shortage?.shortageItems?.length ? (
              shortage.shortageItems.slice(0, 6).map(item => (
                <div key={item.materialCode} className="c-shortage-row">
                  <span className="c-shortage-risk" style={{ color: risk2color(item.riskLevel), borderColor: risk2color(item.riskLevel) }}>
                    {item.riskLevel}
                  </span>
                  <span className="c-shortage-name">{item.materialName}</span>
                  <span className="c-shortage-qty">缺&nbsp;{item.shortageQuantity}&nbsp;{item.unit}</span>
                </div>
              ))
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                所有面辅料库存充足
              </div>
            )}
            {shortage?.summary && <div className="c-summary">{shortage.summary}</div>}
          </div>

          {/* 缺陷热力图 */}
          <div className="c-card">
            <div className="c-card-title">
              🌡️ 质量缺陷热力图
              {heatmap && (
                <span className="c-card-badge red-badge">
                  总缺陷 {heatmap.totalDefects}
                </span>
              )}
            </div>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#ff4136' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#ff4136' }}>{heatmap.worstFactory}</b>
                </div>
                <div className="c-heatmap-grid" style={{ gridTemplateColumns: `72px repeat(${heatmap.factories.length}, 1fr)` }}>
                  <div />
                  {heatmap.factories.map(f => <div key={f} className="c-heat-head">{f}</div>)}
                  {heatmap.processes.map(proc => (
                    <React.Fragment key={proc}>
                      <div className="c-heat-row-label">{proc}</div>
                      {heatmap.factories.map(fac => {
                        const cell = heatmap.cells.find(c => c.process === proc && c.factory === fac);
                        const alpha = cell ? Math.min(cell.intensity, 0.9) : 0;
                        return (
                          <div key={fac} className="c-heat-cell"
                            style={{ background: `rgba(255,65,54,${alpha})`, color: alpha > 0.45 ? '#fff' : '#444' }}>
                            {cell?.defectCount || ''}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </>
            ) : <div className="c-empty">暂无缺陷数据</div>}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第四行：工人效率表 + 异常自愈诊断          ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 工人技能效率 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} />
              工人效率实时监控
            </div>
            <table className="c-table">
              <thead>
                <tr><th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th></th></tr>
              </thead>
              <tbody>
                {workers?.workers?.slice(0, 7).map(w => (
                  <tr key={w.operatorName}>
                    <td>{w.operatorName}</td>
                    <td style={{ color: w.speedScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.speedScore}</td>
                    <td style={{ color: w.qualityScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.qualityScore}</td>
                    <td>{w.stabilityScore}</td>
                    <td>{w.versatilityScore}</td>
                    <td>{w.attendanceScore}</td>
                    <td><b style={{ color: '#00e5ff' }}>{w.overallScore}</b></td>
                    <td>{w.trend === 'UP' ? '📈' : w.trend === 'DOWN' ? '📉' : '➡️'}</td>
                  </tr>
                )) ?? <tr><td colSpan={8} className="c-empty-td">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 异常自愈诊断 */}
          <div className="c-card">
            <div className="c-card-title">
              🔧 系统异常自愈诊断
              {healing && (
                <span className="c-card-badge" style={{
                  background: healing.healthScore >= 80 ? 'rgba(57,255,20,0.15)' : 'rgba(247,166,0,0.15)',
                  color: healing.healthScore >= 80 ? '#39ff14' : '#f7a600',
                  borderColor: healing.healthScore >= 80 ? '#39ff14' : '#f7a600',
                }}>
                  健康 {healing.healthScore} 分 · 发现 {healing.issuesFound} 项
                </span>
              )}
            </div>
            {healing?.items?.length ? (
              healing.items.slice(0, 7).map((item, i) => (
                <div key={i} className="c-heal-item">
                  <span className={`c-heal-dot ${item.status === 'OK' ? 'dot-ok' : item.autoFixed ? 'dot-fixed' : 'dot-warn'}`} />
                  <span className="c-heal-name">{item.checkName}</span>
                  <span className="c-heal-detail">{item.detail}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {item.autoFixed
                      ? <Tag color="success" style={{ fontSize: 11 }}>已自修</Tag>
                      : item.status !== 'OK'
                        ? <Tag color="warning" style={{ fontSize: 11 }}>需处理</Tag>
                        : <Tag style={{ fontSize: 11, background: 'rgba(57,255,20,0.1)', color: '#39ff14', borderColor: '#39ff14' }}>正常</Tag>
                    }
                  </span>
                </div>
              ))
            ) : <div className="c-empty">暂无诊断数据</div>}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第五行：AI 智能顾问（全宽）                ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="c-card c-chat-card">
          <div className="c-card-title">
            <RobotOutlined style={{ marginRight: 6, color: '#a78bfa' }} />
            AI 智能顾问
            <LiveDot size={6} color="#a78bfa" />
            <span className="c-chat-hint">— 实时问询生产、订单、库存、财务任何问题</span>
          </div>
          <div className="c-chat-row">
            <Input
              className="c-chat-input"
              placeholder="例如：今天哪个工厂效率最高？本月有哪些订单有交期风险？面料缺口怎么处理？"
              value={chatQ}
              onChange={e => setChatQ(e.target.value)}
              onPressEnter={handleChat}
            />
            <Button type="primary" icon={<SendOutlined />} loading={chatLoading}
              onClick={handleChat} className="c-chat-send">发送</Button>
          </div>
          {chatLoading && (
            <div className="c-chat-thinking">
              <DashboardOutlined spin style={{ marginRight: 6 }} />
              AI 正在扫描全链路数据，生成分析报告...
            </div>
          )}
          {chatA && <div className="c-chat-answer">{chatA}</div>}
          <div className="c-chat-suggestions">
            {['今日生产进度如何？', '有哪些订单停工超过2小时？', '面料库存是否充足？', '本月哪个工厂绩效最佳？', '异常订单需要处理吗？'].map(q => (
              <button key={q} className="c-suggest-btn" onClick={() => setChatQ(q)}>{q}</button>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
