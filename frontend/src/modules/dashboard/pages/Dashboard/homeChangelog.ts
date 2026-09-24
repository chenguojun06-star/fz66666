/**
 * D-526 首页「产品更新」公告位——纯前端静态配置。
 * 每次发版有用户可感知的改动时，在最上面加一条（date 用 MM-DD）。
 * 条目保持 5 条以内，旧的直接删，不做归档。
 */
export interface HomeChangelogItem {
  date: string;
  text: string;
}

export const HOME_CHANGELOG: HomeChangelogItem[] = [
  { date: '09-24', text: '首页全新改版：常用功能宫格、业务全流程、意见反馈直达' },
  { date: '09-23', text: '打印升级：多页单据每页带页码（第 X 页 / 共 Y 页）' },
  { date: '09-23', text: '商品仓储：编码详情补显销售单价，入库价统一叫「入库单价」' },
  { date: '09-21', text: '打印入口治理：下单打印只留「打印合同」，标签入口收敛' },
  { date: '09-21', text: '生产扫码新增「环节核验」开关，扫码门禁管理员可控' },
];
