import React, { useMemo } from 'react';
import { RightOutlined } from '@ant-design/icons';
import styles from './QuickLinksPanel.module.css';

interface LinkItem { label: string; desc: string; icon: string; iconBg: string; path: string; }
interface RecentItem { label: string; path: string; }
interface Props { onNavigate: (path: string) => void; recentLinks?: RecentItem[]; }

const MODULE_COLORS: Record<string, string> = {
  production: '#e6f4ff', style: '#fff0f6', warehouse: '#f0f5ff', procurement: '#fff7e6',
  quality: '#f6ffed', finance: '#fffbe6', system: '#fafafa', intelligence: '#f9f0ff',
};

const MODULES: { key: string; title: string; items: LinkItem[] }[] = [
  { key: 'production', title: '生产管理', items: [
    { label: '订单管理', desc: '生产订单全流程', icon: '📋', iconBg: MODULE_COLORS.production, path: '/production/order-management' },
    { label: '裁剪管理', desc: '裁剪任务与轧单', icon: '✂️', iconBg: MODULE_COLORS.production, path: '/production/cutting' },
    { label: '款号档案', desc: '款号信息管理', icon: '👗', iconBg: MODULE_COLORS.production, path: '/style-info' },
    { label: '基础数据', desc: '模板与字典维护', icon: '⚙️', iconBg: MODULE_COLORS.production, path: '/basic' },
  ]},
  { key: 'style', title: '样衣开发', items: [
    { label: '样衣列表', desc: '样衣开发全流程', icon: '🧵', iconBg: MODULE_COLORS.style, path: '/style' },
    { label: '开发进度', desc: '进度跟踪与看板', icon: '📊', iconBg: MODULE_COLORS.style, path: '/style-info' },
  ]},
  { key: 'warehouse', title: '仓库管理', items: [
    { label: '入库管理', desc: '物料与成品入库', icon: '📥', iconBg: MODULE_COLORS.warehouse, path: '/warehouse/inbound' },
    { label: '出库管理', desc: '扫码发货出库', icon: '📤', iconBg: MODULE_COLORS.warehouse, path: '/warehouse/outbound' },
    { label: '库存查询', desc: '实时库存与盘点', icon: '📦', iconBg: MODULE_COLORS.warehouse, path: '/warehouse/inventory' },
    { label: '样品仓库', desc: '样品出入库', icon: '🏷️', iconBg: MODULE_COLORS.warehouse, path: '/warehouse/sample' },
  ]},
  { key: 'procurement', title: '采购管理', items: [
    { label: '物料采购', desc: '采购订单与到货', icon: '🛒', iconBg: MODULE_COLORS.procurement, path: '/procurement' },
    { label: '对账结算', desc: '采购对账与付款', icon: '💰', iconBg: MODULE_COLORS.procurement, path: '/finance/payment' },
  ]},
  { key: 'quality', title: '质检管理', items: [
    { label: '质检记录', desc: '工序质检与判定', icon: '🔍', iconBg: MODULE_COLORS.quality, path: '/production/quality' },
    { label: '次品追溯', desc: '缺陷分析与追溯', icon: '⚠️', iconBg: MODULE_COLORS.quality, path: '/production/defect-trace' },
  ]},
  { key: 'finance', title: '财务管理', items: [
    { label: '工资核算', desc: '计件工资与支付', icon: '💳', iconBg: MODULE_COLORS.finance, path: '/finance/wage' },
    { label: '成本分析', desc: '生产成本与利润', icon: '📈', iconBg: MODULE_COLORS.finance, path: '/finance/cost' },
    { label: '应付账款', desc: '采购应付款管理', icon: '📝', iconBg: MODULE_COLORS.finance, path: '/finance/payable' },
  ]},
  { key: 'system', title: '系统管理', items: [
    { label: '用户管理', desc: '用户与权限配置', icon: '👥', iconBg: MODULE_COLORS.system, path: '/system/user-list' },
    { label: '工厂管理', desc: '工厂信息维护', icon: '🏭', iconBg: MODULE_COLORS.system, path: '/system/factory' },
  ]},
  { key: 'intelligence', title: '智能运营', items: [
    { label: '运营看板', desc: '数据大屏与监控', icon: '📡', iconBg: MODULE_COLORS.intelligence, path: '/cockpit' },
    { label: 'AI决策中心', desc: '智能分析与建议', icon: '🧠', iconBg: MODULE_COLORS.intelligence, path: '/cockpit/agent-traces' },
  ]},
];

const QuickLinksPanel: React.FC<Props> = ({ onNavigate, recentLinks = [] }) => {
  const visibleModules = useMemo(() => MODULES.filter(m => m.items.length > 0), []);

  return (
    <div className={styles.container}>
      {visibleModules.map(mod => (
        <div key={mod.key} className={styles.section}>
          <span className={styles.sectionTitle}>{mod.title}</span>
          <div className={styles.grid}>
            {mod.items.map(item => (
              <div key={item.path} className={styles.linkCard} onClick={() => onNavigate(item.path)}>
                <div className={styles.iconBox} style={{ background: item.iconBg }}>{item.icon}</div>
                <div className={styles.linkInfo}>
                  <span className={styles.linkLabel}>{item.label}</span>
                  <span className={styles.linkDesc}>{item.desc}</span>
                </div>
                <RightOutlined className={styles.arrowIcon} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {recentLinks.length > 0 && (
        <div className={styles.recentSection}>
          <span className={styles.sectionTitle}>最近访问</span>
          {recentLinks.slice(0, 5).map((rl, i) => (
            <div key={i} className={styles.recentItem} onClick={() => onNavigate(rl.path)}>
              <span className={styles.recentDot} />
              <span>{rl.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(QuickLinksPanel);