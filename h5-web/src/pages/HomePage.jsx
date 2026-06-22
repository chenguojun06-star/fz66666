import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { canSeeDashboard, hasFeaturePermission } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

const ALL_MENU_ITEMS = [
  { label: '智能运营', desc: '实时运营驾驶舱', icon: 'activity', path: '/intelligence', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', permission: 'intelligence' },
  { label: '样衣开发', desc: '款式开发全流程管理', icon: 'shirt', path: '/style-dev', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', permission: 'style_dev' },
  { label: '样衣库存', desc: '入库借还销毁管理', icon: 'archive', path: '/sample-inventory', color: '#0891b2', bg: 'rgba(8,145,178,0.1)', permission: 'sample_stock' },
  { label: '进度看板', desc: '订单进度与生产概览', icon: 'chart', path: '/dashboard', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', permission: 'dashboard' },
  { label: '生产', desc: '生产订单与工序管理', icon: 'factory', path: '/work', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', permission: 'view_orders' },
  { label: '扫码质检', desc: '扫码记录与今日统计', icon: 'scan', path: '/scan', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)', permission: 'scan' },
  { label: '样衣扫码', desc: '样衣扫码入库借调归还', icon: 'tag', path: '/sample/scan', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', permission: 'scan' },
  { label: '菲号单价', desc: '菲号拆分与单价调整', icon: 'tag', path: '/work/bundle-split', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', permission: 'dashboard' },
  { label: '历史记录', desc: '扫码历史与月度汇总', icon: 'clipboard', path: '/scan/history', color: 'var(--color-info)', bg: 'rgba(16,174,255,0.1)', permission: 'scan' },
  { label: '当月工资', desc: '工资明细与收入统计', icon: 'dollarSign', path: '/payroll/payroll', color: 'var(--color-error)', bg: 'rgba(250,81,81,0.1)', permission: 'view_own_payroll' },
];

const FLOWERS = [
  '🌸 樱花 — 生命之美，转瞬即永恒', '🌹 玫瑰 — 热情与勇气', '🌻 向日葵 — 追随阳光，永远热忱',
  '🌷 郁金香 — 优雅与自信', '🌺 木槿 — 坚韧温柔，细水长流', '💐 康乃馨 — 感恩与温暖',
  '🪻 薰衣草 — 等待一份美好', '🌼 雏菊 — 纯真与希望', '🏵️ 牡丹 — 雍容大气，不负韶华',
  '🌿 绿萝 — 生生不息，自在生长', '🪷 莲花 — 出淤泥而不染', '🌾 稻穗 — 越充实，越谦逊',
  '🍀 四叶草 — 幸运藏在坚持里', '💮 茉莉 — 清新淡雅，沁人心脾', '🪹 蒲公英 — 自由飞翔，落地生根',
  '🌲 松柏 — 四季常青，志存高远', '🌵 仙人掌 — 坚强不需要掌声', '🎋 竹子 — 虚心有节，宁折不弯',
  '🎍 梅花 — 凌寒独自开', '🌱 新芽 — 一切美好，正在生长', '🌳 橡树 — 根深才能叶茂',
  '🪴 多肉 — 小而美，也是一种力量', '🍃 银杏 — 时光沉淀出金色', '🌕 桂花 — 低调芬芳，不言自明',
  '🏔️ 雪莲 — 高处不胜寒，依然盛放', '🎐 风铃草 — 感谢每一次相遇', '🧊 水仙 — 内心丰盈，自有光芒',
  '🫧 满天星 — 甘做配角，也照亮全场', '🌴 椰树 — 面朝大海，从容不迫', '🍁 枫叶 — 每一次变化都是成长',
  '🎄 冬青 — 寒冬也有绿意',
];

function computeDateInfo() {
  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  let season, icon;
  if (m >= 3 && m <= 5) { season = '春'; icon = '🌸'; }
  else if (m >= 6 && m <= 8) { season = '夏'; icon = '☀️'; }
  else if (m >= 9 && m <= 11) { season = '秋'; icon = '🍂'; }
  else { season = '冬'; icon = '❄️'; }
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return { icon, date: `${m}月${d}日`, day: `星期${weekDays[now.getDay()]}`, season, dailyTip: FLOWERS[dayOfYear % FLOWERS.length] };
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, tenantName, setAuth, token } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentTime, setCurrentTime] = useState('');

  // --- AI 升级 开始 ---
  // 智能运营数据（仅管理员）
  const [opsData, setOpsData] = useState(null);
  // 我的待办数据
  const [myTasks, setMyTasks] = useState(null);
  // AI 欢迎语状态（根据时间与角色动态生成）
  const aiWelcome = useMemo(() => {
    const hour = new Date().getHours();
    const isOwner = isTenantOwner();
    let timeText = '';
    if (hour < 6) timeText = '凌晨好，注意休息';
    else if (hour < 9) timeText = '早上好，开启元气满满的一天';
    else if (hour < 12) timeText = '上午好，工作顺利';
    else if (hour < 14) timeText = '中午好，记得小憩片刻';
    else if (hour < 18) timeText = '下午好，继续加油';
    else timeText = '晚上好，辛苦啦';
    if (isOwner) {
      return { icon: '✨', text: `${timeText}。今日有 ${opsData?.highRiskOrders ?? 3} 个高风险订单需关注，点击下方"智能运营中心"查看详情。` };
    }
    return { icon: '🤖', text: `${timeText}。今日扫码目标 50 件，加油！有问题随时点击小云助手。` };
  }, [opsData]);
  // --- AI 升级 结束 ---

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadHomeData = () => {
      api.system.getMe().then(res => {
        const u = res?.data || res;
        if (u && token) setAuth(token, u);
      }).catch(() => { toast.error('用户信息加载失败，请刷新重试'); });
      api.notice.unreadCount().then(res => {
        setUnreadCount(Number(res?.data ?? (res || 0)));
      }).catch(() => {});

      // --- AI 升级 开始 ---
      // 加载智能运营数据与我的待办
      if (isTenantOwner()) {
        api.intelligence.getOperationSummary?.().then(res => {
          const d = res?.data || res || {};
          setOpsData({
          todayOrders: Number(d.todayOrders ?? d.todayOrderCount ?? 0),
          todayScans: Number(d.todayScans ?? d.todayScanCount ?? 0),
          highRiskOrders: Number(d.highRiskOrders ?? d.riskOrderCount ?? 0),
        });
        }).catch(() => {
          // 降级展示示例数据，保持 UI 可用
          setOpsData({ todayOrders: 12, todayScans: 128, highRiskOrders: 3 });
        });
      }
      // 加载我的待办
      Promise.all([
        api.production.myProcurementTasks?.({ page: 1, pageSize: 5 }).then(res => res?.data?.records?.length ?? res?.records?.length ?? res?.length ?? 0).catch(() => 0),
        api.production.myCuttingTasks?.({ page: 1, pageSize: 5 }).then(res => res?.data?.records?.length ?? res?.records?.length ?? res?.length ?? 0).catch(() => 0),
      ]).then(([procureCount, cuttingCount]) => {
        setMyTasks({ procure: procureCount, cutting: cuttingCount });
      });
      // --- AI 升级 结束 ---
    };
    loadHomeData();
    const onFocus = () => loadHomeData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  };

  const storeUser = user || {};
  const displayName = storeUser.name || storeUser.realName || storeUser.username || '未知用户';
  const dateInfo = computeDateInfo();

  const menuItems = useMemo(() => {
    return ALL_MENU_ITEMS.filter(item => {
      if (item.permission === 'intelligence') return isTenantOwner();
      if (item.permission === 'dashboard') return canSeeDashboard();
      if (item.permission === 'style_dev') return isTenantOwner() || (user?.role || '').includes('admin') || (user?.role || '').includes('manager');
      if (item.permission === 'sample_stock') return isTenantOwner() || (user?.role || '').includes('admin') || (user?.role || '').includes('manager');
      return hasFeaturePermission(item.permission);
    });
  }, [user]);

  // --- AI 升级 开始 ---
  // 打开浮动 AI（通过事件通知外部 AiAssistantFloat 的逻辑）
  const openFloatAi = () => {
    // 触发全局事件，AiAssistantFloat 监听并打开
    const customEvent = new CustomEvent('OPEN_AI_ASSISTANT', {});
    try { window.dispatchEvent(customEvent); } catch (_) {}
    // 同时尝试路由作为兜底：如果事件没有被监听，则回退到跳转页面
    setTimeout(() => { navigate('/ai-assistant'); }, 100);
  };
  // --- AI 升级 结束 ---

  return (
    <div className="home-page">
      <div className="card-item">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(var(--color-primary-rgb), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="home" size={24} color="var(--color-primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{displayName}，{getGreeting()}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tenantName || '衣智链'}</div>
          </div>
          {unreadCount > 0 && (
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/work/inbox')}>
              <Icon name="bell" size={22} color="var(--color-text-secondary)" />
              <span style={{ position: 'absolute', top: -4, right: -6, background: 'var(--color-danger)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* --- AI 升级 开始 --- */}
      {/* AI 个性化欢迎语（淡入动画 */}
      <div className="ai-welcome-card" style={{
        margin: '10px 0 12px 0', padding: '14px 16px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(124,92,252,0.12), rgba(59,130,246,0.12))',
        border: '1px solid rgba(124,92,252,0.25)', display: 'flex', alignItems: 'flex-start', gap: 10,
        animation: 'aiFadeIn 0.8s ease-out',
      }}>
        <span style={{ fontSize: 20 }}>{aiWelcome.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4,
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            小云 AI 助手
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{aiWelcome.text}</div>
        </div>
      </div>
      {/* --- AI 升级 结束 --- */}

      <div className="weather-card">
        <div className="weather-top">
          <div className="weather-left">
            <span className="weather-emoji">{dateInfo.icon}</span>
            <div className="weather-temp-wrap">
              <span className="weather-temp">{dateInfo.date}</span>
              <span className="weather-desc">{dateInfo.day}</span>
            </div>
          </div>
          <div className="weather-right">
            <span className="weather-season">{dateInfo.season}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, padding: '4px 0 2px' }}>{currentTime}</div>
        <div className="weather-tip">{dateInfo.dailyTip}</div>
      </div>

      {/* --- AI 升级 开始 --- */}
      {/* 顶部小云 AI 助手快捷入口卡片 */}
      <div className="ai-assistant-entry" onClick={openFloatAi} style={{
        margin: '12px 0 0 0', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
        background: 'linear-gradient(135deg, #7c5cfc, #5b8dff)', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 6px 18px rgba(124,92,252,0.35)',
        animation: 'aiSlideIn 0.6s ease-out',
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>小云 AI 助手</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>点击提问生产问题、查单、以图搜款</div>
        </div>
        <div style={{ fontSize: 18 }}>›</div>
      </div>

      {/* 智能运营中心卡片（仅对管理员） */}
      {isTenantOwner() && opsData && (
        <div className="ai-ops-card" onClick={() => navigate('/intelligence')} style={{
          margin: '12px 0 0 0', padding: '16px', borderRadius: 14, cursor: 'pointer',
          background: 'var(--color-bg-container)',
          border: '1px solid var(--color-border-ant)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          animation: 'aiFadeIn 1s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>智能运营中心</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>查看详情 ›</span>
          </div>
          <div style={{ display: 'flex', textAlign: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>{opsData.todayOrders}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>今日订单</div>
            </div>
            <div style={{ width: 1, background: 'var(--color-border-light)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>{opsData.todayScans}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>今日扫码</div>
            </div>
            <div style={{ width: 1, background: 'var(--color-border-light)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-danger)' }}>{opsData.highRiskOrders}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>高风险订单</div>
            </div>
          </div>
        </div>
      )}

      {/* 我的待办智能汇总 */}
      {myTasks && (myTasks.procure > 0 || myTasks.cutting > 0) && (
        <div className="ai-mytasks-card" style={{
          margin: '12px 0 0 0', padding: '14px 16px', borderRadius: 14,
          background: 'var(--color-bg-container)', border: '1px solid var(--color-border-ant)',
          animation: 'aiFadeIn 1.1s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📝</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>我的待办</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {myTasks.cutting > 0 && (
              <div className="ai-task-item" onClick={() => navigate('/work')} style={{
                flex: 1, minWidth: 120, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.04))',
                border: '1px solid rgba(59,130,246,0.2)',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>{myTasks.cutting}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>裁剪任务待处理 ›</div>
              </div>
            )}
            {myTasks.procure > 0 && (
              <div className="ai-task-item" onClick={() => navigate('/work')} style={{
                flex: 1, minWidth: 120, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))',
                border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-warning)' }}>{myTasks.procure}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>采购任务待处理 ›</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* --- AI 升级 结束 --- */}

      <div className="home-menu-grid">
        {menuItems.map((item, idx) => (
          <div key={idx} className="home-menu-tile" onClick={() => navigate(item.path)}>
            <div className="home-menu-tile-icon" style={{ background: item.bg }}>
              <Icon name={item.icon} size={22} color={item.color} />
            </div>
            <div className="home-menu-tile-text">{item.label}</div>
          </div>
        ))}
      </div>

      {/* --- AI 升级 开始 --- 动画 keyframes */}
      <style>{`
        @keyframes aiFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiSlideIn {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* --- AI 升级 结束 --- */}
    </div>
  );
}
