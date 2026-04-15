/**
 * API 统一入口（精简聚合层）
 * 各领域模块已拆分至 ./api-modules/ 目录，此文件仅做聚合与导出
 *
 * 拆分前：531 行 → 拆分后：~45 行
 */

// ── 领域模块 ──────────────────────────────────────────────
const production = require('./api-modules/production');
const { system, serial, factory, factoryWorker, tenant } = require('./api-modules/system');
const { intelligence, notice } = require('./api-modules/intelligence');
const { style, warehouse, material, materialRoll, orderManagement, sampleStock } = require('./api-modules/style-warehouse');
const { dashboard, wechat, common } = require('./api-modules/common');

// ── 聚合对象（与拆分前完全一致的接口） ──────────────────────
const api = {
  dashboard,
  production,
  system,
  material,
  materialRoll,
  style,
  warehouse,
  orderManagement,
  sampleStock,
  serial,
  factory,
  tenant,
  wechat,
  intelligence,
  common,
  factoryWorker,
  notice,
};

// ── 导出（保持原有 module.exports + named exports 兼容） ───
module.exports = api;
module.exports.dashboard = dashboard;
module.exports.production = production;
module.exports.system = system;
module.exports.material = material;
module.exports.materialRoll = materialRoll;
module.exports.style = style;
module.exports.warehouse = warehouse;
module.exports.orderManagement = orderManagement;
module.exports.serial = serial;
module.exports.factory = factory;
module.exports.tenant = tenant;
module.exports.wechat = wechat;
module.exports.sampleStock = sampleStock;

/* --- 拆分前原始代码已归档至 api-modules/ 各领域文件 --- */
/* helpers.js       — ok / raw / pickMessage / createBizError / uploadFile */
/* production.js    — 生产订单 / 扫码 / 裁剪 / 采购 / 质检（40+ 方法）*/
/* system.js        — 认证 / 用户 / 角色 / 工厂 / 租户 */
/* intelligence.js  — AI对话 / NL执行 / 消息通知 */
/* style-warehouse.js — 款式 / 仓库 / 库存 / 物料 */
/* common.js        — 仪表板 / 微信 / 通用上传 */
