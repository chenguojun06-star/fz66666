const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const permission = require('../../../utils/permission');
const { DEBUG } = require('../../../config/debug');

/* === 与 PC 端 StyleInfoList 一致的状态显示逻辑 === */

// PC 端同款：getProgressNodeColor —— 用中文关键字做颜色匹配
// Ant Design Tag 颜色：default / success / warning / error / processing
function getProgressNodeColor(node) {
  if (!node) return 'default';
  const s = String(node);
  if (/开发样报废|样衣报废|已报废/.test(s)) return 'default';
  if (/报废|驳回|不通过|异常|失败/.test(s)) return 'error';
  if (/返修|紧急/.test(s)) return 'warning';
  if (/完成|通过/.test(s)) return 'success';
  if (/中|待审|确认/.test(s)) return 'processing';
  return 'default';
}

// PC 端同款：getDeliveryMeta —— 计算交期状态
// tone: 'scrapped' | 'danger' | 'warning' | 'normal' | 'success'
function getDeliveryMeta(record, allStagesCompleted) {
  if (!record) return { tone: 'normal', label: '' };
  const sampleStatus = String(record.sampleStatus || record.status || '').trim().toUpperCase();
  if (sampleStatus === 'SCRAPPED') return { tone: 'scrapped', label: '已报废' };
  if (sampleStatus === 'CLOSED') return { tone: 'scrapped', label: '已关单' };
  if (sampleStatus === 'COMPLETED' || sampleStatus === 'WAREHOUSE_IN') return { tone: 'success', label: '已完成' };
  if (allStagesCompleted) {
    return { tone: 'success', label: '已完成' };
  }
  const deliveryDate = record.deliveryDate || record.deliveryTime;
  if (!deliveryDate) return { tone: 'normal', label: '待补交期' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // iOS 兼容：'yyyy-MM-dd HH:mm:ss' 在 iOS 下无法解析，需替换为 'yyyy/MM/dd HH:mm:ss'
  const target = new Date(String(deliveryDate).replace(/-/g, '/'));
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { tone: 'danger', label: `延期${Math.abs(diffDays)}天` };
  if (diffDays <= 3) return { tone: 'warning', label: `${diffDays}天内交板` };
  return { tone: 'normal', label: `${diffDays}天后交板` };
}

// 样衣审核状态标签（PC 端同款）
const REVIEW_STATUS_LABELS = {
  'APPROVED': '已通过',
  'REJECTED': '已驳回',
  'PENDING': '待审核',
  'IN_REVIEW': '审核中',
  'DRAFT': '草稿',
  'SUBMITTED': '已提交',
};

// 开发来源中文映射（后端返回英文枚举，前端映射为中文）
const SOURCE_TYPE_LABELS = {
  'SELF_DEVELOPED': '自主开发',
  'SELECTION_CENTER': '选品中心',
  'MARKET': '市场采购',
  'SUPPLIER': '供应商提供',
  'CUSTOMER': '客户定制',
  'INTERNAL': '内部选品',
  'SAMPLE': '样衣开发',
  'BULK': '大货',
  'PATTERN': '纸样开发',
  'EXTERNAL': '外部市场',
  'BUYER': '买手采购',
};

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING', label: '待领取' },
  { key: 'IN_PROGRESS', label: '制作中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'WAREHOUSE_IN', label: '已入库' },
];

const DEV_STAGES = [
  { key: 'bom', name: 'BOM' },
  { key: 'pattern', name: '纸样' },
  { key: 'process', name: '单价' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'production', name: '生产制单' },
];

function formatDate(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function fmtDate(v) {
  if (!v) return '';
  const s = String(v);
  try {
    const parts = s.split(/[-T :]/);
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

/** 格式化为 MM-DD HH:mm（完整时间，去掉年份） */
function fmtDateTime(v) {
  if (!v) return '';
  const s = String(v);
  try {
    // 支持 YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss
    const parts = s.split(/[-T :]/);
    if (parts.length >= 5) {
      return parts[1] + '-' + parts[2] + ' ' + parts[3] + ':' + parts[4];
    }
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    statusTabs: STATUS_TABS,
    // 样衣开发统计（与 PC 端 activeStyles 逻辑一致）
    sampleCount: 0,       // 开发中（活跃款式数量）
    completedCount: 0,    // 已完成
    overdueCount: 0,      // 已延期
    warningCount: 0,      // 临近交期
    smartFilter: '',      // 智能筛选：'' | 'overdue' | 'warning'

    list: [],
    displayList: [],  // 应用智能筛选后的展示列表
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,

    expandedId: '',
    patternDetail: null,
    detailLoading: false,
    roleHint: '',
    // 工序配置与展示
    processConfig: [],
    processStages: [],
    hasProcessSystem: false,
  },

  onLoad: function () {
    if (!permission.canReceiveTask('sample')) {
      this.setData({ roleHint: `您当前职务「${permission.getRoleDisplayName()}」非样衣岗，如需代领请知会主管` });
    }
    this.loadData(true);
  },

  onShow: function () {
    // 第一次进入页面时不重复加载（onLoad 已经 loadData 过了）
    // 从别的页面跳回来时，如果有 _needRefresh 标记才刷新
    if (this._loaded) {
      if (this._needRefresh) {
        this._needRefresh = false;
        this.loadData(true);
      }
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
    const self = this;
    Promise.resolve(self.loadData(true)).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadData(false);
    }
  },

  _bindEvents: function () {
    const that = this;
    this._onRefresh = function () { that.loadData(true); };
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents: function () {
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  loadData: function (reset) {
    const that = this;
    if (reset) {
      that.setData({ loading: true, page: 1, list: [] });
    } else {
      that.setData({ loadingMore: true });
    }

    const params = {
      page: that.data.page,
      size: that.data.pageSize,
    };
    if (that.data.keyword.trim()) params.keyword = that.data.keyword.trim();
    if (that.data.activeFilter) params.status = that.data.activeFilter;

    // 并行获取样衣开发统计（与 PC 端 activeStyles 逻辑一致）
    if (reset) {
      api.production.getSampleStats().then(function (res) {
        const d = (res && res.data) || res || {};
        that.setData({
          sampleCount: Number(d.activeCount) || 0,
          completedCount: Number(d.completedCount) || 0,
          overdueCount: Number(d.overdueCount) || 0,
          warningCount: Number(d.warningCount) || 0,
        });
      }).catch(function () { /* 静默失败，不阻塞列表 */ });
    }

    api.production.listPatterns(params)
      .then(function (res) {
        const data = res && res.data ? res.data : res;
        const records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);

        // 调试日志：看 createBy 是否在后端有值（Console 查看）
        if (DEBUG && records.length > 0) {
          console.log('[sample-dev] 样衣列表首条 createBy=' + (records[0].createBy || '无') + ', receiver=' + (records[0].receiver || '无'));
        }

        const total = Number(data && data.total) || records.length;

        const list = records.map(function (item) {
          const styleInfo = item.styleInfo || {};
          // ========== 与 PC 端一致：progressNode 作为主状态 ==========
          // 优先用 styleInfo.progressNode（款式维度），其次用 item.progressNode（样衣任务维度），
          // 再兜底到 styleInfo.sampleStatus / item.status（英文枚举）做中文映射
          let progressNode = String(
            styleInfo.progressNode || item.progressNode || styleInfo.sampleStatus || item.status || '未开始'
          ).trim() || '未开始';

          // 如果是英文枚举（PENDING/IN_PROGRESS 等），做一次 fallback 中文转换
          const upperStatus = progressNode.toUpperCase();
          const EN_TO_CN = {
            PENDING: '待领取',
            IN_PROGRESS: '制作中',
            PROGRESS: '制作中',
            COMPLETED: '已完成',
            WAREHOUSE_IN: '已入库',
            ENABLED: '启用',
            ACTIVE: '启用',
            DISABLED: '已停用',
            REVIEW_PENDING: '待审核',
            REVIEWED: '已审核',
            APPROVED: '已通过',
            REJECTED: '已驳回',
            CANCELLED: '已取消',
            CANCELED: '已取消',
            SCRAPPED: '样衣报废',
            CLOSED: '已关单',
          };
          if (EN_TO_CN[upperStatus]) progressNode = EN_TO_CN[upperStatus];
          item._progressNode = progressNode;
          item._progressColor = getProgressNodeColor(progressNode);

          // ========== 与 PC 端一致：交期信息（次要标签） ==========
          const deliveryMeta = getDeliveryMeta(
            { deliveryDate: item.deliveryDate || styleInfo.deliveryDate || item.deliveryTime, sampleStatus: item.sampleStatus || styleInfo.sampleStatus, status: item.status },
            false
          );
          item._deliveryTone = deliveryMeta.tone;
          item._deliveryLabel = deliveryMeta.label;

          // ========== 基础字段：颜色 / 码数 / 数量 ==========
          /** 将任意值转为规范显示字符串（数组用/或,连接） */
          function normalizeVal(v, sep) {
            sep = sep || '/';
            if (!v) return '';
            if (Array.isArray(v)) return v.filter(function (x) { return x != null && x !== ''; }).join(sep);
            var s = String(v);
            if (s.startsWith('[')) {
              try { return normalizeVal(JSON.parse(s), sep); } catch (e) { return s; }
            }
            // 逗号分隔的字符串也展开
            if (s.indexOf(',') !== -1) return s.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; }).join(sep);
            return s;
          }

          item._color = normalizeVal(item.color || styleInfo.color || styleInfo.colorName || item.sampleColor || styleInfo.sampleColor || '', ',');
          item._size = normalizeVal(item.size || styleInfo.size || styleInfo.sizeName || '', '/');
          const qtyCandidates = [item.quantity, styleInfo.quantity, item.sampleQuantity, styleInfo.sampleQuantity, item.totalQuantity, item.orderQuantity];
          item._quantity = qtyCandidates.find(function (v) { return typeof v === 'number' && v > 0; }) || 0;

          // ========== 图片 / 款号 / 款名 ==========
          item._cover = getAuthedImageUrl(item.coverImage || styleInfo.coverImage || styleInfo.cover || '');
          const styleNoCandidates = [item.styleNo, styleInfo.styleNo, styleInfo.styleCode, item.patternNo, item.patternCode];
          item._styleNo = styleNoCandidates.find(function (v) { return v != null && v !== ''; }) || '';
          item._styleName = item.styleName || styleInfo.styleName || item.name || '';

          // ========== 与 PC 端一致的 metaItems：来源 / 品类 / 季节 / 客户 / 版师 ==========
          const customerCandidates = [item.customer, styleInfo.customer, item.customerName, styleInfo.customerName, item.buyer, styleInfo.buyer];
          item._customer = customerCandidates.find(function (v) { return v != null && String(v).trim() !== ''; }) || '';
          item._category = item.category || styleInfo.category || '';
          const rawSourceType = item.developmentSourceType || styleInfo.developmentSourceType || item.sourceType || styleInfo.sourceType || '';
          item._sourceType = rawSourceType ? (SOURCE_TYPE_LABELS[rawSourceType] || '其他') : '';
          item._season = item.season || styleInfo.season || '';
          item._patternMaker = item.patternMaker || styleInfo.patternDeveloper || item.receiver || '';
          item._receiver = item.receiver || '';
          item._creator = item.createBy || ''; // 创建人

          // ========== 时间字段 ==========
          item._deliveryDate = formatDate(item.deliveryTime || styleInfo.deliveryTime);
          item._deliveryTimeFull = fmtDateTime(item.deliveryTime || styleInfo.deliveryTime);
          item._createDate = formatDate(item.releaseTime || item.createTime);
          item._completeDate = formatDate(item.completeTime);
          item._deliveryDateShort = item._deliveryDate ? item._deliveryDate.substring(5) : '';
          item._createDateShort = item._createDate ? item._createDate.substring(5) : '';

          // ========== 开发阶段（只读，用于展示进度） ==========
          item._expanded = false;
          item._devStages = DEV_STAGES.map(function (s) {
            return {
              key: s.key,
              name: s.name,
              completed: !!(item[s.key + 'CompletedTime'] || (styleInfo && styleInfo[s.key + 'CompletedTime'])),
            };
          });
          item._devDoneCount = item._devStages.filter(function (s) { return s.completed; }).length;
          item._devTotalCount = item._devStages.length;
          // 进度百分比（0-100）
          item._progressPct = item._devTotalCount ? Math.round((item._devDoneCount / item._devTotalCount) * 100) : 0;

          return item;
        });

        const merged = reset ? list : (that.data.list || []).concat(list);
        const seen = new Set();
        const newList = merged.filter(function (item) {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        that.setData({
          list: newList,
          displayList: newList,  // 默认展示全部，smartFilter 切换时再过滤
          total: total,
          hasMore: newList.length < total,
          loading: false,
          loadingMore: false,
          page: reset ? 1 : that.data.page + 1,
        });
        // 若已有智能筛选，应用过滤
        if (that.data.smartFilter) {
          that._refreshDisplayList();
        }
      })
      .catch(function (err) {
        that.setData({ loading: false, loadingMore: false });
        const msg = (err && err.message) || '';
        if (reset) {
          if (msg.includes('timeout')) toast.error('加载超时，请检查网络');
          else toast.error('加载失败');
        }
      });
  },

  onSearchInput: function (e) {
    let val = (e.detail.value || '').trim();
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
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this.loadData(true);
  },

  /**
   * 智能筛选标签点击（与 PC 端 smartFilter 逻辑一致）
   * 点击「已延期」→ 只看 _deliveryTone==='danger' 的款号
   * 点击「临近交期」→ 只看 _deliveryTone==='warning' 的款号
   * 点击「已完成」→ 只看 _deliveryTone==='success' 的款号
   * 再次点击同一标签 → 取消筛选
   */
  onSmartFilterTap: function (e) {
    const target = e.currentTarget.dataset.key; // 'overdue' | 'warning' | 'completed'
    const current = this.data.smartFilter;
    if (current === target) {
      // 再次点击同一标签 → 取消筛选
      this.setData({ smartFilter: '' });
    } else {
      this.setData({ smartFilter: target });
    }
    this._refreshDisplayList();
  },

  /** 清除智能筛选 */
  onClearSmartFilter: function () {
    this.setData({ smartFilter: '' });
    this._refreshDisplayList();
  },

  /**
   * 应用智能筛选后返回展示列表（与 PC 端 displayData 逻辑一致）
   * smartFilter='overdue' → 只显示 _deliveryTone==='danger' 的记录
   * smartFilter='warning' → 只显示 _deliveryTone==='warning' 的记录
   * smartFilter='completed' → 只显示 _deliveryTone==='success' 的记录
   * smartFilter='' → 显示全部
   */
  _getDisplayList: function () {
    const sf = this.data.smartFilter;
    if (!sf) return this.data.list;
    return this.data.list.filter(function (item) {
      if (sf === 'overdue') return item._deliveryTone === 'danger';
      if (sf === 'warning') return item._deliveryTone === 'warning';
      if (sf === 'completed') return item._deliveryTone === 'success';
      return true;
    });
  },

  /** smartFilter 变化时刷新展示列表 */
  _refreshDisplayList: function () {
    this.setData({ displayList: this._getDisplayList() });
  },

  onCardTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const expandedId = this.data.expandedId === id ? '' : id;
    this.setData({ expandedId: expandedId });

    if (expandedId) {
      this.loadDetail(id);
    } else {
      this.setData({ patternDetail: null, processConfig: [], processStages: [], hasProcessSystem: false });
    }
  },

  loadDetail: function (patternId) {
    const that = this;
    that.setData({ detailLoading: true });
    const detailPromise = api.production.getPatternDetail(patternId);
    const configPromise = api.production.getPatternProcessConfig(patternId);
    const recordsPromise = api.production.getPatternScanRecords(patternId);
    // 工序单价（款式维度）
    const processPromise = api.production.listStyleProcesses(patternId)
      .catch(function () { return []; });

    Promise.all([detailPromise, configPromise, recordsPromise, processPromise])
      .then(function (results) {
        const detail = results[0] && results[0].data ? results[0].data : results[0];
        if (detail.reviewStatus) {
          detail._reviewStatusLabel = REVIEW_STATUS_LABELS[detail.reviewStatus] || detail.reviewStatus;
        }
        const config = Array.isArray(results[1]) ? results[1] : (results[1] && results[1].data ? (Array.isArray(results[1].data) ? results[1].data : []) : []);
        const records = Array.isArray(results[2]) ? results[2] : (results[2] && results[2].data ? (Array.isArray(results[2].data) ? results[2].data : []) : []);
        const processList = Array.isArray(results[3]) ? results[3] : (results[3] && results[3].data ? (Array.isArray(results[3].data) ? results[3].data : []) : []);

        const stages = that._buildProcessStages(config, records, detail);

        // 更新列表中对应项的数量
        const list = that.data.list.map(function (item) {
          if (String(item.id) === String(patternId)) {
            return Object.assign({}, item, {
              _bomCount: detail.bomItemCount || detail.bomCount || 0,
              _patternCount: detail.patternRevisionCount || detail.revisionCount || 0,
              _processCount: processList.length || 0,
              _secondaryCount: detail.secondaryProcessCount || 0,
              _productionCount: detail.productionSheetCount || 0,
            });
          }
          return item;
        });

        that.setData({
          list: list,
          patternDetail: detail,
          processConfig: config,
          processStages: stages,
          hasProcessSystem: config.length > 0,
          detailLoading: false,
        });
      })
      .catch(function (err) {
        that.setData({ detailLoading: false });
        const msg = (err && err.message) || '';
        if (msg.includes('timeout')) toast.error('加载超时，请重试');
        else toast.error('加载失败');
      });
  },

  _buildProcessStages: function (config, records, patternDetail) {
    if (!config || !Array.isArray(config) || config.length === 0) {
      return [];
    }

    const completedSet = new Set();
    if (records && Array.isArray(records)) {
      records.forEach(function (r) {
        const op = String(r.operationType || '').trim();
        const pn = String(r.processName || '').trim();
        const ps = String(r.progressStage || '').trim();
        if (op) completedSet.add(op);
        if (pn) completedSet.add(pn);
        if (ps) completedSet.add(ps);
        // 规范化 key
        completedSet.add(op.toLowerCase());
        completedSet.add(pn.toLowerCase());
      });
    }

    const status = String(patternDetail.status || '').toUpperCase();

    // 按 PC 端工序配置构建工序列表（不自动加"领取样衣"或"入库"）
    const stages = [];

    // 找到第一个尚未完成的工序索引（用于判断可操作性）
    let firstIncompleteIdx = -1;

    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const processName = String(c.processName || c.operationType || '').trim();
      const progressStage = String(c.progressStage || processName).trim();
      const scanType = String(c.scanType || 'production').trim();
      const isCompleted = completedSet.has(processName) || completedSet.has(progressStage) || completedSet.has(progressStage.toLowerCase());

      // 查找完成时间 + 操作人
      let time = '';
      let operatorName = '';
      let operatorRole = '';
      if (records && Array.isArray(records)) {
        for (let j = 0; j < records.length; j++) {
          const r = records[j];
          const rOp = String(r.operationType || '').trim();
          const rPn = String(r.processName || '').trim();
          if ((rOp === processName || rPn === processName) && r.scanTime) {
            time = fmtDate(r.scanTime);
            operatorName = r.operatorName || '';
            operatorRole = r.operatorRole || '';
            break;
          }
        }
      }

      // 可操作判断：该工序尚未完成，且前面的工序都已完成
      let canOperate = false;
      let locked = false;
      let lockReason = '';

      if (!isCompleted) {
        if (firstIncompleteIdx === -1) {
          firstIncompleteIdx = i;
        }
        // 只有第一个未完成的工序可以操作
        if (firstIncompleteIdx === i) {
          // 检查前面的工序是否都完成了
          let prevAllDone = true;
          for (let j = 0; j < i; j++) {
            const prev = config[j];
            const prevName = String(prev.processName || prev.operationType || '').trim();
            const prevDone = completedSet.has(prevName) || completedSet.has(String(prev.progressStage || prevName).trim());
            if (!prevDone) {
              prevAllDone = false;
              break;
            }
          }
          if (prevAllDone) {
            canOperate = true;
          } else {
            locked = true;
            lockReason = '需先完成前置工序';
          }
        } else {
          locked = true;
          lockReason = '需先完成前置工序';
        }
      }

      // 从 patternDetail 提取通用基础字段（每个工序展示同样的基础信息）
      const colorCandidates = [patternDetail.color, patternDetail.colorName, patternDetail.sampleColor, patternDetail.colour];
      const baseColor = colorCandidates.find(function (v) { return v != null && v !== ''; }) || '';
      let baseSize = patternDetail.size || patternDetail.sizeName || '';
      if (!baseSize && Array.isArray(patternDetail.sizes) && patternDetail.sizes.length) baseSize = patternDetail.sizes.join('/');
      const qtyCandidates = [patternDetail.quantity, patternDetail.sampleQuantity, patternDetail.totalQuantity, patternDetail.orderQuantity];
      const baseQuantity = qtyCandidates.find(function (v) { return typeof v === 'number' && v > 0; }) || 0;

      stages.push({
        name: processName,
        processName: processName,
        progressStage: progressStage,
        scanType: scanType,
        completed: isCompleted,
        time: time,
        operatorName: operatorName,
        operatorRole: operatorRole,
        canOperate: canOperate,
        locked: locked,
        lockReason: lockReason,
        isReceive: false,
        color: baseColor,
        size: baseSize,
        quantity: baseQuantity,
      });
    }

    // 注意：入库等操作完全依赖 PC 端工序配置，不再自动追加
    return stages;
  },

  onGoDetail: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    const styleId = item.styleId || '';
    const patternId = item.id || '';
    if (!styleId && !patternId) return;
    const param = styleId ? 'styleId=' + encodeURIComponent(styleId) : 'id=' + encodeURIComponent(patternId);
    safeNavigate({
      url: '/pages/sample-development/detail/index?' + param,
    }).catch(() => {});
  },

  // 顶部扫码按钮：扫码识别样衣，进入扫码页
  onTopScan: function () {
    const that = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        const scanCode = res.result || '';
        if (!scanCode) {
          toast.error('扫码内容为空');
          return;
        }
        // 解析 patternId：支持 JSON / URL参数 / 纯id 三种格式
        // 修复 P0：扫 JSON 二维码 {"type":"pattern","id":"xxx"} 时
        // 旧逻辑把整个 JSON 当 patternId 传给扫码页，导致后端 400
        let patternId = scanCode;
        const trimmed = scanCode.trim();
        // 1) JSON 格式 {"type":"pattern","id":"xxx"}
        if (trimmed.charAt(0) === '{') {
          try {
            const obj = JSON.parse(trimmed);
            const id = obj.id || obj.patternId || obj.patternProductionId || obj.orderId;
            if (id) patternId = String(id);
          } catch (_e) { /* 解析失败，回退到原 scanCode */ }
        } else {
          // 2) URL 参数格式 ?patternId=xxx
          const match = scanCode.match(/[?&]patternId=([^&]+)/);
          if (match && match[1]) {
            try { patternId = decodeURIComponent(match[1]); } catch (_e) { patternId = match[1]; }
          }
        }
        // 跳转扫码页，让扫码页自己获取工序配置
        safeNavigate({
          url: '/pages/scan/pattern/index?patternId=' + encodeURIComponent(patternId) + '&scanCode=' + encodeURIComponent(scanCode),
        }).catch(function () {});
      },
      fail: function () {
        // 用户取消不提示
      }
    });
  },

  // 点击工序项：直接跳转到扫码页，让扫码页自己获取工序配置
  onProcessOperate: function (e) {
    const stage = e.currentTarget.dataset.stage;
    const patternId = e.currentTarget.dataset.patternId || this.data.expandedId;
    if (!stage || !patternId) return;

    if (stage.locked) {
      toast.error(stage.lockReason || '前置工序未完成');
      return;
    }
    if (!stage.canOperate) {
      if (stage.completed) {
        toast.error('该工序已完成');
      }
      return;
    }

    // 跳转到扫码页，带上指定工序名，扫码页自动定位到该工序
    const param = 'patternId=' + encodeURIComponent(patternId) +
      '&manual=1' +
      '&processName=' + encodeURIComponent(stage.processName || '') +
      '&progressStage=' + encodeURIComponent(stage.progressStage || '') +
      '&scanType=' + encodeURIComponent(stage.scanType || '');
    safeNavigate({
      url: '/pages/scan/pattern/index?' + param,
    }).catch(function () {});
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onLoadMore: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadData(false);
  },
});
