/**
 * D-280：工序进度时间线共享工具（生产管理/外发管理 对齐样衣开发跟进的时间线样式）
 * - 节点状态推导（completed/in_progress/pending）
 * - 开始/结束时间懒加载合并（复用订单 flow 接口的 stages，避免列表页批量请求）
 * - D-285：时间恒显示不受开关控制；单价仅受租户级全局开关控制（入口在「权限配置」页）
 */

/** D-283：租户级「工序单价显示」开关的 feature key（与后端 TenantSmartFeatureOrchestrator 对齐） */
const PRICE_FLAG_KEY = 'display.process.unitPrice.visible';
/** 租户级开关的本地缓存（进页面先读缓存秒显，再异步拉后端覆盖） */
const TENANT_PRICE_CACHE_KEY = 'proc_price_tenant_visible';

/** 租户级单价开关（本地缓存值，默认显示；以 loadTenantPriceVisible 拉取的后端值为准） */
function getTenantPriceVisible() {
  try {
    const stored = wx.getStorageSync(TENANT_PRICE_CACHE_KEY);
    if (stored === '' || stored === undefined || stored === null) return true;
    return !!stored;
  } catch (e) { return true; }
}

function cacheTenantPriceVisible(visible) {
  try { wx.setStorageSync(TENANT_PRICE_CACHE_KEY, !!visible); } catch (e) { /* 存储失败不阻断 */ }
}

/**
 * D-283：把租户级单价开关应用到已合并的时间线节点。
 * 隐藏时清空 priceText（保留 _priceTextRaw 原始值，重新打开时无需重拉数据即可恢复）。
 */
function applyTenantPriceVisibility(processNodes, visible) {
  (Array.isArray(processNodes) ? processNodes : []).forEach(n => {
    if (n._priceTextRaw === undefined) n._priceTextRaw = n.priceText || '';
    n.priceText = visible ? n._priceTextRaw : '';
  });
  return processNodes;
}

/** 进度百分比 → 时间线节点状态 */
function nodeStatus(percent) {
  const p = Number(percent) || 0;
  if (p >= 100) return 'completed';
  if (p > 0) return 'in_progress';
  return 'pending';
}

/**
 * 给 processNodes 补时间线渲染字段（_status）
 * D-286：前沿推进口径——第一个未完成工序 = 进行中（蓝色呼吸），其后待开始（灰），
 * 全部完成全绿。与样衣跟进视觉一致：生产中的单永远有且仅有一个呼吸点。
 * （旧口径 percent>0 才算进行中，导致 0% 的当前工序是死灰色，用户反馈"没有呼吸"）
 */
function applyTimelineStatus(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  let frontierFound = false;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (!n) continue;
    const base = nodeStatus(n.percent);
    if (base === 'completed') { n._status = 'completed'; continue; }
    if (!frontierFound) {
      n._status = 'in_progress';
      frontierFound = true;
    } else {
      n._status = 'pending';
    }
  }
  return list;
}

/**
 * D-284：时间文本标准化，兼容两种后端序列化格式
 * "2026-09-01 15:15:00" / ISO "2026-09-01T15:15:00.123"（含毫秒、时区尾巴一律裁掉）
 */
function normalizeTimeText(t) {
  let s = String(t === undefined || t === null ? '' : t).trim();
  if (!s) return '';
  s = s.replace('T', ' ');
  const dot = s.indexOf('.');
  if (dot > 0) s = s.substring(0, dot);
  const plus = s.indexOf('+');
  if (plus > 10) s = s.substring(0, plus);
  return s.length > 19 ? s.substring(0, 19) : s;
}

function formatShortTime(t) {
  const text = normalizeTimeText(t);
  // "2026-09-01 15:15:00" → "09-01 15:15"（与样衣跟进 meta 同款短格式）
  return text.length >= 16 ? text.substring(5, 16) : text;
}

/**
 * D-284：解析为毫秒时间戳。
 * 手动拆分年月日时分秒构造 Date —— iOS 不支持 new Date('yyyy-MM-dd HH:mm:ss')（会得 NaN）。
 */
function parseTimeMs(t) {
  const s = normalizeTimeText(t);
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) {
    const fallback = new Date(s.replace(/-/g, '/')).getTime();
    return isNaN(fallback) ? NaN : fallback;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0));
  return d.getTime();
}

/** D-284：毫秒 → 紧凑时长文案（"3天2时" / "5时30分" / "25分" / "<1分"） */
function formatDuration(ms) {
  if (!(ms > 0)) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return hours > 0 ? days + '天' + hours + '时' : days + '天';
  if (hours > 0) return mins > 0 ? hours + '时' + mins + '分' : hours + '时';
  if (mins > 0) return mins + '分';
  return '<1分';
}

/** D-284：停留/等待时长颜色等级（与 PC StageTimelineHint 同口径：≥3天红 / ≥1天橙） */
function gapLevelOf(ms) {
  const days = ms / 86400000;
  if (days >= 3) return 'danger';
  if (days >= 1) return 'warn';
  return 'normal';
}

function durationClassOf(level) {
  return 'proc-tl-meta-text proc-tl-meta-text--' + level;
}

/**
 * D-284：为时间线节点补齐「耗时 / 停留 / 等待」。
 * 口径与 PC 生产管理进度看板一致：
 *  - 耗时 = 本节点 末扫时间 - 首扫时间
 *  - 停留 = 本节点 首扫时间 - 上一节点 末扫时间
 *  - 等待 = 现在 - 上一节点 末扫时间（仅本节点未开始、且后续节点也无任何进展时才算，
 *          避免"跳过/直裁"节点被误报成持续增长的等待）
 */
function applyTimelineDurations(processNodes) {
  const list = Array.isArray(processNodes) ? processNodes : [];
  const now = Date.now();
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (!node) continue;
    const startMs = parseTimeMs(node.startTimeRaw);
    const endMs = parseTimeMs(node.endTimeRaw);

    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      const diff = endMs - startMs;
      node.durationText = formatDuration(diff);
      node.durationClass = durationClassOf(diff > 48 * 3600000 ? 'danger' : 'normal');
    } else {
      node.durationText = '';
      node.durationClass = '';
    }

    node.gapText = '';
    node.gapClass = '';
    node.gapFrom = '';
    if (i === 0) continue;
    const prev = list[i - 1];
    const prevEndMs = prev ? parseTimeMs(prev.endTimeRaw) : NaN;
    if (isNaN(prevEndMs)) continue;

    if (!isNaN(startMs)) {
      const gap = startMs - prevEndMs;
      if (gap > 0) {
        node.gapText = '停留 ' + formatDuration(gap);
        node.gapFrom = prev && prev.name ? prev.name : '';
        node.gapClass = durationClassOf(gapLevelOf(gap));
      }
    } else if (isNaN(endMs) && node._status !== 'completed') {
      const hasLaterProgress = list.slice(i + 1).some(n => n && (n.startTimeRaw || n.endTimeRaw));
      if (!hasLaterProgress) {
        const gap = now - prevEndMs;
        if (gap > 0) {
          node.gapText = '等待 ' + formatDuration(gap);
          node.gapFrom = prev && prev.name ? prev.name : '';
          node.gapClass = durationClassOf(gapLevelOf(gap));
        }
      }
    }
  }
  return list;
}

/** D-284：只重算「等待」时长（页面停留期间计时，不重拉接口） */
function refreshWaitDurations(processNodes) {
  const list = Array.isArray(processNodes) ? processNodes : [];
  const now = Date.now();
  for (let i = 1; i < list.length; i++) {
    const node = list[i];
    // 节点尚未经过 mergeStageMetaIntoNodes（阶段时间未懒加载）时没有 gapText 字段，必须跳过
    if (!node || !node.gapText || String(node.gapText).indexOf('等待') !== 0) continue;
    const prev = list[i - 1];
    const prevEndMs = prev ? parseTimeMs(prev.endTimeRaw) : NaN;
    if (isNaN(prevEndMs)) continue;
    const gap = now - prevEndMs;
    node.gapText = '等待 ' + formatDuration(gap);
    node.gapClass = durationClassOf(gapLevelOf(gap));
  }
  return list;
}

/**
 * 把订单 flow 接口返回的 stages（含 processName/startTime/lastTime/completeTime）按节点归并：
 * - 匹配优先级：子工序名精确匹配 > 工序名互含
 * - D-284：startTime = 归并工序「最早一次扫码」时间（第一个人开始扫的时间）
 *          endTime   = 归并工序「最后一次扫码」时间（最后一个人扫完的时间）
 *          时间比较统一走时间戳，避免短格式字符串比较在跨年时出错
 */
function mergeStageMetaIntoNodes(processNodes, stages) {
  if (!Array.isArray(processNodes) || !Array.isArray(stages)) return processNodes;
  const cleanStages = stages.filter(s => s && String(s.processName || '').trim());
  const merged = processNodes.map(node => {
    const childNames = (node.children || []).map(c => String(c.name || '').trim()).filter(Boolean);
    const matched = cleanStages.filter(s => {
      const pn = String(s.processName || '').trim();
      if (childNames.indexOf(pn) >= 0) return true;
      if (!pn || !node.name) return false;
      return pn.indexOf(node.name) >= 0 || (node.name.indexOf(pn) >= 0 && pn.length >= 2);
    });
    let startRaw = '';
    let endRaw = '';
    let startMs = NaN;
    let endMs = NaN;
    matched.forEach(s => {
      const stRaw = normalizeTimeText(s.startTime);
      // lastTime = 该工序最后一次扫码时间（真实"最后一个人扫完"的时刻）；
      // completeTime 只在累计扫码量达到订单量时才有值，未达量为 null，不能直接当结束时间用
      const ctRaw = normalizeTimeText(s.lastTime) || normalizeTimeText(s.completeTime);
      const stMs = parseTimeMs(stRaw);
      const ctMs = parseTimeMs(ctRaw);
      if (stRaw) {
        if (!startRaw) { startRaw = stRaw; startMs = stMs; }
        else if (!isNaN(stMs) && !isNaN(startMs) && stMs < startMs) { startRaw = stRaw; startMs = stMs; }
      }
      if (ctRaw) {
        if (!endRaw) { endRaw = ctRaw; endMs = ctMs; }
        else if (!isNaN(ctMs) && !isNaN(endMs) && ctMs > endMs) { endRaw = ctRaw; endMs = ctMs; }
      }
    });
    // 单价：子工序单价（工作流配置），展示"子工序名¥x/件"，多个用 · 连接
    // _priceTextRaw 原始值保留，供 applyTenantPriceVisibility 按租户开关恢复/隐藏
    const prices = (node.children || [])
      .filter(c => Number(c.unitPrice) > 0)
      .map(c => `${c.name}¥${Number(c.unitPrice)}/件`);
    const status = nodeStatus(node.percent);
    return {
      ...node,
      _status: status,
      startTime: formatShortTime(startRaw),
      endTime: formatShortTime(endRaw),
      // 完整时间原文，供耗时/停留/等待计算与"等待"计时复用
      startTimeRaw: startRaw,
      endTimeRaw: endRaw,
      endLabel: status === 'completed' ? '完成' : '末扫',
      priceText: prices.join(' · '),
      _priceTextRaw: prices.join(' · '),
    };
  });
  return applyTimelineStatus(applyTimelineDurations(merged));
}

module.exports = {
  PRICE_FLAG_KEY,
  getTenantPriceVisible,
  cacheTenantPriceVisible,
  applyTenantPriceVisibility,
  nodeStatus,
  applyTimelineStatus,
  mergeStageMetaIntoNodes,
  formatShortTime,
  normalizeTimeText,
  parseTimeMs,
  formatDuration,
  applyTimelineDurations,
  refreshWaitDurations,
};
