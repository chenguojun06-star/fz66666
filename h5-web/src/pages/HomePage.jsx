import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { canSeeDashboard, hasFeaturePermission } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

const ALL_MENU_ITEMS = [
  { label: '进度看板', desc: '订单进度与生产概览', icon: 'chart', path: '/dashboard', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', permission: 'dashboard' },
  { label: '生产', desc: '生产订单与工序管理', icon: 'factory', path: '/work', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', permission: 'view_orders' },
  { label: '扫码质检', desc: '扫码记录与今日统计', icon: 'scan', path: '/scan', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)', permission: 'scan' },
  { label: '样衣扫码', desc: '样衣扫码入库借调归还', icon: 'shirt', path: '/sample/scan', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', permission: 'scan' },
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
      if (item.permission === 'dashboard') return canSeeDashboard();
      return hasFeaturePermission(item.permission);
    });
  }, []);

  return (
    <div className="home-page">
      <div className="card-item">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(var(--color-primary-rgb), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="home" size={24} color="var(--color-primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{displayName}，{getGreeting()}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>衣智链｜多端协同智能提醒平台</div>
          </div>
          {unreadCount > 0 && (
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/work/inbox')}>
              <Icon name="bell" size={22} color="var(--color-text-secondary)" />
              <span style={{ position: 'absolute', top: -4, right: -6, background: 'var(--color-danger)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
