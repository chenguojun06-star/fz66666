import React, { useState } from 'react';
import { Button } from 'antd';
import { DownOutlined, UpOutlined, RightOutlined } from '@ant-design/icons';
import { menuConfig, paths } from '@/routeConfig';
import {
  FACTORY_VISIBLE_PATHS,
  FACTORY_VISIBLE_SECTIONS,
  useLayoutAuth,
} from '@/components/Layout/useLayoutAuth';

/**
 * D-528：全模块功能导航——首页顶部的唯一入口区。
 *
 * 数据源 = routeConfig 的 menuConfig（与左侧菜单完全同源）：
 * 菜单里有什么这里就有什么，新增模块自动出现，不会长出系统里不存在的东西。
 * 可见性过滤与 SideMenu 同规则（权限码 / 工厂账号白名单 / 租户模块开关 / superAdminOnly）。
 *
 * 每个模块一句话说明维护在 DESC_BY_PATH；没写说明的模块只显示名称，不编造。
 */
const DESC_BY_PATH: Record<string, string> = {
  // ── 样衣管理 ──
  [paths.styleInfoList]: '建款、尺寸、BOM、工艺与打样全流程',
  [paths.maintenanceCenter]: '基础资料维护中心',
  [paths.sampleInventory]: '样衣入库、借还与库存',
  [paths.orderManagementList]: '下单、颜色尺码与合同打印',
  // ── 物料管理 ──
  [paths.materialPurchase]: '采购申请、到货回料与入库',
  [paths.materialInventory]: '物料库存、领料与流水',
  [paths.materialDatabase]: '物料主档与色卡',
  // ── 生产管理 ──
  [paths.productionList]: '大货订单与生产进度',
  [paths.cutting]: '裁剪计划、菲号与床次',
  [paths.progressDetail]: '工序进度与扫码跟进',
  [paths.externalFactory]: '外发工厂与扫码收发',
  [paths.warehousing]: '质检、成品入库与直发',
  // ── 合作伙伴 ──
  [paths.productionPartners]: '供应商与外发工厂档案',
  [paths.partnerManagement]: '合作企业与合作方账号',
  // ── 成品管理 ──
  [paths.finishedInventory]: '成品库存、出入库与编码详情',
  [paths.productInfo]: '商品档案与编码管理',
  [paths.labelPrint]: '吊牌、条码标签打印',
  [paths.inventoryCheck]: '盘点与差异处理',
  [paths.warehouseLocationMap]: '仓库库区库位可视化',
  // ── 电商运营 ──
  [paths.ecommerceCenter]: '电商平台对接总览',
  [paths.ecommerceOrders]: '电商销售订单与发货',
  // ── CRM ──
  [paths.crm]: '客户资料与跟进',
  [paths.crmReceivables]: '客户应收与回款',
  // ── 财务管理 ──
  [paths.financeDashboard]: '收支利润与经营口径总览',
  [paths.payrollOperatorSummary]: '计件工资汇总与结算',
  [paths.salaryConfig]: '计时计件薪资规则',
  [paths.deductionManage]: '扣款项与扣款记录',
  [paths.financeCenter]: '外发加工费对账结算',
  [paths.materialReconciliation]: '物料采购对账',
  [paths.financePaymentSchedule]: '应付付款计划',
  [paths.wagePayment]: '收付款、往来与账单',
  [paths.expenseReimbursement]: '费用报销与员工借支',
  [paths.financeTaxExport]: '发票台账与财税数据导出',
  // ── 系统设置 ──
  [paths.profile]: '我的资料、反馈与消息',
  [paths.user]: '员工账号与审批',
  [paths.attendanceAdmin]: '考勤记录与统计',
  [paths.role]: '岗位、权限矩阵与数据权限',
  [paths.organization]: '部门与组织树',
  [paths.scanRecordManage]: '扫码录入查询与撤回',
  // ── 工具 ──
  [paths.dataImport]: '历史数据批量导入',
  [paths.dict]: '枚举字典维护',
  [paths.fieldConfig]: '各页面显示字段配置',
  [paths.printTemplate]: '打印模板管理',
  [paths.systemLogs]: '操作与系统日志',
  [paths.tutorial]: '功能引导与教程',
  [paths.orphanData]: '孤儿数据排查清理',
  // ── 单页入口 ──
  [paths.selectionBatch]: '选款会务与批版进度',
  [paths.appStore]: '应用与 API 智能对接',
  [paths.tenantManagement]: 'API 凭证与对接配置',
  [paths.customerManagement]: '平台客户与租户管理',
  [paths.intelligenceCenter]: '问小云、巡检与智能分析',
  [paths.cockpit]: '经营驾驶舱',
};

const COLLAPSE_KEY = 'dashboard_module_directory_collapsed';

interface ModuleItem {
  label: string;
  path: string;
  desc: string;
}

interface ModuleGroup {
  key: string;
  title: string;
  icon: React.ReactNode;
  items: ModuleItem[];
}

const ModuleDirectory: React.FC = () => {
  const {
    hasPermissionForPath,
    isFactoryAccount,
    isSuperAdmin,
    isTenantModuleEnabled,
    factoryVisibleSections,
  } = useLayoutAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const itemVisible = (path: string) => {
    if (isFactoryAccount && !FACTORY_VISIBLE_PATHS.has(path)) return false;
    return hasPermissionForPath(path) && isTenantModuleEnabled(path);
  };

  const groups: ModuleGroup[] = menuConfig
    .filter((section) => section.key !== 'dashboard') // 首页本身不进导航
    .map((section) => {
      const items: ModuleItem[] = (section.items || [])
        .filter((item) => {
          if ((item as any).superAdminOnly && !isSuperAdmin) return false;
          return itemVisible(item.path);
        })
        .map((item) => ({
          label: item.label,
          path: item.path,
          desc: DESC_BY_PATH[item.path] || '',
        }));
      // 无子项的分区（选品中心/应用商店等）作为单条目分组
      if (!items.length && section.path && section.key !== 'dashboard') {
        if (section.superAdminOnly && !isSuperAdmin) return null;
        if (itemVisible(section.path)) {
          items.push({ label: section.title, path: section.path, desc: DESC_BY_PATH[section.path] || '' });
        }
      }
      if (!items.length) return null;
      return { key: section.key, title: section.title, icon: section.icon, items };
    })
    .filter((g): g is ModuleGroup => !!g)
    // 工厂账号只看得到白名单分区（与 SideMenu 同规则）
    .filter((g) => !isFactoryAccount || FACTORY_VISIBLE_SECTIONS.has(g.key));

  return (
    <div className="dashboard-card home-card">
      <div className="card-header">
        <h3 className="card-title">功能导航</h3>
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
          <div className="module-directory-grid">
            {groups.map((group) => (
              <div key={group.key} className="module-group">
                <div className="module-group-title">
                  {group.icon}
                  <span>{group.title}</span>
                </div>
                {group.items.map((item) => (
                  <a key={item.path + item.label} className="module-item" href={item.path}>
                    <span className="module-item-text">
                      <span className="module-item-name">{item.label}</span>
                      {item.desc && <span className="module-item-desc">{item.desc}</span>}
                    </span>
                    <RightOutlined className="module-item-go" />
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleDirectory;
