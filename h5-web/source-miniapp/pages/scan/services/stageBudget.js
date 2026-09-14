/**
 * stageBudget — 扫码面板「环节预计时长」解析（D-387）
 *
 * 功能：根据当前工序名/父环节，从环节配置 t_stage_config.expectedDays 读出该环节预计天数。
 * 口径：单环节独立展示，只读、不参与交期/排产计算。
 *
 * 缓存：60s TTL。配置表不受则返回 null（不显示），不影响扫码主流程。
 */

const api = require('../../../utils/api');

const TTL = 60 * 1000;
let cache = null;
let cacheTime = 0;

// 父环节名 → 配置表 stage_name 的映射（与 PC progressTimeBudget.ts 保持一致）
const RULES = [
  { re: /采购|物料|备料|辅料|面料|procurement/i, key: '采购' },
  { re: /裁剪|剪裁|cutting/i, key: '裁剪' },
  { re: /二次工艺|特殊工艺|绣花|印花|secondary/i, key: '二次工艺' },
  { re: /车缝|缝纫|平车|sewing/i, key: '车缝' },
  { re: /尾部|尾工|包装|打包|大烫|整烫|熨烫|质检|检验|pressing|packaging|ironing|tail|quality|inspection/i, key: '尾部' },
  { re: /入库|仓库|成品|warehousing/i, key: '入库' },
];

async function ensure(force) {
  if (!force && cache && Date.now() - cacheTime < TTL) return cache;
  try {
    const res = await api.production.getStageConfig();
    const list = Array.isArray(res)
      ? res
      : (res && res.data && Array.isArray(res.data) ? res.data : []);
    const map = {};
    list.forEach(function(c) {
      if (c && c.stageName) {
        const d = Number(c.expectedDays);
        if (Number.isFinite(d) && d > 0) map[c.stageName] = d;
      }
    });
    cache = map;
    cacheTime = Date.now();
  } catch (e) {
    cache = cache || {};
  }
  return cache || {};
}

/**
 * 解析当前环节的预计天数
 * @param {string} processName 工序名
 * @param {string} progressStage 父环节（可选）
 * @returns {Promise<number|null>} 预计天数；未配置返回 null
 */
async function resolve(processName, progressStage) {
  const map = await ensure(false);
  const src = String(processName || '') + ' ' + String(progressStage || '');
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i].re.test(src)) {
      const v = map[RULES[i].key];
      if (Number.isFinite(v) && v > 0) return Math.max(1, Math.round(v));
      return null;
    }
  }
  return null;
}

/** 强制刷新配置缓存（配置刚被 PC 修改后可调用） */
async function refresh() {
  cache = null;
  cacheTime = 0;
  return ensure(false);
}

module.exports = { resolve, refresh };