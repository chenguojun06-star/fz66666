const api = require('../../../utils/api');
const { toast, safeNavigate, quickScan } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const { SAMPLE_PARENT_STAGES, SAMPLE_PROGRESS_NODE_ALIASES, getStageName } = require('../../../utils/sampleHelper');

// 6 个父阶段定义（与 PC 端 SAMPLE_PARENT_STAGES 对齐）
const PARENT_STAGES = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];

// 子工序名/progressStage → 父阶段 key 映射（参考 PC 端 resolveStageKey）
const STAGE_KEY_MAP = {
  '采购': 'procurement', '裁剪': 'cutting', '二次工艺': 'secondary',
  '车缝': 'sewing', '尾部': 'tail', '入库': 'warehousing',
  'procurement': 'procurement', 'cutting': 'cutting', 'secondary': 'secondary',
  'sewing': 'sewing', 'tail': 'tail', 'warehousing': 'warehousing',
  '缝制': 'sewing', '后整': 'tail', '下板': 'cutting', '裁床': 'cutting',
};

// operationType（英文大写）→ 中文父阶段名 映射
const OP_TYPE_TO_STAGE = {
  RECEIVE: 'procurement', PROCUREMENT: 'procurement',
  CUTTING: 'cutting', SECONDARY: 'secondary',
  SEWING: 'sewing', TAIL: 'tail',
  WAREHOUSE_IN: 'warehousing', WAREHOUSE_OUT: 'warehousing',
  PLATE: 'sewing', IRONING: 'tail',
  QUALITY: 'tail', PACKAGING: 'tail',
};

function resolveStageKey(name) {
  if (!name) return 'unknown';
  if (STAGE_KEY_MAP[name]) return STAGE_KEY_MAP[name];
  var lower = String(name).toLowerCase();
  for (var k in STAGE_KEY_MAP) {
    if (lower.indexOf(k.toLowerCase()) >= 0 || lower.indexOf(STAGE_KEY_MAP[k].toLowerCase()) >= 0) {
      return STAGE_KEY_MAP[k];
    }
  }
  return 'unknown';
}

function normalizeOpToStage(opType) {
  if (!opType) return null;
  var upper = String(opType).trim().toUpperCase();
  return OP_TYPE_TO_STAGE[upper] || null;
}

// 格式化日期：2026-07-19 12:34
function fmtDateTime(raw) {
  if (!raw) return '';
  var s = String(raw);
  if (!s) return '';
  try {
    var d = new Date(s.replace(/-/g, '/'));
    if (isNaN(d.getTime())) return s.substring(0, 16);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (_e) { return s.substring(0, 16); }
}

function fmtDateShort(raw) {
  if (!raw) return '';
  var s = fmtDateTime(raw);
  return s ? s.substring(0, 10) : '';
}

// 解析 sizeColorMatrix 为前端可渲染的结构
function parseMatrix(item) {
  var scm = item.sizeColorMatrix;
  if (!scm) return { sizes: [], rows: [] };
  var sizes = Array.isArray(scm.sizes) ? scm.sizes.map(String) : [];
  var rows = Array.isArray(scm.matrixRows) ? scm.matrixRows.map(function (r) {
    var qtyArr = Array.isArray(r.quantities) ? r.quantities : [];
    var rowTotal = qtyArr.reduce(function (s, n) { return s + (Number(n) || 0); }, 0);
    return { color: r.color || '', quantities: qtyArr, rowTotal: rowTotal };
  }) : [];
  return { sizes: sizes, rows: rows };
}

/**
 * 构建子工序进度数据（参考 PC 端 useSampleProcessProgress）
 * @param {Array} configNodes - GET /production/pattern/{id}/process-config 返回的子工序配置数组
 * @param {Array} scanRecords - GET /production/pattern/{id}/scan-records 返回的扫码记录数组
 * @param {Object} order - 订单级字段（color/size/quantity/receiver/receiveTime/completeTime）
 * @returns {{ stages: Array, needsConfig: boolean }}
 *          stages: [{ key, label, percent, completedCount, totalCount, subProcesses: [{ key, name, color, size, quantity, receiver, time, status, percent, unitPrice }] }]
 */
function buildSampleStages(configNodes, scanRecords, order) {
  if (!Array.isArray(configNodes) || configNodes.length === 0) {
    return { stages: [], needsConfig: true };
  }

  // 收集扫码记录中的已完成子工序标识
  var scannedNames = {};
  var scannedStages = {};
  (scanRecords || []).forEach(function (r) {
    if (r.success === false) return;
    if (r.processName) scannedNames[r.processName] = true;
    if (r.operationType) {
      scannedNames[r.operationType] = true;
      var stageKey = normalizeOpToStage(r.operationType);
      if (stageKey) {
        scannedNames[stageKey] = true;
        scannedStages[stageKey] = true;
      }
    }
    if (r.progressStage) scannedStages[r.progressStage] = true;
  });

  // 把配置的子工序按 progressStage 归类到 6 个父阶段
  var stageMap = {};
  configNodes.forEach(function (n, idx) {
    var stageKey = resolveStageKey(n.progressStage || n.name || '');
    if (!stageMap[stageKey]) stageMap[stageKey] = [];
    stageMap[stageKey].push({
      id: String(n.sortOrder || n.id || idx + 1),
      name: n.processName || n.operationType || '',
      processCode: n.operationType || n.processName || String(idx + 1),
      progressStage: n.progressStage || '',
      unitPrice: Number(n.unitPrice || n.price || 0),
      completed: !!scannedNames[n.processName] || !!scannedNames[n.processCode]
        || !!(n.progressStage && scannedStages[n.progressStage]),
    });
  });

  // unknown 阶段兜底归入尾部
  var unknownSubs = stageMap.unknown || [];
  if (unknownSubs.length > 0) {
    if (!stageMap.tail) stageMap.tail = [];
    stageMap.tail = stageMap.tail.concat(unknownSubs);
    delete stageMap.unknown;
  }

  // 构造 6 个父阶段结果（按 PARENT_STAGES 顺序）
  var stages = PARENT_STAGES.map(function (stage) {
    var subs = stageMap[stage.key] || [];
    var completedCount = 0;
    subs.forEach(function (sub) {
      if (sub.completed) completedCount++;
    });
    var totalCount = subs.length;
    var percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return {
      key: stage.key,
      label: stage.label,
      percent: percent,
      completedCount: completedCount,
      totalCount: totalCount,
      subProcesses: subs,
    };
  });

  return { stages: stages, needsConfig: false };
}

/**
 * 从 stages + 当前 tab 构造子工序表格行（参考 PC 端 subTableData）
 * 子工序的 receiver/time：已完成或进行中时显示订单级 receiver/receiveTime，否则不显示
 * 子工序的 color/size/quantity：使用订单级字段（与 PC 端一致）
 */
function buildSubProcessRows(stage, order) {
  if (!stage || !stage.subProcesses || stage.subProcesses.length === 0) return [];
  var isDone = stage.percent >= 100;
  var isActive = stage.percent > 0 && stage.percent < 100;
  var receiver = order.receiver || '';
  var receiveTimeShort = order._receiveTimeShort || '';
  var color = order.color || '';
  var size = order.size || '';
  var qty = stage.key === 'procurement' ? '1种面料'
    : (Number(order.quantity) > 0 ? String(order.quantity) : '-');
  return stage.subProcesses.map(function (sub) {
    var subDone = isDone || sub.completed;
    var subActive = isActive;
    return {
      key: sub.id || sub.processCode || sub.name,
      name: sub.name,
      color: color,
      size: size,
      quantity: qty,
      receiver: subDone ? receiver : (subActive ? receiver : ''),
      time: subDone ? receiveTimeShort : (subActive ? receiveTimeShort : ''),
      status: subDone ? 'completed' : (subActive ? 'in_progress' : 'pending'),
      percent: stage.percent,
      unitPrice: sub.unitPrice,
    };
  });
}

const STATUS_LABELS = {
  PENDING: '待领取',
  IN_PROGRESS: '开发中',
  PRODUCTION_COMPLETED: '已完成',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
  WAREHOUSE_OUT: '已出库',
  REWORK: '返工中',
  SCRAPPED: '已报废',
  CLOSED: '已关单',
};

const CATEGORY_MAP = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

const SEASON_MAP = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

// 完成态状态集合（与后端 calcSampleStats 对齐）
var COMPLETED_STATUSES = ['COMPLETED', 'PRODUCTION_COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT', 'CLOSED'];

function clampPercent(value) {
  var n = Number(value || 0);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeProgressNodes(raw) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function getSampleNodeProgress(item, key) {
  var nodes = normalizeProgressNodes(item.progressNodes);
  var aliases = SAMPLE_PROGRESS_NODE_ALIASES[key] || [key];
  for (var i = 0; i < aliases.length; i++) {
    var value = nodes[aliases[i]];
    if (value !== undefined && value !== null) {
      return clampPercent(value);
    }
  }
  return 0;
}

function isSampleSnapshotFullyCompleted(item) {
  var status = String(item.status || '').trim().toUpperCase();
  // 完成态状态直接返回 true（与后端 calculatePatternProgressPercent 对齐）
  if (status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED' || status === 'WAREHOUSE_IN' || status === 'WAREHOUSE_OUT') {
    return true;
  }
  var allDone = SAMPLE_PARENT_STAGES.every(function (s) {
    if (s.key === 'procurement') {
      // 采购阶段用 procurementProgress 判断（MaterialPurchase 实时聚合）
      var pp = item.procurementProgress;
      var pct = (pp && typeof pp === 'object') ? pp.percent : (pp || 0);
      return Number(pct) >= 100;
    }
    return getSampleNodeProgress(item, s.key) >= 100;
  });
  return allDone && (status === 'IN_PROGRESS');
}

function formatDate(v) {
  if (!v) return '';
  var s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function fmtDate(v) {
  if (!v) return '';
  var s = String(v);
  try {
    var parts = s.split(/[-T :]/);
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  try {
    var due = new Date(String(dateStr).replace(/-/g, '/'));
    var now = new Date();
    var diff = (due - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= days;
  } catch (_e) { return false; }
}

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.indexOf(String(status || '').trim().toUpperCase()) >= 0;
}

// 前端筛选：根据 tab.key 从全量列表筛选
function filterByTab(allList, tabKey) {
  if (!tabKey) return allList;
  if (tabKey === 'IN_PROGRESS') {
    // 开发中 = 所有未完成（排除已完成/已入库/已关单/已报废）
    return allList.filter(function (item) {
      return !isCompletedStatus(item.status) && item.status !== 'SCRAPPED';
    });
  }
  if (tabKey === 'COMPLETED') {
    // 已完成 = COMPLETED + PRODUCTION_COMPLETED + WAREHOUSE_IN + CLOSED
    return allList.filter(function (item) {
      return isCompletedStatus(item.status);
    });
  }
  if (tabKey === 'OVERDUE') {
    return allList.filter(function (item) { return item._overdue; });
  }
  if (tabKey === 'WARNING') {
    return allList.filter(function (item) { return item._nearDue; });
  }
  return allList;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    statusTabs: [
      { key: '', label: '全部', color: 'primary', count: 0 },
      { key: 'IN_PROGRESS', label: '开发中', color: 'primary', count: 0 },
      { key: 'COMPLETED', label: '已完成', color: 'success', count: 0 },
      { key: 'OVERDUE', label: '已延期', color: 'danger', count: 0 },
      { key: 'WARNING', label: '临近交期', color: 'warning', isSmart: true, count: 0 },
    ],
    list: [],
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,
  },

  onLoad: function () {
    this._allList = [];
    this._filteredList = [];
    this.loadData(true);
  },

  onShow: function () {
    if (this._loaded) {
      this.loadData(true);
    }
    this._loaded = true;
    this._bindEvents();
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  onPullDownRefresh: function () {
    var self = this;
    self.loadData(true).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    var nextPage = this.data.page + 1;
    var pageSize = this.data.pageSize;
    var endIdx = nextPage * pageSize;
    var filtered = this._filteredList || [];
    var displayList = filtered.slice(0, endIdx);
    this.setData({
      list: displayList,
      page: nextPage,
      hasMore: endIdx < filtered.length,
      loadingMore: false,
    });
  },

  _bindEvents: function () {
    var that = this;
    this._onRefresh = function () {
      that.loadData(true);
    };
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents: function () {
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  // 从全量列表计算各筛选标签数量 + 执行筛选 + 分页
  _updateCountsAndFilter: function () {
    var that = this;
    var allList = this._allList || [];

    // 计算各状态数量
    var inProgressCount = 0;
    var completedCount = 0;
    var overdueCount = 0;
    var warningCount = 0;
    allList.forEach(function (item) {
      if (isCompletedStatus(item.status)) {
        completedCount++;
      } else if (item.status !== 'SCRAPPED') {
        inProgressCount++;
      }
      if (item._overdue) overdueCount++;
      if (item._nearDue) warningCount++;
    });
    var totalCount = allList.length;

    // 更新筛选标签数量
    var tabs = this.data.statusTabs.map(function (tab) {
      var count = 0;
      if (tab.key === '') count = totalCount;
      else if (tab.key === 'IN_PROGRESS') count = inProgressCount;
      else if (tab.key === 'COMPLETED') count = completedCount;
      else if (tab.key === 'OVERDUE') count = overdueCount;
      else if (tab.key === 'WARNING') count = warningCount;
      return Object.assign({}, tab, { count: count });
    });

    // 执行筛选
    var filtered = filterByTab(allList, this.data.activeFilter);
    this._filteredList = filtered;

    // 分页
    var pageSize = this.data.pageSize;
    var displayList = filtered.slice(0, pageSize);

    this.setData({
      statusTabs: tabs,
      list: displayList,
      total: filtered.length,
      page: 1,
      hasMore: filtered.length > pageSize,
      loading: false,
      loadingMore: false,
    });
  },

  loadData: function (reset) {
    var that = this;
    if (reset) {
      that.setData({ loading: true });
    }

    // 全量加载（不分页、不传 status），前端统一筛选和计数
    var params = { page: 1, size: 500 };
    if (that.data.keyword.trim()) params.keyword = that.data.keyword.trim();

    return api.production.listPatterns(params)
      .then(function (res) {
        var data = res;
        var records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);

        // 处理每条记录
        var allList = records.map(function (item) {
          // 从嵌套 styleInfo 中提取字段（后端 enrichRecord 返回）
          var si = item.styleInfo || {};
          // 款号/款名优先从顶层取，没有则从 styleInfo 嵌套对象取
          item._styleNo = item.styleNo || si.styleNo || '';
          item._styleName = item.styleName || si.styleName || '';
          item._cover = getAuthedImageUrl(item.coverImage || si.cover || '');
          item._statusLabel = STATUS_LABELS[item.status] || item.status || '-';
          item._statusColor = that.getStatusColorClass(item.status);
          item._deliveryDate = formatDate(item.deliveryTime);
          item._createDate = formatDate(item.releaseTime || item.createTime);
          item._deliveryTag = fmtDate(item.deliveryTime);
          item._receiveTimeShort = fmtDateTime(item.receiveTime);
          item._completeTimeShort = fmtDateTime(item.completeTime);
          item.expanded = false;
          // 多码多色矩阵
          item._matrix = parseMatrix(item);
          // 配置好的子工序列表（展开时按需加载）
          item._configLoading = false;
          item._needsConfig = false;
          item._stages = [];
          item._activeStage = '';
          item._currentSubProcesses = [];
          item._configLoaded = false;
          // 数量
          item._quantity = item.quantity || si.sampleQuantity || '';
          item._overdue = false;
          item._nearDue = false;
          item._daysLeftText = '';
          if (item.deliveryTime && !isCompletedStatus(item.status)) {
            try {
              var now = new Date();
              var due = new Date(String(item.deliveryTime).replace(/-/g, '/'));
              var diffMs = due - now;
              var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays < 0) {
                item._overdue = true;
                item._daysLeftText = '延期' + Math.abs(diffDays) + '天';
              } else if (diffDays === 0) {
                item._nearDue = true;
                item._daysLeftText = '今天交板';
              } else if (diffDays <= 3) {
                item._nearDue = true;
                item._daysLeftText = '剩' + diffDays + '天';
              } else {
                item._daysLeftText = '剩' + diffDays + '天';
              }
            } catch (_e) { /* ignore */ }
          }

          // 元信息行1：客户 · 跟单 · 品类 · 季节
          var meta1Parts = [];
          var customer = item.customer || si.customer || item.company || si.company || item.brandName || '';
          if (customer) meta1Parts.push(customer);
          var merchandiser = item.merchandiser || item.merchandiserName || si.merchandiser || '';
          if (merchandiser) meta1Parts.push('跟单: ' + merchandiser);
          var category = item.category || si.category || '';
          if (category && CATEGORY_MAP[category]) category = CATEGORY_MAP[category];
          if (category) meta1Parts.push(category);
          var season = item.season || si.season || '';
          if (season && SEASON_MAP[season]) season = SEASON_MAP[season];
          if (season) meta1Parts.push(season);
          item._metaLine1 = meta1Parts.join(' · ');

          // 元信息行2：颜色 · 尺码
          var meta2Parts = [];
          var color = item.color || si.color || '';
          if (color) meta2Parts.push(color);
          var sizes = item.sizes || item.sizeRange || si.size || si.sizes || si.sizeRange || '';
          if (sizes) meta2Parts.push(sizes);
          item._metaLine2 = meta2Parts.join(' · ');

          // 进度计算
          var completed = isSampleSnapshotFullyCompleted(item);
          var statusUpper = String(item.status || '').trim().toUpperCase();
          var received = ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT'].indexOf(statusUpper) >= 0
            || Boolean(item.receiver)
            || !!item.receiveTime;
          var procurementProgress = clampPercent(
            Number(
              (item.procurementProgress && typeof item.procurementProgress === 'object'
                ? item.procurementProgress.percent
                : item.procurementProgress) || 0,
            ),
          );

          var totalPercent = 0;
          item._devStages = SAMPLE_PARENT_STAGES.map(function (s) {
            var percent;
            if (completed) {
              percent = 100;
            } else if (s.key === 'procurement') {
              percent = procurementProgress;
            } else if (received) {
              percent = getSampleNodeProgress(item, s.key);
            } else {
              percent = 0;
            }
            totalPercent += percent;
            return {
              key: s.key,
              name: s.name,
              completed: percent >= 100,
              percent: percent,
            };
          });

          item._devDoneCount = item._devStages.filter(function (s) { return s.completed; }).length;
          item._devTotalCount = item._devStages.length;
          item._progressPercent = item._devTotalCount > 0
            ? Math.round(totalPercent / item._devTotalCount)
            : 0;

          return item;
        });

        that._allList = allList;
        that._updateCountsAndFilter();
      })
      .catch(function () {
        that.setData({ loading: false, loadingMore: false });
        if (reset) toast.error('加载失败');
      });
  },

  getStatusColorClass: function (status) {
    var map = {
      PENDING: 'var(--color-warning)',
      IN_PROGRESS: 'var(--color-primary)',
      PRODUCTION_COMPLETED: 'var(--color-success)',
      COMPLETED: 'var(--color-success)',
      WAREHOUSE_IN: 'var(--color-text-tertiary)',
      WAREHOUSE_OUT: 'var(--color-text-tertiary)',
      REWORK: 'var(--color-danger)',
      SCRAPPED: 'var(--color-text-tertiary)',
      CLOSED: 'var(--color-text-tertiary)',
    };
    return map[status] || 'var(--color-text-tertiary)';
  },

  onSearchInput: function (e) {
    var val = (e.detail.value || '').trim();
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.clear) val = '';
    this.setData({ keyword: val });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(this._doSearch.bind(this), 400);
  },

  onSearchClear: function () {
    this.setData({ keyword: '' });
    this._doSearch();
  },

  _doSearch: function () {
    this.loadData(true);
  },

  onFilterTap: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    // 纯前端筛选，不需要重新请求后端
    this._updateCountsAndFilter();
  },

  onCardTap: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;
    var styleId = item.styleId || '';
    var patternId = item.id || '';
    if (!styleId && !patternId) return;
    var param = styleId ? 'styleId=' + encodeURIComponent(styleId) : 'id=' + encodeURIComponent(patternId);
    safeNavigate({
      url: '/pages/sample-development/detail/index?' + param,
    }).catch(function () {});
  },

  // 切换卡片展开/收起子工序
  onCardToggle: function (e) {
    var that = this;
    var idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.data.list.length) return;
    var item = this.data.list[idx];
    var newExpanded = !item.expanded;

    var path = 'list[' + idx + '].expanded';
    this.setData({ [path]: newExpanded });

    // 展开且未加载过子工序配置时按需加载
    if (newExpanded && !item._configLoaded && !item._configLoading) {
      var patternId = item.id || item.patternId;
      if (!patternId) {
        this.setData({
          ['list[' + idx + ']._configLoaded']: true,
          ['list[' + idx + ']._needsConfig']: true,
        });
        return;
      }
      this.setData({ ['list[' + idx + ']._configLoading']: true });
      Promise.all([
        api.production.getPatternProcessConfig(patternId),
        api.production.getPatternScanRecords(patternId),
      ]).then(function (results) {
        var configNodes = (results[0] && results[0].data) || results[0] || [];
        if (!Array.isArray(configNodes)) configNodes = [];
        var scanRecords = (results[1] && results[1].data) || results[1] || [];
        if (!Array.isArray(scanRecords)) scanRecords = [];
        var built = buildSampleStages(configNodes, scanRecords, item);
        // 默认选第一个有子工序的 tab
        var activeStage = '';
        for (var i = 0; i < built.stages.length; i++) {
          if (built.stages[i].totalCount > 0) {
            activeStage = built.stages[i].key;
            break;
          }
        }
        if (!activeStage && built.stages.length > 0) {
          activeStage = built.stages[0].key;
        }
        var currentSubs = [];
        if (activeStage) {
          var stageObj = built.stages.find(function (s) { return s.key === activeStage; });
          currentSubs = buildSubProcessRows(stageObj, item);
        }
        that.setData({
          ['list[' + idx + ']._stages']: built.stages,
          ['list[' + idx + ']._needsConfig']: built.needsConfig,
          ['list[' + idx + ']._activeStage']: activeStage,
          ['list[' + idx + ']._currentSubProcesses']: currentSubs,
          ['list[' + idx + ']._configLoading']: false,
          ['list[' + idx + ']._configLoaded']: true,
        });
      }).catch(function () {
        that.setData({
          ['list[' + idx + ']._stages']: [],
          ['list[' + idx + ']._needsConfig']: true,
          ['list[' + idx + ']._configLoading']: false,
          ['list[' + idx + ']._configLoaded']: true,
        });
      });
    }
  },

  // 切换父阶段 tab，重新构造当前 tab 下的子工序列表
  onStageTabTap: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var stageKey = e.currentTarget.dataset.stage;
    if (Number.isNaN(idx) || idx < 0 || idx >= this.data.list.length) return;
    var item = this.data.list[idx];
    if (!stageKey || stageKey === item._activeStage) return;
    var stageObj = (item._stages || []).find(function (s) { return s.key === stageKey; });
    if (!stageObj) return;
    var currentSubs = buildSubProcessRows(stageObj, item);
    this.setData({
      ['list[' + idx + ']._activeStage']: stageKey,
      ['list[' + idx + ']._currentSubProcesses']: currentSubs,
    });
  },

  onScan: function () {
    quickScan();
  },

  onPreviewImage: function (e) {
    var url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
});
