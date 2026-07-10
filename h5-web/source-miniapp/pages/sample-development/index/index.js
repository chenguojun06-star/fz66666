const production = require('../../../utils/api-modules/production');
const dashboard = require('../../../utils/api-modules/dashboard');
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

// 卡片底部阶段进度条配置（紧凑显示，每阶段一个 short 中文名）
const STAGE_SUMMARY_CONFIG = [
  { key: 'bom',        short: 'BOM' },
  { key: 'pattern',    short: '纸样' },
  { key: 'process',    short: '单价' },
  { key: 'secondary',  short: '二次' },
  { key: 'production', short: '制单' },
];

function formatDate(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    // 统计卡片（与 PC 端 PageStatCards 一致）
    sampleCount: 0,       // 开发中
    completedCount: 0,    // 已完成
    overdueCount: 0,      // 已延期
    totalCount: 0,        // 全部款号
    warningCount: 0,      // 临近交期（前端计算）

    // 智能提示（延期环节分组，对齐 PC 端 delayedHints）
    delayedHints: [],     // [{ stageName, count, items }]
    // 当前选中的智能提示 key（'overdue' / 'warning' / stageName）
    activeHint: '',

    list: [],
    displayList: [],  // 应用智能筛选后的展示列表
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,

    roleHint: '',
  },

  onLoad: function () {
    if (!permission.canReceiveTask('sample')) {
      this.setData({ roleHint: `您当前职务「${permission.getRoleDisplayName()}」非样衣岗，如需代领请知会主管` });
    }
    this.loadData(true);
    this.loadDelayedBreakdown();
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

  loadData: function (reset, opts) {
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
    // 首次加载拿全量（用于前端准确计算统计数字，确保统计与列表一致）
    if (reset) params.size = 200;

    production.listPatterns(params)
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
          function normalizeVal(v, sep) {
            sep = sep || '/';
            if (!v) return '';
            if (Array.isArray(v)) return v.filter(function (x) { return x != null && x !== ''; }).join(sep);
            var s = String(v);
            if (s.startsWith('[')) {
              try { return normalizeVal(JSON.parse(s), sep); } catch (e) { return s; }
            }
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
          item._season = item.season || styleInfo.season || '';

          // ========== 阶段进度摘要（紧凑 5 点进度条） ==========
          // 优先取 styleInfo 上的阶段时间字段，再兜底到 item 顶层
          item._stageSummary = STAGE_SUMMARY_CONFIG.map(function (s) {
            const completedTime = item[s.key + 'CompletedTime'] || (styleInfo && styleInfo[s.key + 'CompletedTime']) || '';
            const startTime = item[s.key + 'StartTime'] || (styleInfo && styleInfo[s.key + 'StartTime']) || '';
            let status;
            if (completedTime) status = 'completed';
            else if (startTime) status = 'in_progress';
            else status = 'not_started';
            return { key: s.key, short: s.short, status: status };
          });

          return item;
        });

        const merged = reset ? list : (that.data.list || []).concat(list);
        // ES5 数组去重（避免 new Set() 在小程序 ES6→ES5 转换时异常）
        const seenIds = [];
        const newList = merged.filter(function (item) {
          if (seenIds.indexOf(item.id) !== -1) return false;
          seenIds.push(item.id);
          return true;
        });
        that.setData({
          list: newList,
          displayList: newList,  // 默认展示全部，activeHint 切换时再过滤
          total: total,
          hasMore: newList.length < total,
          loading: false,
          loadingMore: false,
          page: reset ? 1 : that.data.page + 1,
        });

        // 从列表数据自己算统计（不依赖后端 stats API，确保和列表一致）
        if (reset) {
          let cntActive = 0;
          let cntCompleted = 0;
          let cntOverdue = 0;
          let cntWarning = 0;
          newList.forEach(function (item) {
            const node = String(item._progressNode || '').trim();
            const tone = String(item._deliveryTone || '').trim();
            const isDone = node === '已完成' || node === '已入库' || node === '样衣报废' || node === '已关单' || node === '已通过';
            if (isDone) {
              cntCompleted++;
            } else {
              cntActive++;
              if (tone === 'danger') cntOverdue++;
              if (tone === 'warning') cntWarning++;
            }
          });
          that.setData({
            totalCount: newList.length,        // 全部款号 = 列表条数
            sampleCount: cntActive,           // 开发中 = 活跃款式
            completedCount: cntCompleted,     // 已完成
            overdueCount: cntOverdue,         // 已延期（活跃的子集）
            warningCount: cntWarning,          // 临近交期（活跃的子集）
          });
        }

        // 若已有智能筛选，应用过滤
        if (that.data.activeHint || that.data.activeFilter === 'IN_PROGRESS') {
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
    // 状态筛选与智能筛选互斥：选状态时清空智能筛选
    // 注意：'IN_PROGRESS'（开发中）不传给后端，因为后端 PatternProduction.status 字段值与统计逻辑不一致，
    // 改为前端按 _progressNode 过滤
    this.setData({ activeFilter: key, activeHint: '' });
    if (key === 'IN_PROGRESS') {
      // 开发中：不传 status 给后端，前端按 _progressNode 过滤活跃款式
      this.loadData(true, { skipStatus: true });
    } else {
      this.loadData(true);
    }
  },

  /**
   * 智能提示标签点击（已延期/临近交期/XX环节延期）
   * 与状态筛选互斥
   */
  onHintTap: function (e) {
    const key = e.currentTarget.dataset.key;
    const current = this.data.activeHint;
    if (current === key) {
      this.setData({ activeHint: '', activeFilter: '' });
    } else {
      this.setData({ activeHint: key, activeFilter: '' });
    }
    this._refreshDisplayList();
  },

  /**
   * 加载延期环节分组统计（对齐 PC 端 useDelayedStageBreakdown）
   */
  loadDelayedBreakdown: function () {
    const that = this;
    dashboard.getDelayedStageBreakdown().then(function (res) {
      const d = (res && res.data) || res || {};
      const arr = Array.isArray(d.sampleDelayed) ? d.sampleDelayed : [];
      // 过滤 count > 0 的环节（与 PC 端 visibleHints 逻辑一致）
      const hints = arr.filter(function (h) { return Number(h.count) > 0; }).map(function (h) {
        return {
          stageName: h.stageName,
          count: Number(h.count) || 0,
          styleIds: Array.isArray(h.items) ? h.items.map(function (it) { return String(it.id); }) : [],
        };
      });
      that.setData({ delayedHints: hints });
    }).catch(function () { /* 静默失败 */ });
  },

  /**
   * 应用智能筛选后返回展示列表
   */
  _getDisplayList: function () {
    const hint = this.data.activeHint;
    const filter = this.data.activeFilter;
    const list = this.data.list;

    // 开发中：前端按 _progressNode 过滤活跃款式（不传 status 给后端）
    if (filter === 'IN_PROGRESS' && !hint) {
      return list.filter(function (item) {
        const node = String(item._progressNode || '').trim();
        // 活跃 = 非已完成/已入库/已报废/已关单
        if (node === '已完成' || node === '已入库' || node === '样衣报废' || node === '已关单') return false;
        return true;
      });
    }

    if (!hint) return list;
    const delayedHints = this.data.delayedHints || [];
    return list.filter(function (item) {
      if (hint === 'overdue') return item._deliveryTone === 'danger';
      if (hint === 'warning') return item._deliveryTone === 'warning';
      // 按环节名匹配：用该环节的 styleIds 判断（ES5 兼容，不用 find）
      var matched = null;
      for (var i = 0; i < delayedHints.length; i++) {
        if (delayedHints[i].stageName === hint) { matched = delayedHints[i]; break; }
      }
      if (matched && matched.styleIds.length) {
        const idStr = String(item.id || '');
        const styleIdStr = String(item.styleId || '');
        return matched.styleIds.indexOf(idStr) !== -1 || matched.styleIds.indexOf(styleIdStr) !== -1;
      }
      return false;
    });
  },

  /** smartFilter 变化时刷新展示列表 */
  _refreshDisplayList: function () {
    this.setData({ displayList: this._getDisplayList() });
  },

  /** 整卡点击：进入详情页 */
  onGoDetail: function (e) {
    const ds = e.currentTarget.dataset || {};
    const styleId = String(ds.styleId || '').trim();
    const patternId = String(ds.id || '').trim();
    console.log('[sample-dev:index] onGoDetail styleId=' + styleId + ' patternId=' + patternId, ds);
    if (!styleId && !patternId) {
      console.warn('[sample-dev:index] 缺少跳转参数，不导航');
      return;
    }
    const param = styleId ? 'styleId=' + encodeURIComponent(styleId) : 'id=' + encodeURIComponent(patternId);
    safeNavigate({
      url: '/pages/sample-development/detail/index?' + param,
    }).catch(function (err) {
      console.warn('[sample-dev:index] 导航失败:', err);
    });
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
        let patternId = scanCode;
        const trimmed = scanCode.trim();
        // 1) JSON 格式 {"type":"pattern","id":"xxx"}
        if (trimmed.charAt(0) === '{') {
          try {
            const obj = JSON.parse(trimmed);
            const id = obj.id || obj.patternId || obj.patternProductionId;
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
