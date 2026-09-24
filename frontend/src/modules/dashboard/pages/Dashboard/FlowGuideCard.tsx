import React from 'react';
import { RightOutlined } from '@ant-design/icons';
import {
  AccountBookOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  ScissorOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { paths } from '@/routeConfig';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';

interface FlowStep {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

/**
 * D-527：业务全流程条——替代原「流程引导」4×4 链接堆（与常用功能宫格大量重复，用户点名）。
 * 一行读完整条业务链：打样 → 下单 → 采购 → 裁剪 → 工序 → 质检 → 仓储 → 对账。
 * 节点仍按权限过滤，不给死链接。
 */
const FLOW_STEPS: FlowStep[] = [
  { key: 'sample', label: '打样开发', href: paths.styleInfoList, icon: <TagOutlined /> },
  { key: 'order', label: '商品下单', href: paths.orderManagementList, icon: <ShopOutlined /> },
  { key: 'material', label: '采购物料', href: paths.materialPurchase, icon: <ShoppingCartOutlined /> },
  { key: 'cutting', label: '裁剪生产', href: paths.cutting, icon: <ScissorOutlined /> },
  { key: 'process', label: '工序跟进', href: paths.productionList, icon: <ThunderboltOutlined /> },
  { key: 'inspect', label: '质检入库', href: paths.warehousing, icon: <SafetyCertificateOutlined /> },
  { key: 'deliver', label: '仓储发货', href: paths.finishedInventory, icon: <InboxOutlined /> },
  { key: 'settle', label: '对账结算', href: paths.materialReconciliation, icon: <AccountBookOutlined /> },
];

const FlowGuideCard: React.FC = () => {
  const { hasPermissionForPath, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled } = useLayoutAuth();

  const steps = FLOW_STEPS.filter((step) => {
    if (isFactoryAccount && !factoryVisiblePaths.has(step.href)) return false;
    return hasPermissionForPath(step.href) && isTenantModuleEnabled(step.href);
  });

  return (
    <div className="dashboard-card home-card">
      <div className="card-header">
        <h3 className="card-title">业务全流程</h3>
      </div>
      <div className="card-content">
        <div className="home-flow-strip">
          {steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              {idx > 0 && <RightOutlined className="home-flow-arrow" />}
              <a className="home-flow-node" href={step.href} title={step.label}>
                <span className="home-flow-icon">{step.icon}</span>
                <span className="home-flow-label">{step.label}</span>
              </a>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowGuideCard;
