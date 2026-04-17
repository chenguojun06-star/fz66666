import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';
import './IntelligencePage.css';

const STAGE_LABELS = [
  { key: 'procurement', label: '采购', icon: 'shopping-cart' },
  { key: 'cutting', label: '裁剪', icon: 'scissors' },
  { key: 'secondary', label: '二次工艺', icon: 'layers' },
  { key: 'sewing', label: '车缝', icon: 'zap' },
  { key: 'finishing', label: '尾部', icon: 'package' },
  { key: 'warehousing', label: '入库', icon: 'inbox' },
];

function formatSilent(ms) {
  if (!ms || ms <= 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h${rm > 0 ? rm + 'm' : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function overdueDays(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function gradeColor(g) {
  if (g === 'A' || g === 'A+') return 'var(--color-success)';
  if (g === 'B') return 'var(--color-primary)';
  if (g === 'C') return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export default function IntelligencePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [bottleneck, setBottleneck] = useState([]);
  const [dashData, setDashData] = useState({});
  const [topStats, setTopStats] = useState({});
  const [factoryCap, setFactoryCap] = useState([]);
  const [expandedStage, setExpandedStage] = useState(null);

  useEffect(() => {
    if (!isTenantOwner()) {
      toast.info('仅租户老板可访问');
      navigate('/', { replace: true });
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes, pulseRes, workersRes, bnRes, dashRes, tsRes] = await Promise.allSettled([
        api.production.orderStats({}),
        api.production.orderList({ page: 1, pageSize: 100, excludeTerminal: 'true' }),
        api.intelligence.getLivePulse(),
        api.intelligence.getWorkerEfficiency(),
        api.intelligence.getFactoryBottleneck(),
        api.dashboard.get(),
        api.dashboard.getTopStats(),
      ]);

      const s = statsRes.status === 'fulfilled' ? (statsRes.value?.data || statsRes.value || {}) : {};
      setStats(s);

      const oData = ordersRes.status === 'fulfilled' ? (ordersRes.value?.data || ordersRes.value || {}) : {};
      const oList = oData?.records || oData?.list || [];
      setOrders(oList);

      if (pulseRes.status === 'fulfilled') setPulse(pulseRes.value?.data || pulseRes.value || null);
      if (workersRes.status === 'fulfilled') {
        const wd = workersRes.value?.data || workersRes.value || {};
        setWorkers(wd?.workers || wd?.list || Array.isArray(wd) ? wd : []);
      }
      if (bnRes.status === 'fulfilled') setBottleneck(bnRes.value?.data || bnRes.value || []);
      if (dashRes.status === 'fulfilled') setDashData(dashRes.value?.data || dashRes.value || {});
      if (tsRes.status === 'fulfilled') setTopStats(tsRes.value?.data || tsRes.value || {});
    } catch (e) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const overdueOrders = useMemo(() =>
    orders.filter(o => {
      const d = new Date(String(o.plannedEndDate || o.expectedShipDate || '').replace(' ', 'T'));
      return !isNaN(d.getTime()) && d < new Date() && o.status !== 'completed';
    }), [orders]);

  const stageMap = useMemo(() => {
    const map = {};
    STAGE_LABELS.forEach(s => { map[s.key] = { orders: [], count: 0, qty: 0 }; });
    orders.forEach(o => {
      const stage = String(o.currentStage || o.status || '').toLowerCase();
      const qty = o.orderQuantity || o.totalQuantity || 0;
      if (stage.includes('purchas') || stage.includes('采购') || stage.includes('procurement')) {
        map.procurement.orders.push(o); map.procurement.count++; map.procurement.qty += qty;
      } else if (stage.includes('cut') || stage.includes('裁剪')) {
        map.cutting.orders.push(o); map.cutting.count++; map.cutting.qty += qty;
      } else if (stage.includes('secondary') || stage.includes('二次') || stage.includes('工艺')) {
        map.secondary.orders.push(o); map.secondary.count++; map.secondary.qty += qty;
      } else if (stage.includes('sew') || stage.includes('车缝') || stage.includes('生产') || stage.includes('production')) {
        map.sewing.orders.push(o); map.sewing.count++; map.sewing.qty += qty;
      } else if (stage.includes('finish') || stage.includes('尾部') || stage.includes('包装') || stage.includes('pack')) {
        map.finishing.orders.push(o); map.finishing.count++; map.finishing.qty += qty;
      } else if (stage.includes('warehouse') || stage.includes('入库')) {
        map.warehousing.orders.push(o); map.warehousing.count++; map.warehousing.qty += qty;
      } else {
        map.sewing.orders.push(o); map.sewing.count++; map.sewing.qty += qty;
      }
    });
    return map;
  }, [orders]);

  const factoryList = useMemo(() => {
    const seen = new Map();
    orders.forEach(o => {
      const fn = o.factoryName || '未分配';
      if (!seen.has(fn)) seen.set(fn, { name: fn, orders: 0, qty: 0, lastScan: o.updatedAt || o.createTime });
      const f = seen.get(fn);
      f.orders++;
      f.qty += (o.orderQuantity || o.totalQuantity || 0);
    });
    return Array.from(seen.values());
  }, [orders]);

  const stagnantFactories = useMemo(() => {
    return bottleneck.map(b => ({
      name: b.factoryName || b.name || '未知',
      silentMinutes: b.silentMinutes || b.minutesSilent || 0,
    }));
  }, [bottleneck]);

  const scanRate = pulse?.scanRatePerHour || pulse?.ratePerHour || 0;
  const pulsePoints = pulse?.recentPoints || pulse?.points || [];

  if (loading) {
    return <div className="loading-center">加载中...</div>;
  }

  return (
    <div className="intelligence-page">
      <div className="sub-page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sub-page-title">
          <span className="live-dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 8, verticalAlign: 'middle', animation: 'pulse-dot 1.5s infinite' }} />
          智能运营中心
        </span>
        <button className="refresh-btn" onClick={fetchData}>
          <Icon name="refresh" size={12} /> 刷新
        </button>
      </div>

      {/* 生产中订单统计 */}
      <section className="intel-section">
        <div className="section-title">生产中订单</div>
        <div className="stats-grid">
          <div className="stat-card stat-card--primary">
            <div className="stat-val">{stats?.activeOrders ?? stats?.totalOrders ?? 0}</div>
            <div className="stat-label">单生产中</div>
            <div className="stat-sub">总 {stats?.activeQuantity ?? stats?.totalQuantity ?? 0} 件</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats?.todayOrders ?? 0}</div>
            <div className="stat-label">今日下单</div>
            <div className="stat-sub">{stats?.todayQuantity ?? 0} 件</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{topStats?.warehousingInbound?.day ?? dashData?.todayInboundCount ?? 0}</div>
            <div className="stat-label">今日入库</div>
            <div className="stat-sub">{topStats?.warehousingInbound?.dayQty ?? 0} 件</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{topStats?.warehousingOutbound?.day ?? dashData?.todayOutboundCount ?? 0}</div>
            <div className="stat-label">今日出库</div>
            <div className="stat-sub">{topStats?.warehousingOutbound?.dayQty ?? 0} 件</div>
          </div>
          <div className="stat-card stat-card--danger">
            <div className="stat-val">{overdueOrders.length}</div>
            <div className="stat-label">已逾期</div>
            <div className="stat-sub">{overdueOrders.reduce((s, o) => s + (o.orderQuantity || o.totalQuantity || 0), 0)} 件</div>
          </div>
          <div className="stat-card stat-card--warning">
            <div className="stat-val">{stats?.highRiskOrders ?? 0}</div>
            <div className="stat-label">高风险</div>
            <div className="stat-sub">{stats?.highRiskQuantity ?? 0} 件</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats?.watchOrders ?? 0}</div>
            <div className="stat-label">关注中</div>
            <div className="stat-sub">{stats?.watchQuantity ?? 0} 件</div>
          </div>
        </div>
      </section>

      {/* 逾期订单明细 */}
      {overdueOrders.length > 0 && (
        <section className="intel-section">
          <div className="section-title">逾期订单明细</div>
          {overdueOrders.slice(0, 10).map(o => (
            <div key={o.id || o.orderNo} className="overdue-item">
              <div className="overdue-main">
                <span className="overdue-no">{o.orderNo}</span>
                <span className="overdue-factory">{o.factoryName}</span>
              </div>
              <div className="overdue-meta">
                <span className="overdue-days">逾{overdueDays(o.plannedEndDate || o.expectedShipDate)}天</span>
                <span className="overdue-qty">·{o.orderQuantity || o.totalQuantity || 0}件</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 工厂全景 */}
      <section className="intel-section">
        <div className="section-title">工厂全景</div>
        <div className="factory-summary">
          <span className="factory-count">{factoryList.length} 工厂</span>
          <span className="factory-orders">{orders.length} 单 {orders.reduce((s, o) => s + (o.orderQuantity || o.totalQuantity || 0), 0)}件</span>
          <span className="factory-online">{factoryList.length - stagnantFactories.length} 在线</span>
          <span className="factory-stagnant">{stagnantFactories.length} 停滞</span>
        </div>
        {stagnantFactories.length > 0 && (
          <div className="stagnant-list">
            <div className="stagnant-label">停滞工厂</div>
            {stagnantFactories.map((f, i) => (
              <div key={i} className="stagnant-item">
                <span className="stagnant-name">{f.name}</span>
                <span className="stagnant-time">{formatSilent(f.silentMinutes * 60000)} 静默</span>
              </div>
            ))}
          </div>
        )}
        {stagnantFactories.length === 0 && <div className="intel-empty">工厂稳定</div>}
      </section>

      {/* 进度节点 */}
      <section className="intel-section">
        <div className="section-title">进度节点 <span className="section-hint">点击卡片展开订单</span></div>
        <div className="stage-grid">
          {STAGE_LABELS.map(s => {
            const d = stageMap[s.key] || { count: 0, qty: 0, orders: [] };
            const isExpanded = expandedStage === s.key;
            return (
              <div key={s.key} className={`stage-card${isExpanded ? ' stage-card--expanded' : ''}`}
                onClick={() => setExpandedStage(isExpanded ? null : s.key)}>
                <div className="stage-header">
                  <span className="stage-label">{s.label}</span>
                  <span className="stage-count">{d.count}单</span>
                </div>
                <div className="stage-qty">{d.qty} 件</div>
                {d.count > 0 && d.orders[0] && (
                  <div className="stage-sample">
                    <span className="stage-sample-no">{d.orders[0].orderNo}</span>
                    <span className="stage-sample-pct">
                      {d.orders[0].progress != null ? Math.round(d.orders[0].progress) + '%' : ''}
                    </span>
                  </div>
                )}
                {d.count === 0 && <div className="stage-empty">暂无订单</div>}
                {isExpanded && d.orders.length > 0 && (
                  <div className="stage-order-list" onClick={e => e.stopPropagation()}>
                    {d.orders.map(o => (
                      <div key={o.id || o.orderNo} className="stage-order-item">
                        <span className="so-no">{o.orderNo}</span>
                        <span className="so-qty">{o.orderQuantity || o.totalQuantity || 0}件</span>
                        <span className="so-pct">{o.progress != null ? Math.round(o.progress) + '%' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 实时生产脉搏 */}
      <section className="intel-section">
        <div className="section-title">
          实时生产脉搏
          <span className="pulse-rate">{scanRate} 件/时</span>
        </div>
        <div className="pulse-chart">
          {pulsePoints.length > 0 ? (
            <svg viewBox="0 0 200 40" className="pulse-svg" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
                points={pulsePoints.map((p, i) =>
                  `${(i / Math.max(pulsePoints.length - 1, 1)) * 200},${40 - (p.value || p.qty || 0) / Math.max(...pulsePoints.map(x => x.value || x.qty || 1), 1) * 35}`
                ).join(' ')}
              />
            </svg>
          ) : (
            <div className="intel-empty">今日暂无扫码记录</div>
          )}
        </div>
      </section>

      {/* 扫码脉冲墙 */}
      <section className="intel-section">
        <div className="section-title">
          <span className="live-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ef4444', marginRight: 6, verticalAlign: 'middle' }} />
          扫码脉冲墙
        </div>
        <div className="pulse-wall">
          <div className="pulse-wall-item">
            <span className="pw-label">30秒</span>
            <span className="pw-val">{pulse?.last30s ?? pulse?.sec30 ?? 0} 件</span>
          </div>
          <div className="pulse-wall-item">
            <span className="pw-label">60秒</span>
            <span className="pw-val">{pulse?.last60s ?? pulse?.sec60 ?? 0} 件</span>
          </div>
        </div>
        {scanRate === 0 && <div className="pulse-warning">静默预警：当前暂无任何活跃扫码</div>}
      </section>

      {/* 人效实时动态 */}
      <section className="intel-section">
        <div className="section-title">人效实时动态</div>
        {workers.length > 0 ? (
          <div className="worker-table-wrap">
            <table className="worker-table">
              <thead>
                <tr>
                  <th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th>评级</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={i}>
                    <td>{w.name || w.workerName || '-'}</td>
                    <td>{w.speed ?? w.speedScore ?? '-'}</td>
                    <td>{w.quality ?? w.qualityScore ?? '-'}</td>
                    <td>{w.stability ?? w.stabilityScore ?? '-'}</td>
                    <td>{w.versatility ?? w.multiSkill ?? '-'}</td>
                    <td>{w.attendance ?? w.attendanceRate ?? '-'}</td>
                    <td><strong>{w.overall ?? w.compositeScore ?? '-'}</strong></td>
                    <td><span style={{ color: gradeColor(w.grade || w.rating || ''), fontWeight: 600 }}>{w.grade || w.rating || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="intel-empty">暂无人效数据</div>
        )}
      </section>
    </div>
  );
}
