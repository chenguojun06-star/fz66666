import { menuConfig, paths } from '@/routeConfig';

/**
 * D-530：首页「流程引导」面板配置。
 * 面板 = 分组（业务环节）+ 组内模块条目，全部可由用户增删（设置弹窗），localStorage 持久化。
 * 条目来源于全系统菜单（menuConfig），只能添加真实存在的模块，不会长出没有的东西。
 */

export interface FlowPanelItem {
  /** 模块名 */
  label: string;
  /** 跳转路径（唯一键） */
  path: string;
  /** 一句话说明 */
  desc: string;
}

export interface FlowPanelGroup {
  key: string;
  title: string;
  items: FlowPanelItem[];
}

/** 默认分组：四段业务链（用户认可的开箱形态） */
export const DEFAULT_GROUPS: FlowPanelGroup[] = [
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

/** 各模块一句话说明（按 path）——设置弹窗添加模块时自动带上 */
export const MODULE_DESC: Record<string, string> = {
  [paths.styleInfoList]: '建款、尺寸、BOM、工艺与打样全流程',
  [paths.maintenanceCenter]: '基础资料维护中心',
  [paths.sampleInventory]: '样衣入库、借还与库存',
  [paths.orderManagementList]: '下单、颜色尺码与合同打印',
  [paths.materialPurchase]: '采购申请、到货回料与入库',
  [paths.materialInventory]: '物料库存、领料与流水',
  [paths.materialDatabase]: '物料主档与色卡',
  [paths.productionList]: '大货订单与生产进度',
  [paths.cutting]: '裁剪计划、菲号与床次',
  [paths.progressDetail]: '工序进度与扫码跟进',
  [paths.externalFactory]: '外发工厂与扫码收发',
  [paths.warehousing]: '质检、成品入库与直发',
  [paths.productionPartners]: '供应商与外发工厂档案',
  [paths.partnerManagement]: '合作企业与合作方账号',
  [paths.finishedInventory]: '成品库存、出入库与编码详情',
  [paths.productInfo]: '商品档案与编码管理',
  [paths.labelPrint]: '吊牌、条码标签打印',
  [paths.inventoryCheck]: '盘点与差异处理',
  [paths.warehouseLocationMap]: '仓库库区库位可视化',
  [paths.ecommerceCenter]: '电商平台对接总览',
  [paths.ecommerceOrders]: '电商销售订单与发货',
  [paths.crm]: '客户资料与跟进',
  [paths.crmReceivables]: '客户应收与回款',
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
  [paths.profile]: '我的资料、反馈与消息',
  [paths.user]: '员工账号与审批',
  [paths.attendanceAdmin]: '考勤记录与统计',
  [paths.role]: '岗位、权限矩阵与数据权限',
  [paths.organization]: '部门与组织树',
  [paths.scanRecordManage]: '扫码录入查询与撤回',
  [paths.dataImport]: '历史数据批量导入',
  [paths.dict]: '枚举字典维护',
  [paths.fieldConfig]: '各页面显示字段配置',
  [paths.printTemplate]: '打印模板管理',
  [paths.systemLogs]: '操作与系统日志',
  [paths.tutorial]: '功能引导与教程',
  [paths.orphanData]: '孤儿数据排查清理',
  [paths.selectionBatch]: '选款会务与批版进度',
  [paths.appStore]: '应用与 API 智能对接',
  [paths.tenantManagement]: 'API 凭证与对接配置',
  [paths.customerManagement]: '平台客户与租户管理',
  [paths.intelligenceCenter]: '问小云、巡检与智能分析',
  [paths.cockpit]: '经营驾驶舱',
};

export const FLOW_PANEL_STORAGE_KEY = 'dashboard_flow_guide_panel_v1';

/** 读取用户自定义面板（无/损坏时回退默认） */
export function loadPanelGroups(): FlowPanelGroup[] {
  try {
    const raw = localStorage.getItem(FLOW_PANEL_STORAGE_KEY);
    if (!raw) return DEFAULT_GROUPS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.groups)) return DEFAULT_GROUPS;
    const groups = parsed.groups
      .filter((g: any) => g && typeof g.key === 'string' && typeof g.title === 'string' && Array.isArray(g.items))
      .map((g: any) => ({
        key: String(g.key),
        title: String(g.title),
        items: g.items
          .filter((it: any) => it && typeof it.path === 'string' && typeof it.label === 'string')
          .map((it: any) => ({ label: String(it.label), path: String(it.path), desc: String(it.desc || '') })),
      }));
    return groups.length > 0 ? groups : DEFAULT_GROUPS;
  } catch {
    return DEFAULT_GROUPS;
  }
}

export function savePanelGroups(groups: FlowPanelGroup[]): void {
  localStorage.setItem(FLOW_PANEL_STORAGE_KEY, JSON.stringify({ groups }));
}

export interface ModuleOption {
  label: string;
  path: string;
  desc: string;
  sectionTitle: string;
}

/** 全系统可选模块（menuConfig 展平，含单页分区；仪表盘本身除外） */
export function listAllSystemModules(): ModuleOption[] {
  const out: ModuleOption[] = [];
  for (const section of menuConfig) {
    if (section.key === 'dashboard') continue;
    if (section.items?.length) {
      for (const item of section.items) {
        out.push({ label: item.label, path: item.path, desc: MODULE_DESC[item.path] || '', sectionTitle: section.title });
      }
    } else if (section.path) {
      out.push({ label: section.title, path: section.path, desc: MODULE_DESC[section.path] || '', sectionTitle: section.title });
    }
  }
  return out;
}
