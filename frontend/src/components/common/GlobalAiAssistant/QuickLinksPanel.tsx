import React, { useMemo } from 'react';
import { RightOutlined } from '@ant-design/icons';
import styles from './QuickLinksPanel.module.css';

interface LinkItem { label: string; desc: string; icon: string; iconBg: string; path: string; }
interface Props { onOpenInFrame: (path: string, label: string) => void; }

const BGC: Record<string, string> = {
  production: '#e6f4ff', style: '#fff0f6', warehouse: '#f0f5ff', procurement: '#fff7e6',
  quality: '#f6ffed', finance: '#fffbe6', system: '#fafafa', intelligence: '#f9f0ff',
};

const MODULES: { key: string; title: string; items: LinkItem[] }[] = [
  {
    key: 'basic', title: '样衣开发', items: [
      { label: '样衣档案', desc: '款号信息管理', icon: '👗', iconBg: BGC.style, path: '/style-info' },
      { label: '下单管理', desc: '生产下单入口', icon: '📝', iconBg: BGC.style, path: '/order-management' },
      { label: '资料单价', desc: '物料单价维护', icon: '📊', iconBg: BGC.procurement, path: '/basic/maintenance-center' },
    ],
  },
  {
    key: 'production', title: '生产管理', items: [
      { label: '我的订单', desc: '生产订单全流程', icon: '📋', iconBg: BGC.production, path: '/production' },
      { label: '裁剪管理', desc: '裁剪任务与轧单', icon: '✂️', iconBg: BGC.production, path: '/production/cutting' },
      { label: '工序跟进', desc: '各工序进度跟踪', icon: '🔍', iconBg: BGC.production, path: '/production/progress-detail' },
      { label: '质检入库', desc: '扫码质检入库', icon: '✅', iconBg: BGC.quality, path: '/production/warehousing' },
      { label: '外发工厂', desc: '外发生产进度', icon: '🏭', iconBg: BGC.production, path: '/production/external-factory' },
    ],
  },
  {
    key: 'procurement', title: '物料采购', items: [
      { label: '物料采购', desc: '采购订单与到货', icon: '🛒', iconBg: BGC.procurement, path: '/production/material' },
      { label: '物料进销存', desc: '物料库存查询', icon: '📦', iconBg: BGC.warehouse, path: '/warehouse/material' },
      { label: '物料新增', desc: '新增物料档案', icon: '➕', iconBg: BGC.warehouse, path: '/warehouse/material-database' },
    ],
  },
  {
    key: 'warehouse', title: '成品仓库', items: [
      { label: '成品进销存', desc: '成品库存管理', icon: '📥', iconBg: BGC.warehouse, path: '/warehouse/finished' },
      { label: '样衣库存', desc: '样衣出入库', icon: '🏷️', iconBg: BGC.warehouse, path: '/warehouse/sample' },
      { label: '标签打印', desc: '条码标签打印', icon: '🖨️', iconBg: BGC.warehouse, path: '/warehouse/label-print' },
      { label: '库存盘点', desc: '定期盘点核对', icon: '📋', iconBg: BGC.warehouse, path: '/warehouse/inventory-check' },
    ],
  },
  {
    key: 'supplier', title: '供应商管理', items: [
      { label: '合作工厂', desc: '外发工厂管理', icon: '🤝', iconBg: BGC.production, path: '/production/partners' },
    ],
  },
  {
    key: 'ecommerce', title: '电商运营', items: [
      { label: '平台总览', desc: '各平台数据汇总', icon: '📡', iconBg: BGC.intelligence, path: '/ecommerce/center' },
      { label: '电商订单', desc: '电商订单处理', icon: '🛍️', iconBg: BGC.intelligence, path: '/warehouse/ecommerce' },
    ],
  },
  {
    key: 'finance', title: '财务管理', items: [
      { label: '工资结算', desc: '计件工资汇总', icon: '💳', iconBg: BGC.finance, path: '/finance/payroll-operator-summary' },
      { label: '收付款中心', desc: '工资发放管理', icon: '💰', iconBg: BGC.finance, path: '/finance/wage-payment' },
      { label: '物料对账', desc: '采购对账结算', icon: '📋', iconBg: BGC.finance, path: '/finance/material-reconciliation' },
      { label: '外发结算', desc: '外发工费结算', icon: '🏗️', iconBg: BGC.finance, path: '/finance/center' },
      { label: '费用报销', desc: '日常费用报销', icon: '🧾', iconBg: BGC.finance, path: '/finance/expense-reimbursement' },
      { label: '财税导出', desc: '财务报表导出', icon: '📈', iconBg: BGC.finance, path: '/finance/tax-export' },
    ],
  },
  {
    key: 'crm', title: '客户管理', items: [
      { label: '客户档案', desc: '客户信息管理', icon: '👥', iconBg: BGC.system, path: '/crm' },
      { label: '应收账款', desc: '客户应收跟踪', icon: '💵', iconBg: BGC.finance, path: '/crm/receivables' },
    ],
  },
  {
    key: 'system', title: '系统管理', items: [
      { label: '人员管理', desc: '用户与权限配置', icon: '👤', iconBg: BGC.system, path: '/system/user' },
      { label: '岗位管理', desc: '角色权限设置', icon: '🔑', iconBg: BGC.system, path: '/system/role' },
      { label: '字典管理', desc: '数据字典维护', icon: '📖', iconBg: BGC.system, path: '/system/dict' },
      { label: '组织架构', desc: '部门工厂结构', icon: '🏢', iconBg: BGC.system, path: '/system/organization' },
      { label: '数据导入', desc: '批量导入工具', icon: '📤', iconBg: BGC.system, path: '/system/data-import' },
    ],
  },
  {
    key: 'intelligence', title: '智能运营', items: [
      { label: '数据看板', desc: '运营数据大屏', icon: '📡', iconBg: BGC.intelligence, path: '/cockpit' },
      { label: 'AI执行记录', desc: '智能体执行追踪', icon: '🧠', iconBg: BGC.intelligence, path: '/cockpit/agent-traces' },
      { label: '智能运营中心', desc: 'AI决策与控制', icon: '⚡', iconBg: BGC.intelligence, path: '/intelligence/center' },
    ],
  },
];

const QuickLinksPanel: React.FC<Props> = ({ onOpenInFrame }) => {
  const visibleModules = useMemo(() => MODULES.filter(m => m.items.length > 0), []);

  return (
    <div className={styles.container}>
      {visibleModules.map(mod => (
        <div key={mod.key} className={styles.section}>
          <span className={styles.sectionTitle}>{mod.title}</span>
          <div className={styles.grid}>
            {mod.items.map(item => (
              <div key={item.path} className={styles.linkCard} onClick={() => onOpenInFrame(item.path, item.label)}>
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
    </div>
  );
};

export default React.memo(QuickLinksPanel);