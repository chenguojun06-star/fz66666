import React, { useState } from 'react';
import { Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { paths } from '@/routeConfig';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';

interface FlowItem {
  label: string;
  desc: string;
  path: string;
}

interface FlowGroup {
  key: string;
  title: string;
  items: FlowItem[];
}

/** 按服装业务链组织的流程引导：打样 → 下单 → 采购 → 仓储发货 */
const FLOW_GROUPS: FlowGroup[] = [
  {
    key: 'sample',
    title: '打样开发',
    items: [
      { label: '款号资料', desc: '建款、尺寸、BOM、工艺', path: paths.styleInfoList },
      { label: '选款批版', desc: '选款会务与批版进度', path: paths.selectionBatch },
      { label: '纸样管理', desc: '纸样版本与修改记录', path: paths.patternRevision },
      { label: '商品资料', desc: '商品档案与商品编码', path: paths.productInfo },
    ],
  },
  {
    key: 'order',
    title: '下单生产',
    items: [
      { label: '商品下单', desc: '下单、颜色尺码与合同打印', path: paths.orderManagementList },
      { label: '生产订单', desc: '大货订单与工序跟进', path: paths.productionList },
      { label: '订单流程', desc: '全链路流程可视化', path: paths.orderFlow },
      { label: '裁剪管理', desc: '床次、菲号与裁剪任务', path: paths.cutting },
    ],
  },
  {
    key: 'material',
    title: '采购物料',
    items: [
      { label: '面辅料采购', desc: '采购申请、到货与回料', path: paths.materialPurchase },
      { label: '物料资料', desc: '物料主档与色卡', path: paths.materialDatabase },
      { label: '物料仓储', desc: '物料库存与领料', path: paths.materialInventory },
      { label: '供应商管理', desc: '供应商与外发工厂', path: paths.factory },
    ],
  },
  {
    key: 'delivery',
    title: '仓储发货',
    items: [
      { label: '质检入库', desc: '质检与成品入库', path: paths.warehousing },
      { label: '商品仓储', desc: '库存、出库与编码详情', path: paths.finishedInventory },
      { label: '库存盘点', desc: '盘点与差异处理', path: paths.inventoryCheck },
      { label: '电商订单', desc: '电商销售与发货', path: paths.ecommerceOrders },
    ],
  },
];

const COLLAPSE_KEY = 'dashboard_flow_guide_collapsed';

/**
 * D-526 首页聚水潭化：流程引导区（对齐参考稿「销售流程/售后流程」的分组引导形态）。
 * 老用户收起后 localStorage 记住；入口同样按权限过滤，不给死链接。
 */
const FlowGuideCard: React.FC = () => {
  const { hasPermissionForPath, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled } = useLayoutAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const visibleGroups = FLOW_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (isFactoryAccount && !factoryVisiblePaths.has(item.path)) return false;
        return hasPermissionForPath(item.path) && isTenantModuleEnabled(item.path);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="dashboard-card home-card">
      <div className="card-header">
        <h3 className="card-title">流程引导</h3>
        <Button
          type="text"
          size="small"
          icon={collapsed ? <DownOutlined /> : <UpOutlined />}
          onClick={toggle}
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {collapsed ? '展开' : '收起'}
        </Button>
      </div>
      {!collapsed && (
        <div className="card-content">
          <div className="flow-guide-grid">
            {visibleGroups.map((group) => (
              <div key={group.key} className="flow-guide-group">
                <div className="flow-guide-group-title">{group.title}</div>
                {group.items.map((item) => (
                  <div key={item.path + item.label} className="flow-guide-item">
                    <div className="flow-guide-item-text">
                      <span className="flow-guide-item-name">{item.label}</span>
                      <span className="flow-guide-item-desc">{item.desc}</span>
                    </div>
                    <a className="flow-guide-item-link" href={item.path}>去看看</a>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowGuideCard;
